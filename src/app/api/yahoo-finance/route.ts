
import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';

/**
 * RapidAPI YH Finance Data Fetcher
 * Optimized for the 'yh-finance' provider by apidojo.
 */
async function fetchYHFinanceRapidAPI(symbol: string) {
  // Use the key provided by the user
  const apiKey = process.env.RAPIDAPI_KEY || '905ac8234cmsh2bd850f5de27939p1ab50cjsn14fe5ec35a0c';
  
  // Normalize symbol for NSE stocks
  let normalizedSymbol = symbol.toUpperCase();
  if (normalizedSymbol === 'NIFTY') normalizedSymbol = '^NSEI';
  else if (normalizedSymbol === 'BANKNIFTY') normalizedSymbol = '^NSEBANK';
  else if (!normalizedSymbol.includes('.') && !normalizedSymbol.startsWith('^')) {
    normalizedSymbol = `${normalizedSymbol}.NS`;
  }

  // The 'yh-finance' API by apidojo on RapidAPI
  const url = `https://yh-finance.p.rapidapi.com/stock/v2/get-options-chain?symbol=${normalizedSymbol}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'yh-finance.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    
    if (response.status === 401 || response.status === 403) {
      throw new Error(`403: Forbidden. Your RapidAPI key might be invalid or not subscribed to the 'YH Finance' API. Please ensure you have clicked 'Subscribe to Free Plan' on the RapidAPI portal.`);
    }
    
    if (response.status === 429) {
      throw new Error("429: Rate Limit Reached. RapidAPI Free Tier limits exceeded. Please switch to 'Simulation Mode' to continue testing.");
    }
    
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`RapidAPI Error: ${response.status} - ${errorBody || response.statusText}`);
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
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  // 1. Handle Option Chain via RapidAPI
  if (getOptions) {
    try {
      const data = await fetchYHFinanceRapidAPI(symbol || 'NIFTY');
      return NextResponse.json(data);
    } catch (error: any) {
      console.error("RapidAPI Fetch Failed:", error);
      return NextResponse.json({ 
        error: error.message || "Internal Server Error",
        status: error.message?.includes('403') ? 403 : error.message?.includes('429') ? 429 : 500,
        tip: error.message?.includes('403') ? "Check your RapidAPI subscription status for 'YH Finance'." : "Try Simulation Mode if limits are hit."
      }, { status: error.message?.includes('403') ? 403 : error.message?.includes('429') ? 429 : 500 });
    }
  }
  
  // 2. Standard Price/History Logic (Yahoo Chart fallback)
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const getFinancials = searchParams.get('financials') === 'true';

  let yahooSymbol = symbol?.toUpperCase() || 'NIFTY';
  if (yahooSymbol === 'NIFTY') yahooSymbol = '^NSEI';
  else if (yahooSymbol === 'BANKNIFTY') yahooSymbol = '^NSEBANK';
  else if (!yahooSymbol.includes('.') && !yahooSymbol.startsWith('^')) {
    yahooSymbol = `${yahooSymbol}.NS`;
  }

  try {
    let url = "";
    if (getFinancials) {
      const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
      const today = Math.floor(new Date().getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;
    } else if (from && to) {
      const period1 = Math.floor(new Date(from).getTime() / 1000);
      const period2 = Math.floor(new Date(to).getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${period1}&period2=${period2}&interval=1d`;
    } else {
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
    }

    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) return NextResponse.json({ error: 'Failed to fetch price data' }, { status: response.status });
    
    const data = await response.json();
    const chartResult = data.chart?.result?.[0];
    if (!chartResult) return NextResponse.json({ error: "No price data found" }, { status: 404 });

    if (getFinancials) {
        const highs = chartResult.indicators.quote[0].high.filter((p: any) => p !== null);
        const lows = chartResult.indicators.quote[0].low.filter((p: any) => p !== null);
        return NextResponse.json({
            fourWeekHigh: highs.length > 0 ? Math.max(...highs) : null,
            fourWeekLow: lows.length > 0 ? Math.min(...lows) : null,
            currentPrice: chartResult.meta.regularMarketPrice
        });
    }

    return NextResponse.json({ 
        currentPrice: chartResult.meta.regularMarketPrice, 
        high: chartResult.indicators?.quote?.[0]?.high?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.max(a, b), 0) || null,
        low: chartResult.indicators?.quote?.[0]?.low?.filter((p: any) => p !== null).reduce((a: number, b: number) => Math.min(a, b), 1000000) || null
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
