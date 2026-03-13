
import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Proxy for Frontend
 * Implementation based on Groww API Documentation
 */

// Helper to generate the next 4 Thursdays (Standard NSE Expiry Days)
function getNextThursdays() {
  const dates = [];
  const today = new Date();
  let day = new Date(today);
  
  // Find the first Thursday
  day.setDate(today.getDate() + (3 - today.getDay() + 7) % 7);
  
  for (let i = 0; i < 4; i++) {
    const expiry = new Date(day);
    expiry.setDate(day.getDate() + (i * 7));
    dates.push(expiry.toISOString().split('T')[0]);
  }
  return dates;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const getOptions = searchParams.get('options') === 'true';
  const expiryDate = searchParams.get('expiry_date');
  
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
    // 1. If we need expiries but none provided, return generated ones
    if (getOptions && !expiryDate) {
      const expiries = getNextThursdays();
      return NextResponse.json(expiries);
    }

    // 2. Normalize symbol for Groww
    let underlying = symbol.toUpperCase();
    if (underlying === 'NIFTY 50') underlying = 'NIFTY';
    
    let url = "";

    if (getOptions && expiryDate) {
      // Correct endpoint from docs: .../underlying/{symbol}?expiry_date={date}
      url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${expiryDate}`;
    } else {
      // Get Last Traded Price (LTP)
      // Standard format: NSE_SYMBOL
      url = `https://api.groww.in/v1/live/market/v1/last_traded_price/NSE_${underlying.replace(/\s/g, '_')}`;
    }

    console.log(`Fetching from Groww: ${url}`);
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`Groww API error: ${response.status} at ${url}`);
      return NextResponse.json({ 
        error: `Failed to fetch from Groww: ${response.status}`,
        status: response.status 
      }, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data.payload || data);

  } catch (error: any) {
    console.error("Groww API Proxy Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
