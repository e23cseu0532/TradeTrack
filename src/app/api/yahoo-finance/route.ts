
import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Integration
 * This proxy handles the authentication and request formatting for the Groww FNO API.
 */
async function fetchGrowwOptionChain(symbol: string) {
  // Use user-provided credentials from the environment variables.
  const apiKey = process.env.GROWW_API_TOKEN;
  const apiSecret = process.env.GROWW_API_SECRET;
  const baseUrl = process.env.GROWW_API_URL || 'https://api.growwapi.com/v1';
  
  // Check if configuration is present
  if (!apiKey || apiKey === "your_token") {
    throw new Error('MISSING_CONFIG');
  }

  // Calculate next Thursday for expiry (standard NIFTY expiry day)
  const getNextThursday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (day <= 4) ? (4 - day) : (11 - day);
    const nextThursday = new Date(today.getTime() + diff * 24 * 60 * 60 * 1000);
    return nextThursday.toISOString().split('T')[0];
  };

  const expiry = getNextThursday();
  const url = `${baseUrl}/get_option_chain?underlying=${symbol.toUpperCase()}&expiry_date=${expiry}&exchange=NSE`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Secret': apiSecret || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('QUOTA_EXHAUSTED');
      if (response.status === 401 || response.status === 403) throw new Error('AUTH_FAILED');
      if (response.status === 404) throw new Error('ENDPOINT_NOT_FOUND');
      throw new Error(`Groww API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.strikes) {
        throw new Error('INVALID_DATA_STRUCTURE');
    }
    return data;
  } catch (error: any) {
    console.error("Groww API Proxy Exception:", error.message);
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
      if (error.message === 'QUOTA_EXHAUSTED') status = 429;
      if (error.message === 'AUTH_FAILED' || error.message === 'MISSING_CONFIG') status = 401;
      if (error.message === 'ENDPOINT_NOT_FOUND') status = 404;
      
      return NextResponse.json({ error: error.message }, { status });
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
    if (!response.ok) return NextResponse.json({ error: 'Failed' }, { status: response.status });
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ 
        currentPrice: result.meta.regularMarketPrice,
        high: result.indicators?.quote?.[0]?.high?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.max(a, b), 0) || null,
        low: result.indicators?.quote?.[0]?.low?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.min(a, b), 1000000) || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
