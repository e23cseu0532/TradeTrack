
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfToday, getDay } from 'date-fns';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy - Strictly Aligned with official Documentation
 */

function generateChecksum(secret: string, timestamp: string) {
  // Documentation: input_str = secret + timestamp
  const data = secret + timestamp;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_KEY || process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = (process.env.GROWW_API_URL || 'https://api.groww.in').replace(/\/+$/, '');
  
  if (!apiKey || !apiSecret) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  // Wrap everything in a top-level try/catch to ensure we log failures to Firestore
  try {
    let accessToken = null;
    try {
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        const data = sessionSnap.data();
        const now = new Date().getTime();

        const lastFailureAt = data.lastFailureAt?.toDate().getTime() || 0;
        // 5-minute back-off for failures to prevent lockout spirals
        if (now - lastFailureAt < 5 * 60 * 1000) {
          throw new Error('QUOTA_EXHAUSTED');
        }

        const lastUpdate = data.updatedAt?.toDate().getTime() || 0;
        // Tokens expire at 6 AM daily
        const isFresh = (now - lastUpdate) < 20 * 60 * 60 * 1000;
        if (isFresh && data.token) {
          accessToken = data.token;
        }
      }
    } catch (e: any) {
      if (e.message === 'QUOTA_EXHAUSTED') throw e;
      console.error("[Groww Proxy] Session read error:", e);
    }

    // AUTHENTICATION PHASE
    if (!accessToken) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const checksum = generateChecksum(apiSecret, timestamp);
      const loginUrl = `${baseUrl}/v1/token/api/access`;
      
      let loginRes;
      try {
        loginRes = await fetch(loginUrl, {
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
      } catch (err: any) {
        throw new Error(`Connection failed at login: ${err.message}`);
      }

      const contentType = loginRes.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await loginRes.text();
        throw new Error(`Login endpoint returned non-JSON (${loginRes.status}): ${text.slice(0, 100)}`);
      }

      const loginData = await loginRes.json();

      if (!loginRes.ok || loginData.status === 'FAILURE') {
        const errorMsg = loginData.error?.message || loginData.error || JSON.stringify(loginData);
        if (loginRes.status === 429) throw new Error('QUOTA_EXHAUSTED');
        throw new Error(`Auth failed (${loginRes.status}): ${errorMsg}`);
      }

      accessToken = loginData.token;
      
      if (!accessToken) throw new Error('TOKEN_NOT_RECEIVED');

      await setDoc(sessionRef, {
        token: accessToken,
        updatedAt: serverTimestamp(),
        lastFailureAt: null,
        lastError: null
      }, { merge: true });
    }

    // DATA FETCHING PHASE
    const getNextThursday = () => {
      const today = startOfToday();
      const day = getDay(today);
      let daysUntilThursday = (4 - day + 7) % 7;
      if (day === 4 && new Date().getHours() >= 16) {
          daysUntilThursday = 7;
      }
      return format(addDays(today, daysUntilThursday), 'yyyy-MM-dd');
    };

    const expiry = getNextThursday();
    const underlying = symbol.toUpperCase() === 'NSEI' || symbol.toUpperCase() === '^NSEI' ? 'NIFTY' : symbol.toUpperCase();
    
    const dataUrl = `${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${expiry}`;
    
    let response;
    try {
      response = await fetch(dataUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-API-VERSION': '1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });
    } catch (err: any) {
      throw new Error(`Connection failed at data fetch: ${err.message}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Data endpoint returned non-JSON (${response.status}): ${text.slice(0, 100)}`);
    }

    const data = await response.json();

    if (!response.ok || data.status === 'FAILURE') {
      if (response.status === 429) {
          throw new Error('QUOTA_EXHAUSTED');
      }
      if (response.status === 401 || response.status === 403) {
          await setDoc(sessionRef, { token: null }, { merge: true });
          throw new Error('AUTH_FAILED');
      }
      const errorMsg = data.error?.message || JSON.stringify(data);
      throw new Error(`Groww Data Error (${response.status}): ${errorMsg}`);
    }

    return data.payload;

  } catch (error: any) {
    // Log the error to Firestore before throwing
    const isQuota = error.message === 'QUOTA_EXHAUSTED';
    await setDoc(sessionRef, { 
      lastFailureAt: serverTimestamp(),
      lastError: isQuota ? 'Rate limit hit (429)' : error.message
    }, { merge: true });
    
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
      let status = 500;
      let message = error.message;
      if (message === 'QUOTA_EXHAUSTED') status = 429;
      if (message === 'AUTH_FAILED') status = 401;
      if (message === 'MISSING_CONFIG') {
          status = 401;
          message = "Configuration incomplete. Please check your GROWW_API_KEY and SECRET.";
      }
      return NextResponse.json({ error: message }, { status });
    }
  }
  
  let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
  if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
  else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
  else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
    yahooSymbol = `${yahooSymbol}.NS`;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return NextResponse.json({ error: 'Market Data Unavailable' }, { status: response.status });
    
    // Safety check for JSON content type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return NextResponse.json({ error: "Yahoo returned non-JSON response" }, { status: 502 });
    }

    const data = await response.json();
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
