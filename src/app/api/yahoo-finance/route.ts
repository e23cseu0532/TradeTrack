
import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';

/**
 * Groww API Integration (Third-party bridge)
 * Uses the API_AUTH_TOKEN and base URL provided in your subscription.
 */
async function fetchGrowwOptionChain(symbol: string) {
  const apiKey = process.env.GROWW_API_TOKEN || 'your_token';
  const baseUrl = process.env.GROWW_API_URL || 'https://api.growwapi.com/v1'; // Adjust based on your provider
  
  // Expiry date calculation (Defaulting to a generic Thursday or using NIFTY logic)
  const expiry = "2025-11-28"; // In production, this should be dynamic

  const url = `${baseUrl}/get_option_chain?underlying=${symbol}&expiry_date=${expiry}&exchange=NSE`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
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
  const useGroww = searchParams.get('source') === 'groww';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  if (!symbol && !getOptions) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  // 1. Handle Option Chain (Groww or RapidAPI fallback)
  if (getOptions) {
    try {
      if (useGroww || process.env.GROWW_API_TOKEN) {
        const data = await fetchGrowwOptionChain(symbol || 'NIFTY');
        return NextResponse.json(data);
      }
      // Fallback logic for previous RapidAPI if needed
      return NextResponse.json({ error: "No active subscription found. Switch to Simulation Mode." }, { status: 429 });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  
  // 2. Standard Price logic (Free Yahoo endpoint)
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
