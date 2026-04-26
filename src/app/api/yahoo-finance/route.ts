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
  const isFinancialsRequest = searchParams.get('financials') === 'true';
  const isExpiryRequest = searchParams.get('get_expiries') === 'true';
  const expiryDate = searchParams.get('expiry_date');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  // CASE 1: OPTION CHAIN REQUESTS
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

  // CASE 2: GENERAL STOCK DATA & FINANCIALS
  try {
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol.toUpperCase()}.NS`;
    let range = '5d';
    if (isFinancialsRequest) range = '1y'; 
    
    let yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=${range}`;
    
    if (from && to && !isFinancialsRequest) {
      const p1 = Math.floor(new Date(from).getTime() / 1000);
      const p2 = Math.floor(new Date(to).getTime() / 1000);
      yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${p1}&period2=${p2}&interval=1d`;
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
    const highs = indicators.high || [];
    const lows = indicators.low || [];
    const closes = indicators.close || [];

    // Filter valid data points
    const validData = timestamps.map((t: number, i: number) => ({
      timestamp: t,
      high: highs[i],
      low: lows[i],
      close: closes[i]
    })).filter(d => d.high !== null && d.low !== null && d.close !== null);

    if (validData.length === 0) {
       throw new Error("Insufficient price data.");
    }

    const currentPrice = validData[validData.length - 1].close;

    // Standard Session OHLC (Previous Completed Day)
    // In a 5d chart, the last item is today (active), the second to last is yesterday.
    const prevDayIndex = validData.length >= 2 ? validData.length - 2 : 0;
    const prevDay = validData[prevDayIndex];

    if (isFinancialsRequest) {
      // 52 Week Logic
      const high52 = validData.reduce((prev, curr) => (curr.high > prev.high ? curr : prev), validData[0]);
      const low52 = validData.reduce((prev, curr) => (curr.low < prev.low ? curr : prev), validData[0]);

      // 4 Week Logic (approx last 20 trading days)
      const fourWeeksData = validData.slice(-20);
      const high4 = fourWeeksData.reduce((prev, curr) => (curr.high > prev.high ? curr : prev), fourWeeksData[0]);
      const low4 = fourWeeksData.reduce((prev, curr) => (curr.low < prev.low ? curr : prev), fourWeeksData[0]);

      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        currentPrice,
        high52w: { value: high52.high, date: new Date(high52.timestamp * 1000).toISOString() },
        low52w: { value: low52.low, date: new Date(low52.timestamp * 1000).toISOString() },
        high4w: { value: high4.high, date: new Date(high4.timestamp * 1000).toISOString() },
        low4w: { value: low4.low, date: new Date(low4.timestamp * 1000).toISOString() },
      });
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      currentPrice,
      high: prevDay.high, // Standard Daily Pivot OHLC
      low: prevDay.low,
      previousClose: prevDay.close,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
    });

  } catch (error: any) {
    console.error("Yahoo Finance Fetch Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch stock data" }, { status: 500 });
  }
}
