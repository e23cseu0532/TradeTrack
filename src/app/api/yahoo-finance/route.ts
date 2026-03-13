import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy - Robust Auto-Discovery Version
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
    if (!res.ok) return 'Unknown';
    const data = await res.json();
    return data.ip || 'Unknown';
  } catch (e) {
    return 'Unknown';
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
    // If not ok, return the status to help debugging
    console.error(`Expiry fetch failed with status: ${res.status}`);
  } catch (e) {
    console.error("Expiry discovery error:", e);
  }
  return [];
}

async function fetchGrowwOptionChain(symbol: string) {
  const envToken = process.env.GROWW_API_TOKEN;
  const apiKey = process.env.GROWW_API_KEY || envToken;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = 'https://api.groww.in';
  
  if (!apiKey && !envToken) throw new Error('MISSING_CONFIG: No Token or API Key found in .env');

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  let accessToken = null;

  // Logic: Use provided JWT directly if available
  if (envToken?.startsWith('ey')) {
    accessToken = envToken;
  } else {
    const sessionSnap = await getDoc(sessionRef);
    const sessionData = sessionSnap.data();

    if (sessionSnap.exists()) {
      const now = Date.now();
      const lastUpdate = sessionData.updatedAt?.toDate().getTime() || 0;
      if (sessionData.token && (now - lastUpdate) < 20 * 60 * 60 * 1000) {
        accessToken = sessionData.token;
      }
    }

    if (!accessToken && apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const checksum = generateChecksum(apiSecret, timestamp);
      const loginRes = await fetch(`${baseUrl}/v1/token/api/access`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
        signal: AbortSignal.timeout(10000)
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        accessToken = loginData.token;
        const currentIp = await getOutgoingIp();
        await setDoc(sessionRef, { 
          token: accessToken, 
          updatedAt: serverTimestamp(), 
          lastUsedIp: currentIp, 
          debugSecretLength: apiSecret.length 
        }, { merge: true });
      }
    }
  }

  if (!accessToken) throw new Error('AUTH_FAILED: No valid token available.');

  const underlying = symbol.toUpperCase() === 'NSEI' || symbol.toUpperCase() === '^NSEI' || symbol.toUpperCase() === 'NIFTY' ? 'NIFTY' : symbol.toUpperCase();
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'X-API-VERSION': '1.0', 'Accept': 'application/json' };

  // 1. Try Default Endpoint
  try {
    const defaultRes = await fetch(`${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}`, { headers, signal: AbortSignal.timeout(10000) });
    if (defaultRes.ok) {
      const data = await defaultRes.json();
      const payload = data.payload || data;
      if (payload.strikes && Object.keys(payload.strikes).length > 0) return { ...payload, source: 'default_endpoint' };
    }
  } catch (e) {}

  // 2. Auto-Discovery
  const expiries = await fetchAvailableExpiries(underlying, accessToken);
  for (const date of expiries.slice(0, 5)) {
    try {
      const expiryRes = await fetch(`${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${date}`, { headers, signal: AbortSignal.timeout(10000) });
      if (expiryRes.ok) {
        const data = await expiryRes.json();
        const payload = data.payload || data;
        if (payload.strikes && Object.keys(payload.strikes).length > 0) return { ...payload, source: `discovered_${date}` };
      }
    } catch (e) {}
  }

  throw new Error(`NO_ACTIVE_DATA_FOR_NEAR_EXPIRY: Tried ${expiries.length} expiry dates for ${underlying} but found no active strikes.`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const getOptions = searchParams.get('options') === 'true';

  try {
    if (getOptions) {
      const data = await fetchGrowwOptionChain(symbol);
      return NextResponse.json(data);
    }
    
    let yahooSymbol = symbol.toUpperCase();
    if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
    else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) yahooSymbol = `${yahooSymbol}.NS`;

    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "Symbol not found" }, { status: 404 });

    return NextResponse.json({ currentPrice: result.meta.regularMarketPrice });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
