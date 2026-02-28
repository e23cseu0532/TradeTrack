import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Robust Yahoo Finance session and crumb management.
 * Performs a multi-step handshake to establish a valid browser-like session context.
 */
async function getYahooAuth(symbol: string, userAgent: string) {
  const cookies: Map<string, string> = new Map();
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };

  const extractCookies = (res: Response) => {
    const rawSetCookie = res.headers.get('set-cookie');
    if (rawSetCookie) {
      // Split by comma but only if not within a date (expires=...)
      const cookieArray = rawSetCookie.split(/,(?=[^;]+=[^;]+;)/);
      cookieArray.forEach(c => {
        const parts = c.split(';')[0].split('=');
        if (parts.length >= 2) {
          cookies.set(parts[0].trim(), parts.slice(1).join('=').trim());
        }
      });
    }
    
    // Modern environments support getSetCookie
    // @ts-ignore
    if (typeof res.headers.getSetCookie === 'function') {
      // @ts-ignore
      res.headers.getSetCookie().forEach((c: string) => {
        const parts = c.split(';')[0].split('=');
        if (parts.length >= 2) {
          cookies.set(parts[0].trim(), parts.slice(1).join('=').trim());
        }
      });
    }
  };

  try {
    // 1. Prime session with fc.yahoo.com (The Consent Primer)
    const primeRes = await fetch('https://fc.yahoo.com', { headers, cache: 'no-store' });
    extractCookies(primeRes);

    // 2. Visit the main quote page to establish ticker-specific session context
    const currentCookies = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const quoteUrl = `https://finance.yahoo.com/quote/${symbol}/options`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { ...headers, 'Cookie': currentCookies },
      cache: 'no-store'
    });
    extractCookies(quoteRes);
    const html = await quoteRes.text();

    const finalCookieString = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // 3. Attempt to get crumb from dedicated API (Trying both query1 and query2)
    let crumb = null;
    const crumbEndpoints = [
      'https://query2.finance.yahoo.com/v1/test/getcrumb',
      'https://query1.finance.yahoo.com/v1/test/getcrumb'
    ];

    for (const endpoint of crumbEndpoints) {
      try {
        const crumbRes = await fetch(endpoint, {
          headers: { 
            ...headers, 
            'Cookie': finalCookieString,
            'Referer': quoteUrl,
          },
          cache: 'no-store'
        });
        if (crumbRes.ok) {
          const text = await crumbRes.text();
          if (text && text.length < 20) { // Crumb is usually a short token
            crumb = text;
            break;
          }
        }
      } catch (e) {}
    }

    // 4. Fallback: Exhaustive Scrape for crumb from HTML source if API failed
    if (!crumb) {
      const patterns = [
        /"CrumbStore":\{"crumb":"(.*?)"\}/,
        /"crumb":"(.*?)"/,
        /\\?["']crumb\\?["']\s*:\s*\\?["'](.*?)\\?["']/,
        /\"crumb\":\"([^\"]+)\"/
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          crumb = match[1].replace(/\\u002f/g, '/').replace(/\\u002d/g, '-');
          break;
        }
      }
    }

    return { cookie: finalCookieString, crumb };
  } catch (error) {
    console.error("Yahoo Auth Handshake Failed:", error);
    return { 
      cookie: Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; '), 
      crumb: null 
    };
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

  let querySymbol = symbol || '^NSEI';
  const upperSymbol = querySymbol.toUpperCase();
  if (upperSymbol === 'NIFTY') {
    querySymbol = '^NSEI';
  } else if (upperSymbol === 'BANKNIFTY') {
    querySymbol = '^NSEBANK';
  } else if (!querySymbol.includes('.') && !querySymbol.startsWith('^')) {
    querySymbol = `${upperSymbol}.NS`;
  }

  if (getOptions) {
    try {
      const auth = await getYahooAuth(querySymbol, userAgent);
      
      const fetchWithAuth = async (baseUrl: string, useCrumb: boolean) => {
        const url = `${baseUrl}/v7/finance/options/${querySymbol}${useCrumb && auth?.crumb ? `?crumb=${auth.crumb}` : ''}`;
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

      // Resilience Loop: Try different combinations of endpoints and auth
      // Priority 1: query2 with crumb (Official path)
      let response = await fetchWithAuth('https://query2.finance.yahoo.com', true);

      // Priority 2: query1 with crumb
      if (!response.ok) {
        response = await fetchWithAuth('https://query1.finance.yahoo.com', true);
      }

      // Priority 3: query1 WITHOUT crumb (Sometimes works if cookies are valid)
      if (!response.ok) {
        response = await fetchWithAuth('https://query1.finance.yahoo.com', false);
      }

      // Priority 4: query2 WITHOUT crumb
      if (!response.ok) {
        response = await fetchWithAuth('https://query2.finance.yahoo.com', false);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ 
          error: `Yahoo API Error: ${response.status}`,
          details: errorText,
          authAttempted: { 
            hasCookie: !!auth?.cookie && auth.cookie.length > 0, 
            hasCrumb: !!auth?.crumb 
          }
        }, { status: response.status });
      }

      const data = await response.json();
      const result = data.optionChain?.result?.[0];
      
      if (!result || !result.options || result.options.length === 0) {
        return NextResponse.json({ 
          error: "Valid symbol found, but no options are currently listed for this ticker on Yahoo.",
          symbol: querySymbol,
          authAttempted: { 
            hasCookie: !!auth?.cookie && auth.cookie.length > 0, 
            hasCrumb: !!auth?.crumb 
          }
        }, { status: 404 });
      }

      return NextResponse.json(data);

    } catch (error: any) {
      console.error("[YAHOO OPTIONS PROXY ERROR]", error);
      return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
  }
  
  // Standard Price/History Logic
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
