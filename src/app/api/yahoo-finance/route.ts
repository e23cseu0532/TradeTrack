
import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { addDays, format, startOfToday, getDay } from 'date-fns';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy with Robust URL Handling
 */

function generateChecksum(apiKey: string, secret: string, timestamp: string) {
  // Typical broker checksum: sha256(api_key + secret + timestamp)
  const data = apiKey + secret + timestamp;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Intelligent URL builder that prevents common mistakes like missing /v1 
 * or double-pathing (/v1/v1/...).
 */
function buildGrowwUrl(baseUrl: string, path: string) {
  let base = baseUrl.trim().replace(/\/+$/, '');
  let targetPath = path.trim().replace(/^\/+/, '');

  // If the base already contains the target path, don't append it again
  if (base.toLowerCase().endsWith(targetPath.toLowerCase())) {
    return base;
  }

  // Handle common prefix overlap to prevent double-pathing
  const targetSegments = targetPath.split('/');
  for (let i = targetSegments.length; i > 0; i--) {
    const prefix = targetSegments.slice(0, i).join('/');
    if (base.toLowerCase().endsWith(prefix.toLowerCase())) {
      const suffix = targetSegments.slice(i).join('/');
      return suffix ? `${base}/${suffix}` : base;
    }
  }

  // If the base is just the domain, ensure /v1 is injected if not already in the path
  if (!base.toLowerCase().includes('/v1') && !targetPath.toLowerCase().startsWith('v1/')) {
    base = `${base}/v1`;
  }

  return `${base}/${targetPath}`;
}

async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_KEY || process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = process.env.GROWW_API_URL || 'https://api.groww.in/v1';
  
  if (!apiKey || !apiSecret) {
    throw new Error('MISSING_CONFIG');
  }

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  // 1. Check for cached token and Failure Back-off
  let accessToken = null;
  try {
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      const data = sessionSnap.data();
      const now = new Date().getTime();

      // Check for Active Back-off (5-minute window)
      const lastFailureAt = data.lastFailureAt?.toDate().getTime() || 0;
      if (now - lastFailureAt < 5 * 60 * 1000) {
        console.warn("[Groww Proxy] Back-off active. Cooling down for 5 minutes.");
        throw new Error('QUOTA_EXHAUSTED');
      }

      // Check for Fresh Token (valid for 20h)
      const lastUpdate = data.updatedAt?.toDate().getTime() || 0;
      const isFresh = (now - lastUpdate) < 20 * 60 * 60 * 1000;
      if (isFresh && data.token) {
        accessToken = data.token;
      }
    }
  } catch (e: any) {
    if (e.message === 'QUOTA_EXHAUSTED') throw e;
    console.error("[Groww Proxy] Session read error:", e);
  }

  // 2. Fetch new token if needed
  if (!accessToken) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const checksum = generateChecksum(apiKey, apiSecret, timestamp);
    const loginUrl = buildGrowwUrl(baseUrl, '/token/api/access');
    
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
        // Record failure to trigger back-off with URL debugging
        await setDoc(sessionRef, { 
          lastFailureAt: serverTimestamp(),
          lastError: `Auth failed (${loginRes.status}) at ${loginUrl}`
        }, { merge: true });

        if (loginRes.status === 429) throw new Error('QUOTA_EXHAUSTED');
        const errorBody = await loginRes.text().catch(() => "Unknown error");
        throw new Error(`Auth failed (${loginRes.status}): ${errorBody}`);
      }

      const loginData = await loginRes.json();
      accessToken = loginData.access_token || loginData.token;
      
      if (!accessToken) throw new Error('TOKEN_NOT_RECEIVED');

      // Success: Clear back-off and save token
      await setDoc(sessionRef, {
        token: accessToken,
        updatedAt: serverTimestamp(),
        lastFailureAt: null,
        lastError: null
      }, { merge: true });
    } catch (err: any) {
      if (err.message === 'QUOTA_EXHAUSTED') throw err;
      throw err;
    }
  }

  // 3. Fetch Data using the Token
  const getNextThursday = () => {
    const today = startOfToday();
    const day = getDay(today);
    let daysUntilThursday = (4 - day + 7) % 7;
    // If it is Thursday, check if it's past market hours
    if (day === 4 && new Date().getHours() >= 16) {
        daysUntilThursday = 7;
    }
    return format(addDays(today, daysUntilThursday), 'yyyy-MM-dd');
  };

  const expiry = getNextThursday();
  const dataUrl = buildGrowwUrl(baseUrl, `/fno/api/v1/option-chain?underlying=${symbol.toUpperCase()}&expiry_date=${expiry}&exchange=NSE`);
  
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
      if (response.status === 429) {
          await setDoc(sessionRef, { lastFailureAt: serverTimestamp(), lastError: 'Rate limit hit during data fetch' }, { merge: true });
          throw new Error('QUOTA_EXHAUSTED');
      }
      if (response.status === 401 || response.status === 403) {
          await setDoc(sessionRef, { token: null, lastError: 'Session expired during data fetch' }, { merge: true });
          throw new Error('AUTH_FAILED');
      }
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Groww Data Error ${response.status}: ${errorBody}`);
    }

    return await response.json();
  } catch (error: any) {
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
  
  // Fallback to Yahoo for Spot Price
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
