
import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Proxy for Frontend
 * Updated to match the documentation provided.
 */

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
    // Normalize symbol for Groww
    let underlying = symbol.toUpperCase();
    if (underlying === 'NIFTY 50') underlying = 'NIFTY';
    
    let url = "";

    if (getOptions) {
      if (expiryDate) {
        // Get specific option chain data
        url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${underlying}?expiry_date=${expiryDate}`;
      } else {
        // Get list of expiry dates
        url = `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${underlying}/expiry`;
      }
    } else {
      // Get Last Traded Price (LTP)
      // Note: This matches the pattern for the live market data endpoint
      url = `https://api.groww.in/v1/live/market/v1/last_traded_price/NSE_${underlying.replace(' ', '_')}`;
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
    
    // Return the payload or the data itself based on response structure
    return NextResponse.json(data.payload || data);

  } catch (error: any) {
    console.error("Groww API Proxy Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
