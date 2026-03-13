import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Proxy for Frontend
 * Using the endpoint structure from the documentation:
 * GET https://api.groww.in/v1/option-chain/exchange/{exchange}/underlying/{underlying}?expiry_date={expiry_date}
 */

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
  let symbol = searchParams.get('symbol') || 'NIFTY';
  const getOptions = searchParams.get('options') === 'true';
  const expiryDate = searchParams.get('expiry_date');
  
  // Normalize symbol for Groww
  symbol = symbol.toUpperCase().replace(/\s/g, '');
  if (symbol === 'NIFTY50') symbol = 'NIFTY';

  const apiToken = process.env.GROWW_API_TOKEN;

  if (!apiToken) {
    return NextResponse.json({ error: "GROWW_API_TOKEN is not configured" }, { status: 500 });
  }

  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    'X-API-VERSION': '1.0',
    'Accept': 'application/json'
  };

  try {
    // If requesting options but no expiry date provided, return the generated list
    if (getOptions && !expiryDate) {
      const expiries = getNextThursdays();
      return NextResponse.json(expiries);
    }

    let url = "";
    if (getOptions && expiryDate) {
      // Endpoint: https://api.groww.in/v1/option-chain/exchange/{exchange}/underlying/{underlying}?expiry_date={expiry_date}
      url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${symbol}?expiry_date=${expiryDate}`;
    } else {
      // Get Last Traded Price (LTP)
      // Note: Different endpoint for LTP often used in Groww, but following the general pattern
      url = `https://api.groww.in/v1/live/market/v1/last_traded_price/NSE_${symbol}`;
    }

    console.log(`Fetching from Groww: ${url}`);
    
    const response = await fetch(url, { 
      headers,
      next: { revalidate: 0 } // Disable caching for live data
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groww API error: ${response.status} ${errorText}`);
      return NextResponse.json({ 
        error: `Failed to fetch from Groww: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }
    
    const data = await response.json();
    // Groww usually wraps the data in a "payload" object
    return NextResponse.json(data.payload || data);

  } catch (error: any) {
    console.error("Groww API Proxy Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
