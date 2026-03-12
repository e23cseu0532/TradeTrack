import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

/**
 * Groww API Integration Proxy - Optimized for reliability and active contract discovery
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
  } catch (e) {
    console.error("Expiry discovery error:", e);
  }
  return [];
}

async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_KEY;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = 'https://api.groww.in';
  
  if (!apiKey || !apiSecret) throw new Error('MISSING_CONFIG');

  const { firestore } = initializeFirebase();
  const sessionRef = doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  
  let accessToken = null;
  const sessionSnap = await getDoc(sessionRef);
  const sessionData = sessionSnap.data();

  if (sessionSnap.exists()) {
    const now = Date.now();
    const lastUpdate = sessionData.updatedAt?.toDate().getTime() || 0;
    // Token valid for 24h, refresh every 20h
    if (sessionData.token && (now - lastUpdate) < 20 * 60 * 60 * 1000) {
      accessToken = sessionData.token;
    }
  }

  if (!accessToken) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const checksum = generateChecksum(apiSecret, timestamp);
    const loginRes = await fetch(`${baseUrl}/v1/token/api/access`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
      signal: AbortSignal.timeout(10000)
    });

    if (!loginRes.ok) throw new Error(`AUTH_FAILED_${loginRes.status}`);
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

  const underlying = symbol.toUpperCase() === 'NSEI' || symbol.toUpperCase() === '^NSEI' ? 'NIFTY' : symbol.toUpperCase();
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'X-API-VERSION': '1.0', 'Accept': 'application/json' };

  // Discovery Loop: Find the first expiry with real data
  // 1. Try Default (Broker's active near-month)
  const defaultRes = await fetch(`${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}`, { headers, signal: AbortSignal.timeout(10000) });
  if (defaultRes.ok) {
    const data = await defaultRes.json();
    const payload = data.payload || data;
    if (payload.strikes && Object.keys(payload.strikes).length > 0) return payload;
  }

  // 2. Scan available expiries if default is empty
  const expiries = await fetchAvailableExpiries(underlying, accessToken);
  for (const date of expiries.slice(0, 3)) {
    const expiryRes = await fetch(`${baseUrl}/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${date}`, { headers, signal: AbortSignal.timeout(10000) });
    if (expiryRes.ok) {
      const data = await expiryRes.json();
      const payload = data.payload || data;
      if (payload.strikes && Object.keys(payload.strikes).length > 0) return payload;
    }
  }

  throw new Error('NO_ACTIVE_DATA_FOR_NEAR_EXPIRY');
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
