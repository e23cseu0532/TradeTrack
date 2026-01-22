import { NextRequest, NextResponse } from "next/server";
import { getFirestore, doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { format, parse, getMinutes, getHours, set } from 'date-fns';
import { DailyOptionData, OptionChainSnapshot, OptionDataPoint } from "@/app/types/option-chain";

// Helper function to get the current 30-minute interval key
function getIntervalKey(now: Date): string {
    const hours = getHours(now);
    let minutes = getMinutes(now);

    if (minutes < 15) minutes = 45;
    else if (minutes < 45) minutes = 15;
    else minutes = 45;
    
    // For 3:30 PM case
    if (hours === 15 && getMinutes(now) >= 30) {
        return "1530";
    }
    
    const intervalDate = set(now, { hours, minutes, seconds: 0, milliseconds: 0 });
    
    return format(intervalDate, 'HHmm');
}


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // YYYY-MM-DD
    const timeStr = searchParams.get('time'); // HH:mm
    const symbol = searchParams.get('symbol') || 'NIFTY'; // Default to NIFTY

    if (!dateStr || !timeStr) {
        return NextResponse.json({ error: 'Missing required query parameters: date, time' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const docId = dateStr;
    const intervalKey = timeStr.replace(':', '');
    const docRef = doc(firestore, "optionChainData", docId);

    try {
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
        const cookies = pageResponse.headers.get('set-cookie') || '';

        if (!cookies) {
             throw new Error("Could not retrieve NSE session cookies.");
        }

        // Step 2: Fetch the API data with the session cookies
        const apiResponse = await fetch(nseApiUrl, {
            headers: {
                'User-Agent': userAgent,
                'Cookie': cookies,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            throw new Error(`Failed to fetch data from NSE API: ${apiResponse.status} ${errorText}`);
        }
        
        const responseText = await apiResponse.text();
        let rawData;
        try {
            rawData = JSON.parse(responseText);
        } catch (e) {
            console.error("Failed to parse JSON from NSE. Response text:", responseText.substring(0, 500) + "...");
            throw new Error("Could not parse data from NSE. The site may be blocking requests or is under maintenance.");
        }


        if (!rawData.records || !rawData.records.data) {
             throw new Error("Invalid data structure from NSE API.");
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
        console.error("Error in NSE Data API route:", error);
        return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
    }
}
