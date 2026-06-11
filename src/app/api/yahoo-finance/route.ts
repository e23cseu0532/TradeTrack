import { NextRequest, NextResponse } from 'next/server';
import { 
  startOfWeek, 
  endOfWeek, 
  subWeeks, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  isWithinInterval
} from 'date-fns';

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
  const timeframe = searchParams.get('timeframe') || 'daily'; // daily, weekly, monthly
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
    
    // Fetch a larger range to ensure we have enough history for previous periods (Weekly/Monthly)
    // We use 2y range to be safe for last-month calculation even on long holidays
    let range = '2y'; 
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
    if (!indicators) {
      throw new Error("Missing indicator data from Yahoo Finance");
    }

    const timestamps = (result.timestamp || []) as number[];
    const highs = (indicators.high || []) as (number | null)[];
    const lows = (indicators.low || []) as (number | null)[];
    const closes = (indicators.close || []) as (number | null)[];

    const validData = timestamps.map((t: number, i: number) => ({
      timestamp: t,
      high: highs[i],
      low: lows[i],
      close: closes[i],
      date: new Date(t * 1000)
    })).filter((d: { high: number | null; low: number | null; close: number | null }) => 
      d.high !== null && d.low !== null && d.close !== null
    ) as { timestamp: number; high: number; low: number; close: number; date: Date }[];

    if (validData.length === 0) {
       throw new Error("Insufficient price data.");
    }

    const currentPrice = validData[validData.length - 1].close;

    if (isFinancialsRequest) {
      const high52 = validData.reduce((prev, curr) => (curr.high > prev.high ? curr : prev), validData[0]);
      const low52 = validData.reduce((prev, curr) => (curr.low < prev.low ? curr : prev), validData[0]);
      const fourWeeksData = validData.slice(-20);
      const high4 = fourWeeksData.reduce((prev, curr) => (curr.high > prev.high ? curr : prev), fourWeeksData[0]);
      const low4 = fourWeeksData.reduce((prev, curr) => (curr.low < prev.low ? curr : prev), fourWeeksData[0]);

      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        currentPrice,
        high52w: { value: high52.high, date: high52.date.toISOString() },
        low52w: { value: low52.low, date: low52.date.toISOString() },
        high4w: { value: high4.high, date: high4.date.toISOString() },
        low4w: { value: low4.low, date: low4.date.toISOString() },
      });
    }

    /**
     * SYNC LOGIC: Previous Period OHLC Extraction
     * Calibrated to match TradingView Standard Protocol.
     */
    let pHigh, pLow, pClose;
    const now = new Date();

    if (timeframe === 'weekly') {
      // Find the last completed trading week (Monday to Sunday)
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      
      const lastWeekBars = validData.filter(d => isWithinInterval(d.date, { start: lastWeekStart, end: lastWeekEnd }));
      
      if (lastWeekBars.length > 0) {
        pHigh = Math.max(...lastWeekBars.map(b => b.high));
        pLow = Math.min(...lastWeekBars.map(b => b.low));
        pClose = lastWeekBars[lastWeekBars.length - 1].close;
      } else {
        pHigh = validData[validData.length - 2]?.high || validData[0].high;
        pLow = validData[validData.length - 2]?.low || validData[0].low;
        pClose = validData[validData.length - 2]?.close || validData[0].close;
      }
    } else if (timeframe === 'monthly') {
      // Find the last completed calendar month
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));
      
      const lastMonthBars = validData.filter(d => isWithinInterval(d.date, { start: lastMonthStart, end: lastMonthEnd }));
      
      if (lastMonthBars.length > 0) {
        pHigh = Math.max(...lastMonthBars.map(b => b.high));
        pLow = Math.min(...lastMonthBars.map(b => b.low));
        pClose = lastMonthBars[lastMonthBars.length - 1].close;
      } else {
        pHigh = validData[validData.length - 2]?.high || validData[0].high;
        pLow = validData[validData.length - 2]?.low || validData[0].low;
        pClose = validData[validData.length - 2]?.close || validData[0].close;
      }
    } else {
      // Daily logic: Last full trading day (excluding today bar)
      const lastBarDate = validData[validData.length - 1].date;
      const isTodayBar = lastBarDate.toDateString() === now.toDateString();
      const prevDayIndex = isTodayBar ? validData.length - 2 : validData.length - 1;
      const prevDay = validData[Math.max(0, prevDayIndex)];
      
      pHigh = prevDay.high;
      pLow = prevDay.low;
      pClose = prevDay.close;
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      currentPrice,
      high: pHigh,
      low: pLow,
      previousClose: pClose,
      currency: result.meta.currency,
      exchange: result.meta.exchangeName,
      asOf: validData[validData.length - 1].date.toISOString()
    });

  } catch (error: any) {
    console.error("Yahoo Finance Fetch Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to fetch stock data" }, { status: 500 });
  }
}
