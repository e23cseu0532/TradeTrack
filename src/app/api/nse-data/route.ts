
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { format, parse, getMinutes, getHours, set, isFuture, isSaturday, isSunday, isValid } from 'date-fns';
import { DailyOptionData, OptionChainSnapshot, OptionDataPoint } from "@/app/types/option-chain";

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
        
        // Check for future dates, accounting for potential timezone differences by comparing only the date part.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (requestedDate > today) {
            return NextResponse.json({ error: 'Cannot fetch option chain data for a future date.' }, { status: 400 });
        }
        
        if (isSaturday(requestedDate) || isSunday(requestedDate)) {
            return NextResponse.json({ error: 'Cannot fetch data on a weekend. Please select a trading day.' }, { status: 400 });
        }

        const { firestore } = initializeFirebase();
        const docId = dateStr;
        const intervalKey = timeStr.replace(':', '');
        const docRef = doc(firestore, "optionChainData", docId);

    
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data() as DailyOptionData;
            if (data.intervals && data.intervals[intervalKey]) {
                // Return cached data
                return NextResponse.json(data.intervals[intervalKey]);
            }
        }

        // --- If no cached data, fetch from NSE ---
        console.log(`Fetching new data from NSE for ${symbol} at ${dateStr} ${timeStr}`);

        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        const nseBaseUrl = 'https://www.nseindia.com';
        const nseApiUrl = `${nseBaseUrl}/api/option-chain-indices?symbol=${symbol}`;

        // Step 1: Fetch the main page to get session cookies
        const pageResponse = await fetch(nseBaseUrl, { headers: { 'User-Agent': userAgent } });
        if (!pageResponse.ok) {
            throw new Error(`Could not access NSE homepage (status: ${pageResponse.status}). Cookies could not be retrieved.`);
        }
        
        // Correctly handle multiple 'set-cookie' headers
        const cookies = pageResponse.headers.getSetCookie().join('; ');

        if (!cookies) {
             throw new Error("Could not retrieve NSE session cookies. The site may be blocking automated requests.");
        }

        // Step 2: Fetch the API data with the session cookies
        const apiResponse = await fetch(nseApiUrl, {
            headers: {
                'User-Agent': userAgent,
                'Cookie': cookies,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Referer': `${nseBaseUrl}/option-chain` // Add referer header
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
        
        const snapshot: OptionChainSnapshot = {
            timestamp: Timestamp.now(),
            underlyingValue: rawData.records.underlyingValue,
            calls,
            puts,
        };

        // Save the new snapshot to Firestore
        await setDoc(docRef, {
            intervals: {
                [intervalKey]: snapshot
            }
        }, { merge: true });

        // Return the newly fetched data
        return NextResponse.json(snapshot);

    } catch (error: any) {
        console.error("[CRITICAL] Error in /api/nse-data route:", error.message);
        return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
    }
}
