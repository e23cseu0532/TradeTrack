
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfToday, getDay } from 'date-fns';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy
 * Implements strict request guarding and IP surfacing
 */

function generateChecksum(secret: string, timestamp: string) {
  // Documentation: checksum = sha256(secret + timestamp)
  const data = secret + timestamp;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getOutgoingIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.ip;
  } catch (e) {
    return 'Unknown';
  }
}

async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_KEY;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = (process.env.GROWW_API_URL || 'https://api.groww.in').replace(/\/+$/, '');
  
  if (!apiKey || !apiSecret) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  // 1. Surfacing IP for Whitelisting verification
  const currentIp = await getOutgoingIp();

  try {
    let accessToken = null;
    const sessionSnap = await getDoc(sessionRef);
    const sessionData = sessionSnap.data();

    if (sessionSnap.exists()) {
      const now = new Date().getTime();

      // Check for failure back-off
      const lastFailureAt = sessionData.lastFailureAt?.toDate().getTime() || 0;
      if (now - lastFailureAt < 5 * 60 * 1000) {
        throw new Error('QUOTA_EXHAUSTED');
      }

      // Check for Active Authentication Lock (Request Guarding)
      if (sessionData.isAuthenticating) {
        const lockTime = sessionData.authStartTime?.toDate().getTime() || 0;
        // Lock expires after 30 seconds to prevent permanent deadlocks
        if (now - lockTime < 30000) {
          throw new Error('AUTH_IN_PROGRESS');
        }
      }

      const lastUpdate = sessionData.updatedAt?.toDate().getTime() || 0;
      const isFresh = (now - lastUpdate) < 20 * 60 * 60 * 1000;
      if (isFresh && sessionData.token) {
        accessToken = sessionData.token;
      }
    }

    if (!accessToken) {
      // SET AUTH LOCK
      await setDoc(sessionRef, { 
        isAuthenticating: true, 
        authStartTime: serverTimestamp(),
        lastUsedIp: currentIp 
      }, { merge: true });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const checksum = generateChecksum(apiSecret, timestamp);
      const loginUrl = `${baseUrl}/v1/token/api/access`;
      
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-API-VERSION': '1.0'
        },
        body: JSON.stringify({ 
          key_type: "approval", 
          checksum: checksum, 
          timestamp: timestamp 
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!loginRes.ok) {
        // RELEASE LOCK ON FAILURE
        await setDoc(sessionRef, { isAuthenticating: false }, { merge: true });
        if (loginRes.status === 429) throw new Error('QUOTA_EXHAUSTED');
        const errText = await loginRes.text();
        throw new Error(`Auth failed (${loginRes.status}) at ${loginUrl}: ${errText.slice(0, 100)}`);
      }

      const loginData = await loginRes.json();
      accessToken = loginData.token;

      if (!accessToken) {
        await setDoc(sessionRef, { isAuthenticating: false }, { merge: true });
        throw new Error('TOKEN_NOT_RECEIVED');
      }

      // SUCCESS: Save token and release lock
      await setDoc(sessionRef, {
        token: accessToken,
        updatedAt: serverTimestamp(),
        lastFailureAt: null,
        lastError: null,
        isAuthenticating: false,
        lastUsedIp: currentIp
      }, { merge: true });
    }

    const getNextThursday = () => {
      const today = startOfToday();
      const day = getDay(today);
      let daysUntilThursday = (4 - day + 7) % 7;
      if (day === 4 && new Date().getHours() >= 16) daysUntilThursday = 7;
      return format(addDays(today, daysUntilThursday), 'yyyy-MM-dd');
    };

    const expiry = getNextThursday();
    const underlying = symbol.toUpperCase() === 'NSEI' || symbol.toUpperCase() === '^NSEI' ? 'NIFTY' : symbol.toUpperCase();
    const dataUrl = `${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${expiry}`;
    
    const response = await fetch(dataUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-API-VERSION': '1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
          await setDoc(sessionRef, { token: null }, { merge: true });
          throw new Error('AUTH_FAILED');
      }
      throw new Error(`Data fetch failed (${response.status})`);
    }

    const data = await response.json();
    return data.payload || data; // Handle both direct and status/payload wraps

  } catch (error: any) {
    const isQuota = error.message === 'QUOTA_EXHAUSTED';
    const isLock = error.message === 'AUTH_IN_PROGRESS';
    
    if (!isLock) {
        await setDoc(sessionRef, { 
          lastFailureAt: serverTimestamp(),
          lastError: isQuota ? 'Rate limit hit (429)' : error.message,
          isAuthenticating: false,
          lastUsedIp: currentIp
        }, { merge: true });
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';

  if (!symbol && !getOptions) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  if (getOptions) {
    try {
      const data = await fetchGrowwOptionChain(symbol || 'NIFTY');
      return NextResponse.json(data);
    } catch (error: any) {
      const status = error.message === 'QUOTA_EXHAUSTED' ? 429 : (error.message === 'AUTH_IN_PROGRESS' ? 503 : 500);
      return NextResponse.json({ error: error.message }, { status });
    }
  }
  
  let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
  if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
  else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
  else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
    yahooSymbol = `${yahooSymbol}.NS`;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
      signal: AbortSignal.timeout(8000)
    });

    const text = await response.text();
    if (!text || text.trim() === 'null' || text.startsWith('null')) {
        return NextResponse.json({ error: "Yahoo returned empty data" }, { status: 502 });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON from Yahoo" }, { status: 502 });
    }

    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "Symbol not found" }, { status: 404 });

    return NextResponse.json({ 
        currentPrice: result.meta.regularMarketPrice,
        high: result.indicators?.quote?.[0]?.high?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.max(a, b), 0) || null,
        low: result.indicators?.quote?.[0]?.low?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.min(a, b), 1000000) || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
