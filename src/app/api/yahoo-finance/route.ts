import { NextRequest, NextResponse } from 'next/server';

/**
 * Helper to generate the next 4 Thursday expiry dates for NSE.
 * (Kept for routing consistency, not modifying option chain logic).
 */
function getNextThursdays() {
  const dates = [];
  const today = new Date();
  let day = new Date(today);
  let daysUntilThursday = (4 - day.getDay() + 7) % 7;
  if (daysUntilThursday === 0 && day.getHours() >= 16) {
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

  // CASE 1: Handle Option Chain requests (Groww API)
  // We leave this logic as is to avoid breaking the page, but our focus is Case 2.
  if (isOptionsRequest) {
    if (isExpiryRequest) {
      return NextResponse.json(getNextThursdays());
    }

    const apiToken = process.env.GROWW_API_TOKEN?.replace(/"/g, '');
    if (!apiToken) {
      return NextResponse.json({ error: "GROWW_API_TOKEN is missing" }, { status: 500 });
    }

    const normalizedSymbol = symbol?.toUpperCase().replace(/\s/g, '') || 'NIFTY';
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

  // CASE 2: Handle General Stock Data (Proxy to Python Backend / Yahoo Finance)
  // This is what powers the Dashboard, Reports, and Position Sizing pages.
  try {
    // Ensure the Python server is running on this URL/Port
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5000';
    const queryString = searchParams.toString();
    
    console.log(`Proxying request to Python backend: ${pythonBackendUrl}/api/stock_data?${queryString}`);

    const response = await fetch(`${pythonBackendUrl}/api/stock_data?${queryString}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python backend returned error ${response.status}: ${errorText}`);
      throw new Error(`Python backend error: ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Yahoo Finance Proxy Fetch Failure:", error.message);
    return NextResponse.json({ 
      error: "Failed to fetch stock data from backend",
      details: error.message 
    }, { status: 500 });
  }
}
