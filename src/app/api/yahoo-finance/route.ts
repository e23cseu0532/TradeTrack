import { NextRequest, NextResponse } from 'next/server';
import { 
  startOfWeek, 
  endOfWeek, 
  subWeeks, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  isWithinInterval,
  format,
} from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const timeframe = searchParams.get('timeframe') || 'weekly';

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol.toUpperCase()}.NS`;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1y`;

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

    let pHigh: number = 0;
    let pLow: number = 0;
    let pClose: number = 0;
    let pDate: string = "N/A";

    if (timeframe === 'monthly') {
      const targetStart = startOfMonth(subMonths(now, 1));
      const targetEnd = endOfMonth(subMonths(now, 1));
      const bars = validData.filter(d => isWithinInterval(d.date, { start: targetStart, end: targetEnd }));
      
      if (bars.length > 0) {
        pHigh = Math.max(...bars.map(b => b.high));
        pLow = Math.min(...bars.map(b => b.low));
        pClose = bars[bars.length - 1].close;
        pDate = formatInterval(targetStart, targetEnd);
      } else {
        // Fallback to latest available if range logic fails
        const last = validData[validData.length - 1];
        pHigh = last.high; pLow = last.low; pClose = last.close;
        pDate = "Last Session";
      }
    } else if (timeframe === 'weekly') {
      const targetStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const targetEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const bars = validData.filter(d => isWithinInterval(d.date, { start: targetStart, end: targetEnd }));
      
      if (bars.length > 0) {
        pHigh = Math.max(...bars.map(b => b.high));
        pLow = Math.min(...bars.map(b => b.low));
        pClose = bars[bars.length - 1].close;
        pDate = formatInterval(targetStart, targetEnd);
      } else {
        const last = validData[validData.length - 1];
        pHigh = last.high; pLow = last.low; pClose = last.close;
        pDate = "Last Session";
      }
    } else if (timeframe === 'daily') {
      const targetIdx = validData.length - 2;
      if (targetIdx >= 0) {
          const target = validData[targetIdx];
          pHigh = target.high;
          pLow = target.low;
          pClose = target.close;
          pDate = format(target.date, "dd MMM yyyy");
      } else {
          const last = validData[validData.length - 1];
          pHigh = last.high; pLow = last.low; pClose = last.close;
          pDate = "Current Session";
      }
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      currentPrice,
      high: pHigh || currentPrice,
      low: pLow || currentPrice,
      previousClose: pClose || currentPrice,
      refDate: pDate,
      timeframe: timeframe,
      asOf: validData[validData.length - 1].date.toISOString()
    });

  } catch (error: any) {
    console.error("Yahoo Finance Sync Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to fetch stock data" }, { status: 500 });
  }
}

function formatInterval(start: Date, end: Date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
}