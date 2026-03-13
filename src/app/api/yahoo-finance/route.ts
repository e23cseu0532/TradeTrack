
import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Proxy for Frontend
 * Handles fetching expiry dates and LTP (Last Traded Price)
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const getOptions = searchParams.get('options') === 'true';
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
    // Normalize symbol for Groww slugs
    let underlying = symbol.toUpperCase().replace(/\s+/g, '');
    if (underlying === 'NIFTY50') underlying = 'NIFTY';
    const slug = underlying.toLowerCase();

    if (getOptions) {
      // Correct Groww endpoint for fetching the list of expiry dates
      const url = `https://api.groww.in/v1/option-chain/v1/option_chain/${slug}/expiry`;
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`Groww Expiry API error: ${response.status}`);
        return NextResponse.json({ error: `Failed to fetch from Groww: ${response.status}` }, { status: response.status });
      }
      
      const data = await response.json();
      
      // Extract expiries (can be a direct array or wrapped in an object)
      const expiries = Array.isArray(data) ? data : (data.expiries || []);
      
      return NextResponse.json({ expiries });
    } else {
      // Get Last Traded Price (LTP) using the live market endpoint
      // Example symbol: NSE_NIFTY
      const ltpUrl = `https://api.groww.in/v1/live/market/v1/last_traded_price/NSE_${underlying}`;
      const ltpRes = await fetch(ltpUrl, { headers });

      if (!ltpRes.ok) {
        console.error(`Groww LTP API error: ${ltpRes.status}`);
        return NextResponse.json({ currentPrice: 0, error: "LTP fetch failed" });
      }

      const ltpData = await ltpRes.json();
      // Handle different possible response structures for LTP
      const price = ltpData.last_price || ltpData.price || 0;
      
      return NextResponse.json({ 
        currentPrice: price 
      });
    }
  } catch (error: any) {
    console.error("Groww API Proxy Exception:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
