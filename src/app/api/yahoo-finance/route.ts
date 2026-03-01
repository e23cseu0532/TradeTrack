
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfToday, getDay } from 'date-fns';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy
 * Implements strict request guarding, IP surfacing, and robust error logging
 */

function generateChecksum(secret: string, timestamp: string) {
  // Official Groww Documentation: checksum = sha256(secret + timestamp)
  const data = secret + timestamp;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getOutgoingIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { 
        signal: AbortSignal.timeout(5000),
        cache: 'no-store'
    });
    const data = await res.json();
    return data.ip || 'Unknown';
  } catch (e) {
    console.error("IP Detection failed:", e);
    return 'Unknown';
  }
}

async function fetchGrowwOptionChain(symbol: string, currentIp: string) {
  const apiKey = process.env.GROWW_API_KEY;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = 'https://api.groww.in';
  
  if (!apiKey || !apiSecret) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  let accessToken = null;
  const sessionSnap = await getDoc(sessionRef);
  const sessionData = sessionSnap.data();

  if (sessionSnap.exists()) {
    const now = new Date().getTime();

    // Check for failure back-off (5 minutes)
    const lastFailureAt = sessionData.lastFailureAt?.toDate().getTime() || 0;
    if (now - lastFailureAt < 5 * 60 * 1000) {
      throw new Error('QUOTA_EXHAUSTED');
    }

    // Check for Active Authentication Lock
    if (sessionData.isAuthenticating) {
      const lockTime = sessionData.authStartTime?.toDate().getTime() || 0;
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
      const errText = await loginRes.text();
      await setDoc(sessionRef, { isAuthenticating: false }, { merge: true });
      if (loginRes.status === 429) throw new Error('QUOTA_EXHAUSTED');
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
  
  // Success path also caches the data for public use
  const cacheRef = doc(firestore, 'optionChainData', `${underlying}_GROWW`);
  await setDoc(cacheRef, {
      snapshot: data.payload || data,
      updatedAt: serverTimestamp()
  }, { merge: true });

  return data.payload || data;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';

  if (!symbol && !getOptions) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  // Detect and surface IP immediately for ALL requests
  const currentIp = await getOutgoingIp();
  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  try {
    // Background update of IP
    setDoc(sessionRef, { lastUsedIp: currentIp }, { merge: true }).catch(() => {});

    if (getOptions) {
      try {
        const data = await fetchGrowwOptionChain(symbol || 'NIFTY', currentIp);
        return NextResponse.json(data);
      } catch (error: any) {
        const isQuota = error.message === 'QUOTA_EXHAUSTED' || error.message.includes('429');
        const isLock = error.message === 'AUTH_IN_PROGRESS';
        
        if (!isLock) {
            await setDoc(sessionRef, { 
              lastFailureAt: serverTimestamp(),
              lastError: isQuota ? 'Rate limit hit (429)' : error.message,
              isAuthenticating: false
            }, { merge: true });
        }
        
        const status = isQuota ? 429 : (isLock ? 503 : 500);
        return NextResponse.json({ error: error.message }, { status });
      }
    }
    
    // Standard Yahoo Price Fetch
    let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
    if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
    else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
    else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
      yahooSymbol = `${yahooSymbol}.NS`;
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
      signal: AbortSignal.timeout(8000)
    });

    const text = await response.text();
    if (!text || text.trim() === '' || text.trim() === 'null') {
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

    const quotes = result.indicators?.quote?.[0];
    const highs = (quotes?.high || []).filter((p: any) => p !== null);
    const lows = (quotes?.low || []).filter((p: any) => p !== null);

    return NextResponse.json({ 
        currentPrice: result.meta.regularMarketPrice,
        high: highs.length > 0 ? Math.max(...highs) : null,
        low: lows.length > 0 ? Math.min(...lows) : null
    });
  } catch (error: any) {
    console.error("Global API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
