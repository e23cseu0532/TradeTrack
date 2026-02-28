import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Enhanced session management for Yahoo Finance.
 * Mimics a full browser visit to establish required cookies and obtain a crumb token.
 */
async function getYahooAuth(symbol: string, userAgent: string) {
  try {
    const cookies: Map<string, string> = new Map();

    const addCookies = (setCookies: string[]) => {
      setCookies.forEach((c: string) => {
        const parts = c.split(';')[0].split('=');
        if (parts.length === 2) {
          cookies.set(parts[0].trim(), parts[1].trim());
        }
      });
    };

    const browserHeaders = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };

    // 1. Visit fc.yahoo.com to get the base "B" cookie
    const fcResponse = await fetch('https://fc.yahoo.com', {
      headers: browserHeaders,
      redirect: 'follow'
    });
    
    const fcSetCookies = (fcResponse.headers as any).getSetCookie 
      ? (fcResponse.headers as any).getSetCookie() 
      : [fcResponse.headers.get('set-cookie')].filter(Boolean);
    addCookies(fcSetCookies);

    // 2. Visit the quote page to "warm up" the session for this symbol
    const cookieString = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const pageResponse = await fetch(`https://finance.yahoo.com/quote/${symbol}/options`, {
      headers: { 
        ...browserHeaders,
        'Cookie': cookieString,
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    const pageSetCookies = (pageResponse.headers as any).getSetCookie 
      ? (pageResponse.headers as any).getSetCookie() 
      : [pageResponse.headers.get('set-cookie')].filter(Boolean);
    addCookies(pageSetCookies);

    const finalCookieString = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // 3. Get Crumb using established cookies
    const crumbResponse = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': userAgent,
        'Cookie': finalCookieString,
        'Referer': 'https://finance.yahoo.com/'
      },
    });

    if (!crumbResponse.ok) {
      console.warn(`Yahoo Auth: Failed to get crumb. Status: ${crumbResponse.status}`);
      return { cookie: finalCookieString, crumb: null };
    }

    const crumb = await crumbResponse.text();
    return { cookie: finalCookieString, crumb };
  } catch (error) {
    console.error("Yahoo Auth: Exception during handshake", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // --- Handle Option Chain Request ---
  if (getOptions) {
    let optionsSymbol = symbol || '^NSEI';
    const upperSymbol = optionsSymbol.toUpperCase();
    
    if (upperSymbol === 'NIFTY') {
      optionsSymbol = '^NSEI';
    } else if (upperSymbol === 'BANKNIFTY') {
      optionsSymbol = '^NSEBANK';
    } else if (!optionsSymbol.includes('.') && !optionsSymbol.startsWith('^')) {
      optionsSymbol = `${upperSymbol}.NS`;
    }

    try {
      // 1. Perform full handshake
      const auth = await getYahooAuth(optionsSymbol, userAgent);
      
      const fetchOptions = async (useCrumb: boolean) => {
        let url = `https://query2.finance.yahoo.com/v7/finance/options/${optionsSymbol}`;
        if (useCrumb && auth?.crumb) {
          url += `?crumb=${auth.crumb}`;
        }
        
        return await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
            'Cookie': auth?.cookie || '',
            'Origin': 'https://finance.yahoo.com',
            'Referer': `https://finance.yahoo.com/quote/${optionsSymbol}/options`
          },
          next: { revalidate: 60 } 
        });
      };

      // Try with crumb first
      let response = await fetchOptions(true);

      // If 401, retry without crumb (sometimes crumb retrieval is flaky but cookies are enough)
      if (response.status === 401) {
        console.warn("Yahoo API returned 401 with crumb, retrying without crumb...");
        response = await fetchOptions(false);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ 
          error: `Yahoo API Error: ${response.status}`,
          details: errorText
        }, { status: response.status });
      }

      const data = await response.json();
      const result = data.optionChain?.result?.[0];
      
      if (!result) {
        return NextResponse.json({ 
          error: "Yahoo Finance returned a valid response but the internal data structure was empty.",
          debug: data 
        }, { status: 404 });
      }

      if (!result.options || result.options.length === 0) {
         return NextResponse.json({ 
          error: "Valid symbol found, but no options are currently listed for this ticker on Yahoo.",
          symbol: optionsSymbol,
          debug: result
        }, { status: 404 });
      }

      return NextResponse.json(data);

    } catch (error: any) {
      console.error("[YAHOO OPTIONS API PROXY ERROR]", error);
      return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
  }
  
  // --- Standard Price/History Logic ---
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const getFinancials = searchParams.get('financials') === 'true';
  const daysAgo = searchParams.get('daysAgo');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  let querySymbol = symbol;
  const upperQuery = querySymbol.toUpperCase();
  if (upperQuery === 'NIFTY') {
    querySymbol = '^NSEI';
  } else if (upperQuery === 'BANKNIFTY') {
    querySymbol = '^NSEBANK';
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
