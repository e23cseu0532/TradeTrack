import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!symbol || !from || !to) {
    return NextResponse.json({ error: 'Missing required query parameters: symbol, from, to' }, { status: 400 });
  }

  // Ensure the symbol has the .NS suffix for NSE stocks
  if (!symbol.toUpperCase().endsWith('.NS')) {
    symbol = `${symbol.toUpperCase()}.NS`;
  }

  // Yahoo Finance uses Unix timestamps in seconds
  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Yahoo Finance API error:', errorText);
        return NextResponse.json({ error: 'Failed to fetch data from Yahoo Finance API', details: errorText }, { status: response.status });
    }

    const data = await response.json();
    
    if (data.chart.error) {
        console.error(`Yahoo Finance returned an error for ${symbol}:`, data.chart.error.description);
        return NextResponse.json({ error: data.chart.error.description }, { status: 404 });
    }
    
    if (!data.chart.result || data.chart.result.length === 0) {
        return NextResponse.json({ error: `No data found for symbol ${symbol}`}, { status: 404 });
    }

    const chartResult = data.chart.result[0];
    const quote = chartResult.indicators?.quote?.[0];
    const currentPrice = chartResult.meta.regularMarketPrice;

    if (!quote || !quote.high || !quote.low) {
         return NextResponse.json({ error: `Incomplete indicator data for symbol ${symbol}`}, { status: 404 });
    }

    // Filter out null values which can appear in the data
    const highValues = quote.high.filter((p: number | null): p is number => p !== null);
    const lowValues = quote.low.filter((p: number | null): p is number => p !== null);
    
    if (highValues.length === 0 || lowValues.length === 0) {
        return NextResponse.json({ error: `No valid high/low price data for symbol ${symbol}`}, { status: 404 });
    }

    const high = Math.max(...highValues);
    const low = Math.min(...lowValues);

    return NextResponse.json({
      currentPrice,
      high,
      low,
    });

  } catch (error) {
    console.error('Error fetching from proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
