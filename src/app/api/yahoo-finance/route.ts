
import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays, format } from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  // --- Handle Option Chain Request ---
  if (getOptions) {
    const optionSymbol = symbol?.toUpperCase() === 'NIFTY' ? '%5ENSEI' : symbol;
    if (!optionSymbol) {
      return NextResponse.json({ error: 'Missing symbol for options request' }, { status: 400 });
    }
    
    try {
      // STEP 1: Visit a generic page to get an initial session cookie. This is more reliable.
      const pageResponse = await fetch(`https://finance.yahoo.com`, {
          headers: { 'User-Agent': userAgent }
      });
      
      if (!pageResponse.ok) {
          throw new Error(`Failed to load Yahoo Finance page to get credentials. Status: ${pageResponse.status}`);
      }

      // STEP 2: Extract cookies using a robust method that handles multiple 'set-cookie' headers.
      let cookies: string[] = [];
      const rawHeaders = (pageResponse.headers as any).raw?.();
      
      if (rawHeaders && rawHeaders['set-cookie']) {
        cookies = rawHeaders['set-cookie'];
      } else {
        // Fallback for environments where .raw() is not available
         pageResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
              cookies.push(value);
            }
        });
      }

      if (cookies.length === 0) {
          throw new Error('Failed to retrieve a valid cookie from Yahoo Finance page response.');
      }
      
      const cookie = cookies.map(c => c.split(';')[0]).join('; ');
      
      // STEP 3: Use the session cookie to fetch a crumb.
      const crumbResponse = await fetch(`https://query1.finance.yahoo.com/v1/test/getcrumb`, {
          headers: { 
              'User-Agent': userAgent,
              'Cookie': cookie,
          }
      });
      
      if (!crumbResponse.ok) {
          const errorText = await crumbResponse.text();
          throw new Error(`Failed to fetch Yahoo auth crumb. Status: ${crumbResponse.status}, Message: ${errorText}`);
      }

      const crumb = await crumbResponse.text();
      if (!crumb || crumb.includes('<')) {
        throw new Error('Failed to retrieve a valid crumb from Yahoo Finance.');
      }

      // STEP 4: Use the cookie and crumb to fetch the actual options data.
      const url = `https://query2.finance.yahoo.com/v7/finance/options/${optionSymbol}?crumb=${crumb}`;
      const response = await fetch(url, { 
        headers: {
          'User-Agent': userAgent,
          'Cookie': cookie,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ error: `Failed to fetch option data from Yahoo Finance: ${errorText}` }, { status: response.status });
      }

      const json = await response.json();
      const optionChain = json.optionChain?.result?.[0];

      if (!optionChain) {
        return NextResponse.json({ error: 'Invalid or empty data structure from Yahoo Finance API.' }, { status: 500 });
      }
      
      const nearestExpiration = optionChain.options?.[0];
      
      if (!nearestExpiration) {
        return NextResponse.json({ error: 'No options data found for the nearest expiration.' }, { status: 404 });
      }

      const transformOptionData = (d: any) => ({
          strikePrice: d.strike,
          ltp: d.lastPrice,
          iv: d.impliedVolatility,
          oi: d.openInterest,
      });

      const snapshot = {
        timestamp: new Date(optionChain.quote.regularMarketTime * 1000).toISOString(),
        underlyingValue: optionChain.quote.regularMarketPrice,
        calls: nearestExpiration.calls.map(transformOptionData),
        puts: nearestExpiration.puts.map(transformOptionData),
      };

      return NextResponse.json({ snapshot });

    } catch (error: any) {
      console.error("[YAHOO OPTIONS API PROXY ERROR]", error);
      return NextResponse.json({ error: `Yahoo Options API Error: ${error.message}` }, { status: 500 });
    }
  }
  
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const getFinancials = searchParams.get('financials') === 'true';
  const daysAgo = searchParams.get('daysAgo');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  if (!symbol.toUpperCase().endsWith('.NS')) {
    symbol = `${symbol.toUpperCase()}.NS`;
  }

  // --- Handle request for a specific day's close price (for Gann Calculator) ---
  if (daysAgo) {
      const targetDate = subDays(new Date(), parseInt(daysAgo, 10));
      const period1 = Math.floor(subDays(targetDate, 5).getTime() / 1000); // Fetch a small window
      const period2 = Math.floor(addDays(targetDate, 1).getTime() / 1000);
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
      
      try {
          const chartResponse = await fetch(chartUrl, { headers: { 'User-Agent': userAgent } });
          if (!chartResponse.ok) {
              const errorText = await chartResponse.text();
              return NextResponse.json({ error: `Failed to fetch chart data: ${errorText}` }, { status: chartResponse.status });
          }
          
          const chartJson = await chartResponse.json();
          if (chartJson.chart.error) {
              return NextResponse.json({ error: `Yahoo Finance API Error: ${chartJson.chart.error.description}` }, { status: 404 });
          }
          
          const chartResult = chartJson.chart?.result?.[0];
          const timestamps = chartResult?.timestamp || [];
          const closes = chartResult?.indicators.quote[0].close || [];
          
          if (timestamps.length === 0) {
              return NextResponse.json({ error: `No historical data found for symbol ${symbol} around the specified date.` }, { status: 404 });
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
              return NextResponse.json({ error: "Could not find a valid closing price for the selected date." }, { status: 404 });
          }

      } catch (error: any) {
          console.error('Error fetching single day close from proxy:', error);
          return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
      }
  }

  // --- Handle request for financial data ---
  if (getFinancials) {
    const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
    const today = Math.floor(new Date().getTime() / 1000);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;

    try {
      const chartResponse = await fetch(chartUrl, { headers: { 'User-Agent': userAgent } });
      
      if (!chartResponse.ok) {
         const errorText = await chartResponse.text();
        return NextResponse.json({ error: `Failed to fetch chart data from Yahoo Finance API for ${symbol}. Reason: ${errorText}` }, { status: chartResponse.status });
      }

      const chartJson = await chartResponse.json();

      if (chartJson.chart.error) {
        return NextResponse.json({ error: `Yahoo Finance API Error for ${symbol}: ${chartJson.chart.error.description}` }, { status: 404 });
      }

      const chartResult = chartJson.chart?.result?.[0];

      if (!chartResult) {
        return NextResponse.json({ error: `No chart data found for symbol ${symbol}` }, { status: 404 });
      }

      const highValues = chartResult?.indicators.quote[0].high.filter((p: number | null): p is number => p !== null) || [];
      const lowValues = chartResult?.indicators.quote[0].low.filter((p: number | null): p is number => p !== null) || [];

      const fourWeekHigh = highValues.length > 0 ? Math.max(...highValues) : null;
      const fourWeekLow = lowValues.length > 0 ? Math.min(...lowValues) : null;

      const data = {
        fourWeekHigh,
        fourWeekLow,
        currentPrice: chartResult.meta?.regularMarketPrice,
      };

      return NextResponse.json(data);

    } catch (error: any) {
      console.error('Error fetching financial data from proxy:', error);
      return NextResponse.json({ error: `Internal Server Error while fetching financial data: ${error.message}` }, { status: 500 });
    }
  }

  // --- Handle request for historical price range ---
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required query parameters: from, to' }, { status: 400 });
  }

  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Yahoo Finance API error:', errorText);
        return NextResponse.json({ error: 'Failed to fetch data from Yahoo Finance API', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    
    if (data.chart.error) {
        console.error(`Yahoo Finance returned an error for ${symbol}:`, data.chart.error.description);
        return NextResponse.json({ error: data.chart.error.description }, { status: 404 });
    }
    
    if (!data.chart.result || data.chart.result.length === 0) {
        return NextResponse.json({ error: `No data found for symbol ${symbol}`}, { status: 404 });
    }

    const chartResult = data.chart.result[0];
    const quote = chartResult.indicators?.quote?.[0];
    const currentPrice = chartResult.meta.regularMarketPrice;

    if (!quote || !quote.high || !quote.low) {
         return NextResponse.json({ error: `Incomplete indicator data for symbol ${symbol}`}, { status: 404 });
    }

    const highValues = quote.high.filter((p: number | null): p is number => p !== null);
    const lowValues = quote.low.filter((p: number | null): p is number => p !== null);
    
    if (highValues.length === 0 || lowValues.length === 0) {
        return NextResponse.json({ error: `No valid high/low price data for symbol ${symbol}`}, { status: 404 });
    }

    const high = Math.max(...highValues);
    const low = Math.min(...lowValues);

    return NextResponse.json({ currentPrice, high, low });

  } catch (error) {
    console.error('Error fetching from proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
