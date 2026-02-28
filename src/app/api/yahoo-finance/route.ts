import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Robust Yahoo Finance session management.
 * Attempts to establish a valid session by visiting the base domain.
 */
async function getYahooSession(userAgent: string) {
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

    const headers = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    // Priming request to fc.yahoo.com - this is a known reliable endpoint for B-cookies
    const response = await fetch('https://fc.yahoo.com', {
      headers,
      redirect: 'follow',
    });

    // Capture cookies using modern getSetCookie if available, fallback to manual header check
    const setCookieHeaders = (response.headers as any).getSetCookie 
      ? (response.headers as any).getSetCookie() 
      : response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [];
      
    addCookies(setCookieHeaders);

    return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  } catch (error) {
    console.error("Yahoo Session Handshake Failed:", error);
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
      const cookie = await getYahooSession(userAgent);
      
      const fetchFromYahoo = async (baseUrl: string) => {
        const url = `${baseUrl}/v7/finance/options/${optionsSymbol}`;
        return await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
            'Cookie': cookie || '',
            'Referer': 'https://finance.yahoo.com/quote/' + optionsSymbol + '/options',
          },
          next: { revalidate: 60 }
        });
      };

      // Try query2 first (modern endpoint)
      let response = await fetchFromYahoo('https://query2.finance.yahoo.com');

      // Fallback to query1 if query2 fails (query1 is often older and more permissive)
      if (!response.ok) {
        console.warn(`Yahoo query2 failed with ${response.status}, trying query1 fallback...`);
        response = await fetchFromYahoo('https://query1.finance.yahoo.com');
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
          error: "Symbol found, but no options are currently listed for this ticker on Yahoo.",
          symbol: optionsSymbol
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

  let querySymbol = symbol || '';
  const upperQuery = querySymbol.toUpperCase();
  if (upperQuery === 'NIFTY') {
    querySymbol = '^NSEI';
  } else if (upperQuery === 'BANKNIFTY') {
    querySymbol = '^NSEBANK';
  } else if (!querySymbol.toUpperCase().endsWith('.NS') && !querySymbol.startsWith('^')) {
    querySymbol = `${querySymbol.toUpperCase()}.NS`;
  }

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
