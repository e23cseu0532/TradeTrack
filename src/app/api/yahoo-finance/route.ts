
import { NextRequest, NextResponse } from 'next/server';
import { addDays } from 'date-fns';

/**
 * Yahoo Finance 15 RapidAPI Data Fetcher
 * Optimized for the 'yahoo-finance15' provider from your screenshot.
 */
async function fetchYHFinance15RapidAPI(symbol: string) {
  const apiKey = '905ac8234cmsh2bd850f5de27939p1ab50cjsn14fe5ec35a0c';
  
  // Normalize symbol for NSE stocks
  let normalizedSymbol = symbol.toUpperCase();
  if (normalizedSymbol === 'NIFTY') normalizedSymbol = '^NSEI';
  else if (normalizedSymbol === 'BANKNIFTY') normalizedSymbol = '^NSEBANK';
  else if (!normalizedSymbol.includes('.') && !normalizedSymbol.startsWith('^')) {
    normalizedSymbol = `${normalizedSymbol}.NS`;
  }

  // Use the endpoint from the user's screenshot
  const url = `https://yahoo-finance15.p.rapidapi.com/api/v1/markets/options?ticker=${normalizedSymbol}`;
  
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    
    if (response.status === 401 || response.status === 403) {
      throw new Error(`403: Forbidden. Please ensure you have subscribed to the 'Yahoo Finance 15' API on RapidAPI.`);
    }
    
    if (response.status === 404) {
      throw new Error(`404: Endpoint Not Found. The symbol '${normalizedSymbol}' may not be supported by this specific provider.`);
    }

    if (response.status === 429) {
      throw new Error("429: Rate Limit Reached. Please switch to 'Simulation Mode' while your quota resets.");
    }
    
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`RapidAPI Error: ${response.status} - ${errorBody || response.statusText}`);
    }
    
    const data = await response.json();
    
    // Validate the result structure based on provided example
    if (!data.optionChain?.result?.[0]) {
        throw new Error("Invalid API response structure: missing optionChain result.");
    }

    // Return the raw structure or slightly normalized for our frontend
    return data;
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

  // 1. Handle Option Chain via RapidAPI (Yahoo Finance 15)
  if (getOptions) {
    try {
      const data = await fetchYHFinance15RapidAPI(symbol || 'NIFTY');
      return NextResponse.json(data);
    } catch (error: any) {
      console.error("RapidAPI Fetch Failed:", error);
      return NextResponse.json({ 
        error: error.message || "Internal Server Error",
        status: error.message?.includes('403') ? 403 : error.message?.includes('404') ? 404 : error.message?.includes('429') ? 429 : 500,
        tip: error.message?.includes('403') ? "Check your RapidAPI subscription for 'Yahoo Finance 15'." : "Try Simulation Mode if limits are hit."
      }, { status: error.message?.includes('403') ? 403 : error.message?.includes('404') ? 404 : error.message?.includes('429') ? 429 : 500 });
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
