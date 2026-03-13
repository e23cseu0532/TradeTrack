import { NextRequest, NextResponse } from 'next/server';

/**
 * Groww API Proxy for Frontend
 * Despite the name 'yahoo-finance', this route is configured to talk to Groww API.
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
    'X-API-VERSION': '1.0'
  };

  try {
    // Normalize symbol for Groww slugs
    let underlying = symbol.toUpperCase().replace(/\s+/g, '');
    if (underlying === 'NIFTY50') underlying = 'NIFTY';
    
    const slug = underlying.toLowerCase();

    if (getOptions) {
      // Use the internal Groww endpoint that returns the whole chain including expiries
      const url = `https://api.groww.in/v1/api/v1/option_chain/${slug}`;
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groww API error: ${response.status} - ${errorText}`);
        return NextResponse.json({ error: `Failed to fetch from Groww: ${response.status}` }, { status: response.status });
      }
      
      const data = await response.json();
      return NextResponse.json(data);
    } else {
      // Get LTP using the live market endpoint
      const ltpUrl = `https://api.groww.in/v1/live/market/v1/last_traded_price/NSE_${underlying}`;
      const ltpRes = await fetch(ltpUrl, { headers });

      if (!ltpRes.ok) {
        // Fallback for UI stability
        return NextResponse.json({ currentPrice: 0, error: "LTP fetch failed" });
      }

      const ltpData = await ltpRes.json();
      return NextResponse.json({ 
        currentPrice: ltpData.last_price || ltpData.price || 0 
      });
    }
  } catch (error: any) {
    console.error("Groww API Proxy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
