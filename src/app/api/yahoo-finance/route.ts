import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Robust Yahoo Finance session and crumb management.
 */
async function getYahooAuth(userAgent: string) {
  try {
    const cookies: Map<string, string> = new Map();
    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    };

    // 1. Prime session with fc.yahoo.com (common bypass for consent/B-cookie)
    const primeRes = await fetch('https://fc.yahoo.com', { 
      headers, 
      redirect: 'follow',
      cache: 'no-store'
    });

    const extractCookies = (res: Response) => {
      const setCookieHeaders = (res.headers as any).getSetCookie 
        ? (res.headers as any).getSetCookie() 
        : res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : [];
        
      setCookieHeaders.forEach((c: string) => {
        const parts = c.split(';')[0].split('=');
        if (parts.length === 2) {
          cookies.set(parts[0].trim(), parts[1].trim());
        }
      });
    };

    extractCookies(primeRes);
    const cookieString = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // 2. Fetch the crumb token using the primed cookies
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...headers, 'Cookie': cookieString },
      cache: 'no-store'
    });

    if (!crumbRes.ok) {
        console.warn(`Crumb fetch failed with status ${crumbRes.status}`);
        return { cookie: cookieString, crumb: null };
    }

    const crumb = await crumbRes.text();
    return { cookie: cookieString, crumb };
  } catch (error) {
    console.error("Yahoo Auth Handshake Failed:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const getOptions = searchParams.get('options') === 'true';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  if (!symbol && !getOptions) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  // --- Symbol Mapping ---
  let querySymbol = symbol || '^NSEI';
  const upperSymbol = querySymbol.toUpperCase();
  if (upperSymbol === 'NIFTY') {
    querySymbol = '^NSEI';
  } else if (upperSymbol === 'BANKNIFTY') {
    querySymbol = '^NSEBANK';
  } else if (!querySymbol.includes('.') && !querySymbol.startsWith('^')) {
    querySymbol = `${upperSymbol}.NS`;
  }

  // --- Handle Option Chain Request ---
  if (getOptions) {
    try {
      const auth = await getYahooAuth(userAgent);
      
      const fetchWithAuth = async (baseUrl: string) => {
        const url = `${baseUrl}/v7/finance/options/${querySymbol}${auth?.crumb ? `?crumb=${auth.crumb}` : ''}`;
        return await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
            'Cookie': auth?.cookie || '',
            'Referer': `https://finance.yahoo.com/quote/${querySymbol}/options`,
          },
          cache: 'no-store'
        });
      };

      let response = await fetchWithAuth('https://query2.finance.yahoo.com');

      if (!response.ok) {
        console.warn(`Yahoo query2 failed with ${response.status}, trying query1 fallback...`);
        response = await fetchWithAuth('https://query1.finance.yahoo.com');
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
      
      if (!result || !result.options || result.options.length === 0) {
        return NextResponse.json({ 
          error: "Valid symbol found, but no options are currently listed for this ticker on Yahoo.",
          symbol: querySymbol
        }, { status: 404 });
      }

      return NextResponse.json(data);

    } catch (error: any) {
      console.error("[YAHOO OPTIONS PROXY ERROR]", error);
      return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
  }
  
  // --- Standard Price/History Logic ---
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const daysAgo = searchParams.get('daysAgo');
  const getFinancials = searchParams.get('financials') === 'true';

  try {
    let url = "";
    if (daysAgo) {
      const targetDate = subDays(new Date(), parseInt(daysAgo, 10));
      const period1 = Math.floor(subDays(targetDate, 5).getTime() / 1000);
      const period2 = Math.floor(addDays(targetDate, 1).getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${period1}&period2=${period2}&interval=1d`;
    } else if (getFinancials) {
      const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
      const today = Math.floor(new Date().getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;
    } else if (from && to) {
      const period1 = Math.floor(new Date(from).getTime() / 1000);
      const period2 = Math.floor(new Date(to).getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${period1}&period2=${period2}&interval=1d`;
    }

    if (!url) return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });

    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    if (!response.ok) return NextResponse.json({ error: 'Failed to fetch Yahoo data' }, { status: response.status });
    const data = await response.json();
    const chartResult = data.chart?.result?.[0];
    if (!chartResult) return NextResponse.json({ error: "No data found" }, { status: 404 });

    if (daysAgo) {
        const closes = chartResult.indicators.quote[0].close || [];
        const lastClose = closes.filter((c: any) => c !== null).pop();
        return NextResponse.json({ previousClose: lastClose });
    }

    if (getFinancials) {
        const highs = chartResult.indicators.quote[0].high.filter((p: any) => p !== null);
        const lows = chartResult.indicators.quote[0].low.filter((p: any) => p !== null);
        return NextResponse.json({
            fourWeekHigh: highs.length > 0 ? Math.max(...highs) : null,
            fourWeekLow: lows.length > 0 ? Math.min(...lows) : null,
            currentPrice: chartResult.meta.regularMarketPrice
        });
    }

    const quote = chartResult.indicators?.quote?.[0];
    const highs = quote?.high?.filter((p: any) => p !== null) || [];
    const lows = quote?.low?.filter((p: any) => p !== null) || [];
    
    return NextResponse.json({ 
        currentPrice: chartResult.meta.regularMarketPrice, 
        high: highs.length > 0 ? Math.max(...highs) : null, 
        low: lows.length > 0 ? Math.min(...lows) : null 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
