
import { NextRequest, NextResponse } from 'next/server';
import { addDays, subDays } from 'date-fns';

/**
 * Enhanced authentication handshake for Yahoo Finance.
 * Attempts to gather cookies and an optional crumb token.
 */
async function getYahooAuth(symbol: string, userAgent: string) {
  const cookies: Map<string, string> = new Map();
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  const extractCookies = (res: Response) => {
    const rawSetCookie = res.headers.get('set-cookie');
    if (rawSetCookie) {
      const cookieArray = rawSetCookie.split(/,(?=[^;]+=[^;]+;)/);
      cookieArray.forEach(c => {
        const parts = c.split(';')[0].split('=');
        if (parts.length >= 2) {
          cookies.set(parts[0].trim(), parts.slice(1).join('=').trim());
        }
      });
    }
  };

  try {
    // 1. Prime session with fc.yahoo.com
    const primeRes = await fetch('https://fc.yahoo.com', { headers, cache: 'no-store' });
    extractCookies(primeRes);

    // 2. Visit the specific quote page to establish context for the symbol
    const currentCookies = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const quoteUrl = `https://finance.yahoo.com/quote/${symbol}/options`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { ...headers, 'Cookie': currentCookies },
      cache: 'no-store'
    });
    extractCookies(quoteRes);
    const html = await quoteRes.text();

    const finalCookieString = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // 3. Attempt to find the crumb in the HTML source via multiple regex patterns
    let crumb = null;
    const patterns = [
      /"crumb":"(.*?)"/,
      /"CrumbStore":\{"crumb":"(.*?)"\}/,
      /\\?["']crumb\\?["']\s*:\s*\\?["'](.*?)\\?["']/,
      /\\u0022crumb\\u0022:\\u0022([^\\u0022]+)\\u0022/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].replace(/\\u002f/g, '/').replace(/\\u002d/g, '-').replace(/\\/g, '');
        if (extracted.length > 5 && extracted.length < 25) {
          crumb = extracted;
          break;
        }
      }
    }

    return { cookie: finalCookieString, crumb };
  } catch (error) {
    console.error("Yahoo Auth Handshake Failed:", error);
    return { cookie: '', crumb: null };
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

      // Resilience Loop: Try combinations to bypass the 401.
      // Priority 1: query1 WITHOUT crumb (The "Simpler" path, often unblocked for NSE)
      let response = await fetchWithAuth('https://query1.finance.yahoo.com', false);

      // Priority 2: query2 with crumb (The "Modern" path)
      if (!response.ok) {
        response = await fetchWithAuth('https://query2.finance.yahoo.com', true);
      }

      // Priority 3: query1 with crumb
      if (!response.ok) {
        response = await fetchWithAuth('https://query1.finance.yahoo.com', true);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ 
          error: `Yahoo API Error: ${response.status}`,
          authAttempted: { 
            hasCookie: !!auth?.cookie && auth.cookie.length > 10, 
            hasCrumb: !!auth?.crumb 
          }
        }, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data);

    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
  }
  
  // Standard Price/History Logic (Usually less protected)
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const getFinancials = searchParams.get('financials') === 'true';

  try {
    let url = "";
    if (getFinancials) {
      const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
      const today = Math.floor(new Date().getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;
    } else if (from && to) {
      const period1 = Math.floor(new Date(from).getTime() / 1000);
      const period2 = Math.floor(new Date(to).getTime() / 1000);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?period1=${period1}&period2=${period2}&interval=1d`;
    } else {
        // Default to latest chart data
        url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?interval=1m&range=1d`;
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
