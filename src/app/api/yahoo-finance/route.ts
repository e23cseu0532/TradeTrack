
import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Integration
 * Fetches the option chain from your 45-day trial provider.
 */
async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_TOKEN;
  const baseUrl = process.env.GROWW_API_URL || 'https://api.growwapi.com/v1';
  
  // Return a specific error code if the key is missing or is the placeholder
  if (!apiKey || apiKey === 'your_token') {
    throw new Error('CONFIG_MISSING');
  }

  // Expiry date calculation (Ideally dynamic, using user's documentation example for now)
  const expiry = "2025-11-28"; 

  const url = `${baseUrl}/get_option_chain?underlying=${symbol.toUpperCase()}&expiry_date=${expiry}&exchange=NSE`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('QUOTA_EXHAUSTED');
      if (response.status === 401 || response.status === 403) throw new Error('AUTH_FAILED');
      throw new Error(`Groww API Error: ${response.status}`);
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
      if (error.message === 'CONFIG_MISSING') {
        return NextResponse.json({ error: "Missing GROWW_API_TOKEN in environment variables." }, { status: 401 });
      }
      if (error.message === 'QUOTA_EXHAUSTED') {
        return NextResponse.json({ error: "Groww API Limit Reached." }, { status: 429 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
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
