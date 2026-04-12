import { NextRequest, NextResponse } from 'next/server';

/**
 * Helper to generate the next 4 Thursday expiry dates for NSE.
 */
function getNextThursdays() {
  const dates = [];
  const today = new Date();
  let day = new Date(today);
  
  let daysUntilThursday = (4 - day.getDay() + 7) % 7;
  
  const hours = today.getHours();
  const minutes = today.getMinutes();
  if (daysUntilThursday === 0 && (hours > 15 || (hours === 15 && minutes > 30))) {
    daysUntilThursday = 7;
  }
  
  day.setDate(day.getDate() + daysUntilThursday);
  
  for (let i = 0; i < 4; i++) {
    const expiry = new Date(day);
    expiry.setDate(day.getDate() + (i * 7));
    dates.push(expiry.toISOString().split('T')[0]);
  }
  return dates;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const isOptionsRequest = searchParams.get('options') === 'true';
  const isExpiryRequest = searchParams.get('get_expiries') === 'true';
  const expiryDate = searchParams.get('expiry_date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  // CASE 1: OPTION CHAIN REQUESTS (Uses Groww)
  // We keep this block as is per your instruction to not touch Option Chain functionality
  if (isOptionsRequest) {
    if (isExpiryRequest) {
      return NextResponse.json(getNextThursdays());
    }

    const apiToken = process.env.GROWW_API_TOKEN?.replace(/"/g, '');
    if (!apiToken) {
      return NextResponse.json({ error: "GROWW_API_TOKEN is missing" }, { status: 500 });
    }

    const normalizedSymbol = symbol.toUpperCase().replace(/\s/g, '');
    const cleanSymbol = normalizedSymbol === 'NIFTY50' ? 'NIFTY' : normalizedSymbol;
    const targetExpiry = expiryDate || getNextThursdays()[0];

    try {
      const url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${cleanSymbol}?expiry_date=${targetExpiry}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'X-API-VERSION': '1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        next: { revalidate: 0 }
      });

      if (!response.ok) throw new Error(`Groww API responded with status ${response.status}`);
      const data = await response.json();
      return NextResponse.json(data.payload || data);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // CASE 2: GENERAL STOCK DATA (Uses Direct Yahoo Finance Fetch)
  // This handles all the other pages (Dashboard, Reports, etc.)
  try {
    // Normalize symbol for Yahoo Finance (NSE stocks need .NS suffix)
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol.toUpperCase()}.NS`;
    
    let yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
    
    if (from && to) {
      const p1 = Math.floor(new Date(from).getTime() / 1000);
      const p2 = Math.floor(new Date(to).getTime() / 1000);
      yahooUrl += `?period1=${p1}&period2=${p2}&interval=1d`;
    } else {
      yahooUrl += `?interval=1d&range=5d`; // Fetch a small range to get current and previous prices
    }

    const response = await fetch(yahooUrl, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance responded with status ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result?.[0];

    if (!result) {
      throw new Error("No data found for the symbol");
    }

    const indicators = result.indicators.quote[0];
    const timestamps = result.timestamp || [];
    const closes = indicators.close || [];
    const highs = indicators.high || [];
    const lows = indicators.low || [];

    // Filter out null values
    const validCloses = closes.filter((c: any) => c !== null);
    const validHighs = highs.filter((h: any) => h !== null);
    const validLows = lows.filter((l: any) => l !== null);

    const currentPrice = validCloses[validCloses.length - 1] || result.meta.regularMarketPrice;
    const high = validHighs.length > 0 ? Math.max(...validHighs) : null;
    const low = validLows.length > 0 ? Math.min(...validLows) : null;
    const previousClose = result.meta.chartPreviousClose;

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      currentPrice,
      high,
      low,
      previousClose,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
    });

  } catch (error: any) {
    console.error("Yahoo Finance Direct Fetch Error:", error.message);
    return NextResponse.json({ 
      error: "Failed to fetch stock data",
      details: error.message 
    }, { status: 500 });
  }
}
