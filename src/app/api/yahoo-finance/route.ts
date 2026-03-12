
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy with Enhanced Discovery
 */

function generateChecksum(secret: string, timestamp: string) {
  const data = secret + timestamp;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getOutgoingIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { 
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
    });
    if (!res.ok) return 'Unknown (API error)';
    const data = await res.json();
    return data.ip || 'Unknown';
  } catch (e) {
    return 'Unknown (Timed out)';
  }
}

async function fetchAvailableExpiries(underlying: string, accessToken: string) {
  try {
    const url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${underlying}/expiries`;
    const res = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'X-API-VERSION': '1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const data = await res.json();
      return data.expiries || data.payload?.expiries || [];
    }
  } catch (e) {
    console.error("Failed to fetch live expiries:", e);
  }
  return [];
}

async function fetchGrowwOptionChain(symbol: string, currentIp: string) {
  const apiKey = process.env.GROWW_API_KEY || process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = 'https://api.groww.in';
  
  if (!apiKey || !apiSecret) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  await setDoc(sessionRef, { lastUsedIp: currentIp, debugSecretLength: apiSecret.length }, { merge: true });

  let accessToken = null;
  const sessionSnap = await getDoc(sessionRef);
  const sessionData = sessionSnap.data();

  if (sessionSnap.exists()) {
    const now = new Date().getTime();
    const lastFailureAt = sessionData.lastFailureAt?.toDate().getTime() || 0;
    if (now - lastFailureAt < 2 * 60 * 1000) { // 2 min backoff
      throw new Error('QUOTA_EXHAUSTED');
    }
    const lastUpdate = sessionData.updatedAt?.toDate().getTime() || 0;
    const isFresh = (now - lastUpdate) < 20 * 60 * 60 * 1000;
    if (isFresh && sessionData.token) {
      accessToken = sessionData.token;
    }
  }

  if (!accessToken) {
    await setDoc(sessionRef, { isAuthenticating: true, authStartTime: serverTimestamp() }, { merge: true });
    try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const checksum = generateChecksum(apiSecret, timestamp);
        const loginUrl = `${baseUrl}/v1/token/api/access`;
        
        const loginRes = await fetch(loginUrl, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key_type: "approval", checksum: checksum, timestamp: timestamp }),
          signal: AbortSignal.timeout(10000)
        });

        if (!loginRes.ok) {
          if (loginRes.status === 429) throw new Error('QUOTA_EXHAUSTED');
          throw new Error(`Auth failed (${loginRes.status})`);
        }

        const loginData = await loginRes.json();
        accessToken = loginData.token;
        if (!accessToken) throw new Error('TOKEN_NOT_RECEIVED');

        await setDoc(sessionRef, {
          token: accessToken,
          updatedAt: serverTimestamp(),
          lastFailureAt: null,
          lastError: null,
          isAuthenticating: false
        }, { merge: true });
    } catch (e: any) {
        await setDoc(sessionRef, { isAuthenticating: false, lastError: e.message, lastFailureAt: serverTimestamp() }, { merge: true });
        throw e;
    }
  }

  const underlying = symbol.toUpperCase() === 'NSEI' || symbol.toUpperCase() === '^NSEI' ? 'NIFTY' : symbol.toUpperCase();
  
  let successfulPayload = null;
  let usedExpiry = null;
  const tried = [];

  // Attempt 1: Default endpoint (Broker's current recommendation)
  try {
    tried.push("DEFAULT_ACTIVE");
    const defaultUrl = `${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}`;
    const response = await fetch(defaultUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-API-VERSION': '1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
    });
    if (response.ok) {
        const data = await response.json();
        const p = data.payload || data;
        if (p.strikes && Object.keys(p.strikes).length > 0) {
            successfulPayload = p;
            usedExpiry = p.expiry_date || "DEFAULT";
        }
    }
  } catch (e) {
    console.error("Default discovery failed:", e);
  }

  // Attempt 2: Deep scan of available expiries (up to 5 dates)
  if (!successfulPayload) {
    const expiries = await fetchAvailableExpiries(underlying, accessToken);
    const toScan = expiries.slice(0, 5); // Scan deeper
    
    for (const expiry of toScan) {
        tried.push(expiry);
        try {
            const url = `${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${expiry}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-API-VERSION': '1.0', 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });
            if (response.ok) {
                const data = await response.json();
                const p = data.payload || data;
                if (p.strikes && Object.keys(p.strikes).length > 0) {
                    successfulPayload = p;
                    usedExpiry = expiry;
                    break;
                }
            }
        } catch (e) {
            console.error(`Expiry scan failed for ${expiry}:`, e);
        }
    }
  }

  if (!successfulPayload) {
    throw new Error('NO_DATA_AVAILABLE_IN_EXPIRIES');
  }

  const resultPayload = {
      ...successfulPayload,
      discovery_attempts: tried,
      expiry_date: usedExpiry,
      isLive: true
  };

  const cacheRef = doc(firestore, 'optionChainData', `${underlying}_GROWW`);
  await setDoc(cacheRef, {
      snapshot: resultPayload,
      updatedAt: serverTimestamp(),
      expiryDate: usedExpiry
  }, { merge: true });

  return resultPayload;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';

  if (!symbol && !getOptions) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  const currentIp = await getOutgoingIp();
  
  try {
    if (getOptions) {
      try {
        const data = await fetchGrowwOptionChain(symbol || 'NIFTY', currentIp);
        return NextResponse.json(data);
      } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: error.message === 'QUOTA_EXHAUSTED' ? 429 : 500 });
      }
    }
    
    let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
    if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
    else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
    else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
      yahooSymbol = `${yahooSymbol}.NS`;
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "Symbol not found" }, { status: 404 });

    const quotes = result.indicators?.quote?.[0];
    const highs = (quotes?.high || []).filter((p: any) => p !== null);
    const lows = (quotes?.low || []).filter((p: any) => p !== null);

    return NextResponse.json({ 
        currentPrice: result.meta.regularMarketPrice,
        high: highs.length > 0 ? Math.max(...highs) : null,
        low: lows.length > 0 ? Math.min(...lows) : null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
