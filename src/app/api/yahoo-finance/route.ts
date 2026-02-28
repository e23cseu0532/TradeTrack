
import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

  // --- Handle Option Chain Request using NSE API ---
  if (getOptions) {
    const nseBaseUrl = 'https://www.nseindia.com';
    const nseRefererUrl = `${nseBaseUrl}/get-quotes/derivatives?symbol=NIFTY`; 
    const nseApiUrl = `${nseBaseUrl}/api/option-chain-indices?symbol=NIFTY`;
    
    try {
        // Step 1: Prime the session by visiting a derivatives page
        const primeResponse = await fetch(nseRefererUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'sec-ch-ua': '"Not/A)Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
            }
        });

        if (!primeResponse.ok) {
            return NextResponse.json({ error: `Failed to prime NSE session. Status: ${primeResponse.status}` }, { status: primeResponse.status });
        }
        
        // Step 2: Extract all cookies robustly using getSetCookie
        // @ts-ignore - getSetCookie exists in modern Node environments used by Next.js
        const setCookies = primeResponse.headers.getSetCookie?.() || [];
        
        // Fallback for environments where getSetCookie might not be typed or available
        let cookie = "";
        if (setCookies.length > 0) {
            cookie = setCookies.map(c => c.split(';')[0]).join('; ');
        } else {
            // Last resort: try standard header iteration
            const individualCookies: string[] = [];
            primeResponse.headers.forEach((value, key) => {
                if (key.toLowerCase() === 'set-cookie') {
                    individualCookies.push(value.split(';')[0]);
                }
            });
            cookie = individualCookies.join('; ');
        }
        
        if (!cookie) {
            return NextResponse.json({ error: 'No session cookies received from NSE. Retrying may help.' }, { status: 500 });
        }

        // Step 3: Fetch the option chain data with cookies and correct headers
        const apiResponse = await fetch(nseApiUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookie,
                'Referer': nseRefererUrl,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return NextResponse.json({ error: `NSE API Error: ${apiResponse.status}`, details: errorText }, { status: apiResponse.status });
        }

        const data = await apiResponse.json();
        
        // NSE API sometimes returns success status but with an error message body like "Resource not found"
        if (data.message && data.message.toLowerCase().includes("not found")) {
             return NextResponse.json({ error: "NSE Session established but data resource was not found. This often happens if the session isn't fully 'warm'. Try refreshing in a few seconds." }, { status: 404 });
        }

        return NextResponse.json(data);

    } catch (error: any) {
        console.error("[NSE OPTIONS API PROXY ERROR]", error);
        return NextResponse.json({ error: error.message || "Unknown NSE API Error" }, { status: 500 });
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

  // --- Handle request for a specific day's close price ---
  if (daysAgo) {
      const targetDate = subDays(new Date(), parseInt(daysAgo, 10));
      const period1 = Math.floor(subDays(targetDate, 5).getTime() / 1000);
      const period2 = Math.floor(addDays(targetDate, 1).getTime() / 1000);
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
      
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

  // --- Handle request for financial data ---
  if (getFinancials) {
    const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
    const today = Math.floor(new Date().getTime() / 1000);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;

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

  // --- Handle request for historical price range ---
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required query parameters' }, { status: 400 });
  }

  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

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
