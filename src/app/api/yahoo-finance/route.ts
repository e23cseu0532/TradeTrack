
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfToday, getDay } from 'date-fns';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy
 * Implements the Login -> Checksum -> Token -> Data flow based on curl examples.
 */

function generateChecksum(apiKey: string, secret: string, timestamp: string) {
  // Typical broker checksum: sha256(api_key + timestamp + api_secret)
  const data = apiKey + timestamp + secret;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function fetchGrowwOptionChain(symbol: string) {
  // Support both KEY and TOKEN variable names to prevent setup confusion
  const apiKey = process.env.GROWW_API_KEY || process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = process.env.GROWW_API_URL || 'https://api.groww.in/v1';
  
  if (!apiKey || apiKey.includes("your_") || !apiSecret || apiSecret.includes("your_")) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  // 1. Check for cached token (valid for 20h)
  let accessToken = null;
  try {
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      const data = sessionSnap.data();
      const lastUpdate = data.updatedAt?.toDate().getTime() || 0;
      const isFresh = (new Date().getTime() - lastUpdate) < 20 * 60 * 60 * 1000;
      if (isFresh && data.token) {
        accessToken = data.token;
      }
    }
  } catch (e) {
    console.error("Token cache read error:", e);
  }

  // Smart URL cleaning: Remove trailing slashes and redundant paths
  const cleanBaseUrl = baseUrl.replace(/\/$/, '').replace(/\/token\/api\/access$/, '');

  // 2. Fetch new token if needed
  if (!accessToken) {
    console.log("Initiating Groww Login with Checksum...");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const checksum = generateChecksum(apiKey, apiSecret, timestamp);
    
    // Explicitly target the token endpoint relative to the base
    const loginUrl = `${cleanBaseUrl}/token/api/access`;
    
    try {
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          key_type: "approval", 
          checksum: checksum, 
          timestamp: timestamp 
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!loginRes.ok) {
        if (loginRes.status === 404) throw new Error(`ENDPOINT_NOT_FOUND: ${loginUrl}`);
        const errorBody = await loginRes.text().catch(() => "Unknown error");
        throw new Error(`Auth failed (${loginRes.status}): ${errorBody}`);
      }

      const loginData = await loginRes.json();
      accessToken = loginData.access_token || loginData.token;
      
      if (!accessToken) throw new Error('TOKEN_NOT_RECEIVED');

      // Cache the token globally in Firestore
      await setDoc(sessionRef, {
        token: accessToken,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      console.error("Groww Auth Error:", err.message);
      throw err;
    }
  }

  // 3. Fetch Data using the Token
  const getNextThursday = () => {
    const today = startOfToday();
    const day = getDay(today);
    let daysUntilThursday = (4 - day + 7) % 7;
    return format(addDays(today, daysUntilThursday), 'yyyy-MM-dd');
  };

  const expiry = getNextThursday();
  const dataUrl = `${cleanBaseUrl}/fno/api/v1/option-chain?underlying=${symbol.toUpperCase()}&expiry_date=${expiry}&exchange=NSE`;
  
  try {
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
      if (response.status === 429) throw new Error('QUOTA_EXHAUSTED');
      if (response.status === 401 || response.status === 403) {
          // Clear cached token on auth failure to force re-login next time
          await setDoc(sessionRef, { token: null }, { merge: true });
          throw new Error('AUTH_FAILED');
      }
      if (response.status === 404) throw new Error(`ENDPOINT_NOT_FOUND: ${dataUrl}`);
      
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Groww Data Error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    if (!data || !data.strikes) {
        throw new Error('INVALID_DATA_STRUCTURE');
    }
    return data;
  } catch (error: any) {
    console.error("Groww Fetch Exception:", error.message);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

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
          message = "Configuration incomplete. Please add GROWW_API_KEY and GROWW_API_SECRET to your .env file.";
      }
      if (message.startsWith('ENDPOINT_NOT_FOUND')) status = 404;
      
      return NextResponse.json({ error: message }, { status });
    }
  }
  
  // Standard Price logic (Yahoo fallback for Ticker)
  let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
  if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
  else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
  else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
    yahooSymbol = `${yahooSymbol}.NS`;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) return NextResponse.json({ error: 'Market Data Unavailable' }, { status: response.status });
    
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
