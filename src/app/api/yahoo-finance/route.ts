import { NextRequest, NextResponse } from 'next/server';

function getNextThursdays() {
  const dates = [];
  const today = new Date();
  let day = new Date(today);
  
  // Get next Thursday (4 is Thursday in JS getDay where 0 is Sunday)
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

  // CASE 1: Handle Option Chain requests via Groww API
  if (isOptionsRequest) {
    if (isExpiryRequest) {
      return NextResponse.json(getNextThursdays());
    }

    const apiToken = process.env.GROWW_API_TOKEN;
    if (!apiToken || apiToken === 'your_token_here') {
      return NextResponse.json({ error: "GROWW_API_TOKEN is missing or invalid" }, { status: 500 });
    }

    const normalizedSymbol = symbol?.toUpperCase().replace(/\s/g, '') || 'NIFTY';
    const cleanSymbol = normalizedSymbol === 'NIFTY50' ? 'NIFTY' : normalizedSymbol;
    
    // Default to the first available Thursday if no expiry provided
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

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Groww API Error: ${response.status}`, errorBody);
        throw new Error(`Groww API responded with status ${response.status}`);
      }

      const data = await response.json();
      return NextResponse.json(data.payload || data);
    } catch (error: any) {
      console.error("Groww API Fetch Failure:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // CASE 2: Handle General Stock Data (Proxy to Python Backend which uses Yahoo Finance)
  try {
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5000';
    const queryString = searchParams.toString();
    
    // Proxying to the Python server's stock data endpoint
    const response = await fetch(`${pythonBackendUrl}/api/stock_data?${queryString}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Python backend error: ${response.status}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("General Stock Data Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch stock data from backend" }, { status: 500 });
  }
}