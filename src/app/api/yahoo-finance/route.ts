
import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Robustly establish a session with Yahoo Finance by obtaining a valid cookie.
 */
async function getYahooSession(userAgent: string) {
  try {
    // 1. Visit fc.yahoo.com to get a session cookie. 
    // This is a common entry point to establish a Yahoo session.
    const response = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': userAgent },
      redirect: 'manual', // We don't need to follow redirects
    });

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) {
      console.warn("Yahoo Session: No cookie returned from fc.yahoo.com");
      return null;
    }

    // Extract the essential parts of the cookie (B cookie)
    return setCookie.split(';')[0];
  } catch (error) {
    console.error("Yahoo Session: Failed to prime session", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

  // --- Handle Option Chain Request (Option 1: Yahoo Finance API) ---
  if (getOptions) {
    let optionsSymbol = symbol || '^NSEI';
    if (optionsSymbol.toUpperCase() === 'NIFTY') {
      optionsSymbol = '^NSEI';
    } else if (!optionsSymbol.includes('.') && !optionsSymbol.startsWith('^')) {
      optionsSymbol = `${optionsSymbol.toUpperCase()}.NS`;
    }

    try {
      // Establish session first
      const cookie = await getYahooSession(userAgent);
      
      const url = `https://query2.finance.yahoo.com/v7/finance/options/${optionsSymbol}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json',
          'Cookie': cookie || '',
          'Origin': 'https://finance.yahoo.com',
          'Referer': `https://finance.yahoo.com/quote/${optionsSymbol}/options`
        },
        next: { revalidate: 60 } 
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ 
          error: `Yahoo API Error: ${response.status}`,
          details: errorText
        }, { status: response.status });
      }

      const data = await response.json();
      
      if (!data.optionChain || !data.optionChain.result || data.optionChain.result.length === 0) {
        return NextResponse.json({ error: "No options data found for this symbol." }, { status: 404 });
      }

      return NextResponse.json(data);

    } catch (error: any) {
      console.error("[YAHOO OPTIONS API PROXY ERROR]", error);
      return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
  }
  
  // --- Rest of the existing API route (Chart, Financials, etc.) ---
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const getFinancials = searchParams.get('financials') === 'true';
  const daysAgo = searchParams.get('daysAgo');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  let querySymbol = symbol;
  if (querySymbol.toUpperCase() === 'NIFTY') {
    querySymbol = '^NSEI';
  } else if (!querySymbol.toUpperCase().endsWith('.NS') && !querySymbol.startsWith('^')) {
    querySymbol = `${querySymbol.toUpperCase()}.NS`;
  }

  if (daysAgo) {
      const targetDate = subDays(new Date(), parseInt(daysAgo, 10));
      const period1 = Math.floor(subDays(targetDate, 5).getTime() / 1000);
      const period2 = Math.floor(addDays(targetDate, 1).getTime() / 1000);
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${period1}&period2=${period2}&interval=1d`;
      
      try {
          const chartResponse = await fetch(chartUrl, { headers: { 'User-Agent': userAgent } });
          if (!chartResponse.ok) {
              return NextResponse.json({ error: `Failed to fetch chart data` }, { status: chartResponse.status });
          }
          const chartJson = await chartResponse.json();
          const chartResult = chartJson.chart?.result?.[0];
          const timestamps = chartResult?.timestamp || [];
          const closes = chartResult?.indicators.quote[0].close || [];
          
          if (timestamps.length === 0) {
              return NextResponse.json({ error: "No historical data found" }, { status: 404 });
          }

          const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
          let closestIndex = -1;
          let smallestDiff = Infinity;

          for (let i = 0; i < timestamps.length; i++) {
              const diff = Math.abs(timestamps[i] - targetTimestamp);
              if (diff < smallestDiff) {
                  smallestDiff = diff;
                  closestIndex = i;
              }
          }

          if (closestIndex !== -1 && closes[closestIndex] !== null) {
              return NextResponse.json({ previousClose: closes[closestIndex] });
          } else {
              return NextResponse.json({ error: "Valid close price not found" }, { status: 404 });
          }
      } catch (error: any) {
          return NextResponse.json({ error: error.message }, { status: 500 });
      }
  }

  if (getFinancials) {
    const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
    const today = Math.floor(new Date().getTime() / 1000);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;

    try {
      const chartResponse = await fetch(chartUrl, { headers: { 'User-Agent': userAgent } });
      if (!chartResponse.ok) return NextResponse.json({ error: "Failed to fetch financials" }, { status: chartResponse.status });
      const chartJson = await chartResponse.json();
      const chartResult = chartJson.chart?.result?.[0];
      if (!chartResult) return NextResponse.json({ error: "No financial data found" }, { status: 404 });

      const highValues = chartResult?.indicators.quote[0].high.filter((p: number | null): p is number => p !== null) || [];
      const lowValues = chartResult?.indicators.quote[0].low.filter((p: number | null): p is number => p !== null) || [];
      const data = {
        fourWeekHigh: highValues.length > 0 ? Math.max(...highValues) : null,
        fourWeekLow: lowValues.length > 0 ? Math.min(...lowValues) : null,
        currentPrice: chartResult.meta?.regularMarketPrice,
      };
      return NextResponse.json(data);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required query parameters' }, { status: 400 });
  }

  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) return NextResponse.json({ error: 'Failed to fetch data' }, { status: response.status });
    const data = await response.json();
    const chartResult = data.chart?.result?.[0];
    if (!chartResult) return NextResponse.json({ error: "No data found" }, { status: 404 });

    const quote = chartResult.indicators?.quote?.[0];
    const highValues = quote?.high?.filter((p: number | null): p is number => p !== null) || [];
    const lowValues = quote?.low?.filter((p: number | null): p is number => p !== null) || [];
    
    return NextResponse.json({ 
        currentPrice: chartResult.meta.regularMarketPrice, 
        high: highValues.length > 0 ? Math.max(...highValues) : null, 
        low: lowValues.length > 0 ? Math.min(...lowValues) : null 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
