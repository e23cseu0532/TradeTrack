
import { NextRequest, NextResponse } from 'next/server';
import { addDays, format } from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get('symbol');
  const from = searchParams.get('from');
  const to = search_params.get('to');
  const getFinancials = searchParams.get('financials') === 'true';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  // Ensure the symbol has the .NS suffix for NSE stocks if not present
  if (!symbol.toUpperCase().endsWith('.NS')) {
    symbol = `${symbol.toUpperCase()}.NS`;
  }

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  // --- NEW: Handle request for detailed financial data ---
  if (getFinancials) {
    const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData`;
    const fourWeeksAgo = Math.floor(addDays(new Date(), -28).getTime() / 1000);
    const today = Math.floor(new Date().getTime() / 1000);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${fourWeeksAgo}&period2=${today}&interval=1d`;

    try {
      const [summaryResponse, chartResponse] = await Promise.all([
        fetch(summaryUrl, { headers: { 'User-Agent': userAgent } }),
        fetch(chartUrl, { headers: { 'User-Agent': userAgent } }),
      ]);
      
      if (!summaryResponse.ok) {
        const errorText = await summaryResponse.text();
        return NextResponse.json({ error: `Failed to fetch summary data from Yahoo Finance API for ${symbol}. Reason: ${errorText}` }, { status: summaryResponse.status });
      }
      if (!chartResponse.ok) {
         const errorText = await chartResponse.text();
        return NextResponse.json({ error: `Failed to fetch chart data from Yahoo Finance API for ${symbol}. Reason: ${errorText}` }, { status: chartResponse.status });
      }

      const summaryJson = await summaryResponse.json();
      const chartJson = await chartResponse.json();

      const summaryResult = summaryJson.quoteSummary?.result?.[0];
      const chartResult = chartJson.chart?.result?.[0];

      if (!summaryResult) {
        return NextResponse.json({ error: `No summary data found for symbol ${symbol}` }, { status: 404 });
      }
      if (!chartResult) {
        return NextResponse.json({ error: `No chart data found for symbol ${symbol}` }, { status: 404 });
      }

      // Calculate 4-week high/low from chart data
      const highValues = chartResult?.indicators.quote[0].high.filter((p: number | null): p is number => p !== null) || [];
      const lowValues = chartResult?.indicators.quote[0].low.filter((p: number | null): p is number => p !== null) || [];

      const fourWeekHigh = highValues.length > 0 ? Math.max(...highValues) : null;
      const fourWeekLow = lowValues.length > 0 ? Math.min(...lowValues) : null;

      const data = {
        marketCap: summaryResult.summaryDetail?.marketCap?.raw,
        peRatio: summaryResult.summaryDetail?.trailingPE?.raw,
        eps: summaryResult.defaultKeyStatistics?.trailingEps?.raw,
        dividendYield: summaryResult.summaryDetail?.dividendYield?.raw,
        fourWeekHigh,
        fourWeekLow,
        currentPrice: summaryResult.financialData?.currentPrice?.raw,
      };

      return NextResponse.json(data);

    } catch (error) {
      console.error('Error fetching financial data from proxy:', error);
      return NextResponse.json({ error: 'Internal Server Error while fetching financial data' }, { status: 500 });
    }
  }

  // --- ORIGINAL: Handle request for historical price range ---
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required query parameters: from, to' }, { status: 400 });
  }

  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });

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

    const highValues = quote.high.filter((p: number | null): p is number => p !== null);
    const lowValues = quote.low.filter((p: number | null): p is number => p !== null);
    
    if (highValues.length === 0 || lowValues.length === 0) {
        return NextResponse.json({ error: `No valid high/low price data for symbol ${symbol}`}, { status: 404 });
    }

    const high = Math.max(...highValues);
    const low = Math.min(...lowValues);

    return NextResponse.json({ currentPrice, high, low });

  } catch (error) {
    console.error('Error fetching from proxy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

    