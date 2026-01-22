
import { NextRequest, NextResponse } from "next/server";
import { format, parse, isFuture, isSaturday, isSunday, isValid } from 'date-fns';
import { OptionDataPoint } from "@/app/types/option-chain";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const timeStr = searchParams.get('time'); // HH:mm
    const symbol = searchParams.get('symbol') || 'NIFTY'; // Default to NIFTY

    try {
        if (!dateStr || !timeStr) {
            return NextResponse.json({ error: 'Missing required query parameters: date, time' }, { status: 400 });
        }

        // --- Date Validation ---
        const requestedDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (!isValid(requestedDate)) {
            return NextResponse.json({ error: 'Invalid date format. Please use YYYY-MM-DD.' }, { status: 400 });
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (requestedDate > today) {
            return NextResponse.json({ error: 'Cannot fetch option chain data for a future date.' }, { status: 400 });
        }
        
        if (isSaturday(requestedDate) || isSunday(requestedDate)) {
            return NextResponse.json({ error: 'Cannot fetch data on a weekend. Please select a trading day.' }, { status: 400 });
        }

        // --- Fetch from NSE ---
        console.log(`Fetching new data from NSE for ${symbol} at ${dateStr} ${timeStr}`);

        // A more convincing User-Agent and headers to avoid being blocked.
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
        const nseBaseUrl = 'https://www.nseindia.com';
        const nseApiUrl = `${nseBaseUrl}/api/option-chain-indices?symbol=${symbol}`;

        const pageResponse = await fetch(nseBaseUrl, { 
            headers: { 
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        if (!pageResponse.ok) {
            throw new Error(`Could not access NSE homepage (status: ${pageResponse.status}). Cookies could not be retrieved.`);
        }
        
        const cookies = pageResponse.headers.getSetCookie().join('; ');

        if (!cookies) {
             throw new Error("Could not retrieve NSE session cookies. The site may be blocking automated requests.");
        }

        const apiResponse = await fetch(nseApiUrl, {
            headers: {
                'User-Agent': userAgent,
                'Cookie': cookies,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Referer': `${nseBaseUrl}/option-chain`
            }
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            throw new Error(`Failed to fetch data from NSE API: Status ${apiResponse.status}. ${errorText}`);
        }
        
        const responseText = await apiResponse.text();
        if (!responseText || !responseText.trim().startsWith('{')) {
            throw new Error("Received empty or non-JSON response from NSE API. This may be a non-trading day or an API issue.");
        }

        let rawData;
        try {
            rawData = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse JSON from NSE. Response text:", responseText.substring(0, 500) + "...");
            throw new Error("Could not parse data from NSE. The site may be blocking requests or is under maintenance.");
        }

        if (!rawData || !rawData.records || typeof rawData.records !== 'object' || !Array.isArray(rawData.records.data) || typeof rawData.records.underlyingValue === 'undefined') {
             throw new Error("Invalid or incomplete data structure from NSE API.");
        }

        const calls: OptionDataPoint[] = [];
        const puts: OptionDataPoint[] = [];

        rawData.records.data.forEach((item: any) => {
            if (item.CE) {
                calls.push({
                    strikePrice: item.strikePrice,
                    ltp: item.CE.lastPrice,
                    iv: item.CE.impliedVolatility,
                    oiChange: item.CE.changeinOpenInterest,
                    oi: item.CE.openInterest,
                });
            }
            if (item.PE) {
                puts.push({
                    strikePrice: item.strikePrice,
                    ltp: item.PE.lastPrice,
                    iv: item.PE.impliedVolatility,
                    oiChange: item.PE.changeinOpenInterest,
                    oi: item.PE.openInterest,
                });
            }
        });
        
        const responseData = {
            underlyingValue: rawData.records.underlyingValue,
            calls,
            puts,
        };

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error("[CRITICAL] Error in /api/nse-data route:", error.message);
        return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
    }
}
