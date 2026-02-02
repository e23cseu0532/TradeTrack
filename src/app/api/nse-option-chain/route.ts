import { NextRequest, NextResponse } from "next/server";
import { OptionDataPoint } from "@/app/types/option-chain";

// Main function to get data from NSE
async function getNSEOptionChain() {
  const baseUrl = "https://www.nseindia.com";
  const optionChainUrl = `${baseUrl}/api/option-chain-indices?symbol=NIFTY`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  };

  // Step 1: Fetch the base page to get initial cookies. This is crucial for establishing a valid session.
  const baseResponse = await fetch(baseUrl, { headers });

  // The `getSetCookie` method is not reliably available in all Node.js environments.
  // A more robust way is to find the 'set-cookie' headers manually by iterating over the response headers.
  const cookieHeaders: string[] = [];
  // The Headers object is iterable. We manually collect all 'set-cookie' headers.
  for (const [key, value] of (baseResponse.headers as any).entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      cookieHeaders.push(value);
    }
  }

  if (cookieHeaders.length === 0) {
    console.error("NSE Cookie Error: No 'set-cookie' headers found in the response from", baseUrl);
    throw new Error("Could not retrieve NSE cookies.");
  }
  
  // Each 'set-cookie' header is a full string like 'key=value; path=/; ...'. We only need the 'key=value' part for the 'Cookie' request header.
  const cookieString = cookieHeaders.map((c) => c.split(';')[0]).join('; ');
  
  const allHeaders = new Headers(headers);
  allHeaders.set('Cookie', cookieString);


  // Step 2: Fetch the option chain data with the prepared cookies.
  const response = await fetch(optionChainUrl, { headers: allHeaders });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("NSE API Error:", errorText);
    throw new Error(`Failed to fetch NSE option chain data. Status: ${response.status}`);
  }

  const json = await response.json();
  return json;
}

// Function to transform NSE data into our app's format
function transformNSEData(data: any) {
  if (!data.records || !data.filtered) {
    // NSE sometimes changes the structure, this provides a fallback.
    const relevantData = data.records?.data || [];
    if (relevantData.length === 0) {
        throw new Error("Invalid or empty data structure from NSE API. Records or filtered data not found.");
    }
  }
  
  const timestamp = new Date(data.records.timestamp).toISOString();
  const underlyingValue = data.records.underlyingValue;
  
  const calls: OptionDataPoint[] = [];
  const puts: OptionDataPoint[] = [];

  // Use filtered.data if available, otherwise fallback to records.data
  const sourceData = data.filtered?.data || data.records?.data || [];

  sourceData.forEach((item: any) => {
    if (item.CE) {
      const callData: OptionDataPoint = {
        strikePrice: item.strikePrice,
        ltp: item.CE.lastPrice,
        iv: item.CE.impliedVolatility,
        oiChange: item.CE.changeinOpenInterest,
        oi: item.CE.openInterest,
      };
      calls.push(callData);
    }
    if (item.PE) {
      const putData: OptionDataPoint = {
        strikePrice: item.strikePrice,
        ltp: item.PE.lastPrice,
        iv: item.PE.impliedVolatility,
        oiChange: item.PE.changeinOpenInterest,
        oi: item.PE.openInterest,
      };
      puts.push(putData);
    }
  });

  return {
    timestamp,
    underlyingValue,
    calls,
    puts,
  };
}


export async function GET(request: NextRequest) {
  try {
    const nseData = await getNSEOptionChain();
    const snapshot = transformNSEData(nseData);
    
    return NextResponse.json({ snapshot });

  } catch (error: any) {
    console.error("[NSE API PROXY ERROR]", error);
    return NextResponse.json({ error: `NSE API Error: ${error.message}` }, { status: 500 });
  }
}
