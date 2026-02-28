
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * Groww API Integration
 * Implements the Login -> Token -> Data flow to minimize API usage.
 */

async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = process.env.GROWW_API_URL;
  
  if (!apiKey || apiKey === "your_token" || apiKey.includes("...")) {
    throw new Error('MISSING_CONFIG');
  }

  if (!baseUrl) {
    throw new Error('MISSING_URL');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  // 1. Check for cached token (valid for 24h)
  let accessToken = null;
  try {
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      const data = sessionSnap.data();
      const lastUpdate = data.updatedAt?.toDate().getTime() || 0;
      const isFresh = (new Date().getTime() - lastUpdate) < 20 * 60 * 60 * 1000; // 20 hour buffer
      if (isFresh && data.token) {
        accessToken = data.token;
      }
    }
  } catch (e) {
    console.error("Token cache read error", e);
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  // 2. Fetch new token if needed
  if (!accessToken) {
    console.log("Fetching new Groww Access Token...");
    const loginUrl = `${cleanBaseUrl}/get_access_token`;
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      signal: AbortSignal.timeout(8000)
    });

    if (!loginRes.ok) {
      if (loginRes.status === 404) throw new Error(`ENDPOINT_NOT_FOUND: ${loginUrl}`);
      throw new Error(`Auth failed with status ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    accessToken = loginData.access_token || loginData.token;
    
    if (!accessToken) throw new Error('TOKEN_NOT_RECEIVED');

    // Cache the token
    await setDoc(sessionRef, {
      token: accessToken,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // 3. Fetch Data using Token
  const getNextThursday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (day <= 4) ? (4 - day) : (11 - day);
    const nextThursday = new Date(today.getTime() + diff * 24 * 60 * 60 * 1000);
    return nextThursday.toISOString().split('T')[0];
  };

  const expiry = getNextThursday();
  const dataUrl = `${cleanBaseUrl}/get_option_chain?underlying=${symbol.toUpperCase()}&expiry_date=${expiry}&exchange=NSE`;
  
  try {
    const response = await fetch(dataUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('QUOTA_EXHAUSTED');
      if (response.status === 401 || response.status === 403) {
          // Token might have expired, clear it for next run
          await setDoc(sessionRef, { token: null }, { merge: true });
          throw new Error('AUTH_FAILED');
      }
      if (response.status === 404) throw new Error(`ENDPOINT_NOT_FOUND: ${dataUrl}`);
      
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Groww API Error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    if (!data || !data.strikes) {
        throw new Error('INVALID_DATA_STRUCTURE');
    }
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
        throw new Error(`Timeout: The request to ${dataUrl} timed out.`);
    }
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

  // 1. Handle Option Chain (Groww)
  if (getOptions) {
    try {
      const data = await fetchGrowwOptionChain(symbol || 'NIFTY');
      return NextResponse.json(data);
    } catch (error: any) {
      let status = 500;
      let message = error.message;

      if (error.message === 'QUOTA_EXHAUSTED') status = 429;
      if (error.message === 'AUTH_FAILED') status = 401;
      if (error.message === 'MISSING_CONFIG') {
          status = 401;
          message = "Groww API configuration incomplete. Please add GROWW_API_TOKEN and GROWW_API_SECRET to your .env file.";
      }
      if (error.message === 'MISSING_URL') {
          status = 400;
          message = "GROWW_API_URL is not set. Please check your vendor's dashboard for the API base URL.";
      }
      if (error.message.startsWith('ENDPOINT_NOT_FOUND')) status = 404;
      
      return NextResponse.json({ error: message }, { status });
    }
  }
  
  // 2. Standard Price logic (Free Yahoo endpoint for Spot Ticker)
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
