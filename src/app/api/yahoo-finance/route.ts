import { NextRequest, NextResponse } from 'next/server';
import { 
  startOfWeek, 
  endOfWeek, 
  subWeeks, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  isWithinInterval,
  isBefore,
  startOfDay
} from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const timeframe = searchParams.get('timeframe') || 'daily'; // daily, weekly, monthly

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol.toUpperCase()}.NS`;
    
    // Fetch 2 years to ensure we have enough history for accurate period selection
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=2y`;

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
    })).filter((d) => d.high !== null && d.low !== null && d.close !== null) as { timestamp: number; high: number; low: number; close: number; date: Date }[];

    if (validData.length === 0) {
       throw new Error("Insufficient price data.");
    }

    const currentPrice = validData[validData.length - 1].close;
    const now = new Date();

    let pHigh, pLow, pClose, pDate;

    if (timeframe === 'weekly') {
      // Last full completed week (Monday-Friday)
      const targetStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const targetEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const bars = validData.filter(d => isWithinInterval(d.date, { start: targetStart, end: targetEnd }));
      
      if (bars.length > 0) {
        pHigh = Math.max(...bars.map(b => b.high));
        pLow = Math.min(...bars.map(b => b.low));
        pClose = bars[bars.length - 1].close;
        pDate = bars[0].date.toISOString();
      } else {
        // Fallback
        const b = validData[Math.max(0, validData.length - 6)];
        pHigh = b.high; pLow = b.low; pClose = b.close; pDate = b.date.toISOString();
      }
    } else if (timeframe === 'monthly') {
      // Last full completed calendar month
      const targetStart = startOfMonth(subMonths(now, 1));
      const targetEnd = endOfMonth(subMonths(now, 1));
      const bars = validData.filter(d => isWithinInterval(d.date, { start: targetStart, end: targetEnd }));
      
      if (bars.length > 0) {
        pHigh = Math.max(...bars.map(b => b.high));
        pLow = Math.min(...bars.map(b => b.low));
        pClose = bars[bars.length - 1].close;
        pDate = bars[0].date.toISOString();
      } else {
        // Fallback
        const b = validData[Math.max(0, validData.length - 22)];
        pHigh = b.high; pLow = b.low; pClose = b.close; pDate = b.date.toISOString();
      }
    } else {
      // Daily: Last completed session excluding today's potentially active session
      const todayStart = startOfDay(now);
      const pastBars = validData.filter(d => isBefore(d.date, todayStart));
      const prevDay = pastBars.length > 0 ? pastBars[pastBars.length - 1] : (validData.length > 1 ? validData[validData.length - 2] : validData[0]);
      
      pHigh = prevDay.high;
      pLow = prevDay.low;
      pClose = prevDay.close;
      pDate = prevDay.date.toISOString();
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      currentPrice,
      high: pHigh,
      low: pLow,
      previousClose: pClose,
      refDate: pDate,
      timeframe: timeframe,
      asOf: validData[validData.length - 1].date.toISOString()
    });

  } catch (error: any) {
    console.error("Yahoo Finance Sync Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to fetch stock data" }, { status: 500 });
  }
}
