import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getCookie } from "cookies-next";

// This is a simplified in-memory cache for instrument data.
// In a production app, you might use Redis or a similar persistent cache.
let instrumentCache: any[] = [];
let lastCacheTime: number = 0;

async function getInstruments(kc: KiteConnect) {
    const now = Date.now();
    // Cache for 24 hours
    if (instrumentCache.length > 0 && (now - lastCacheTime < 24 * 60 * 60 * 1000)) {
        return instrumentCache;
    }

    try {
        const instruments = await kc.getInstruments(["NFO"]);
        instrumentCache = instruments;
        lastCacheTime = now;
        return instruments;
    } catch (error: any) {
        console.error("Kite API Error: Could not fetch instruments.", error);
        throw new Error("Could not fetch instruments from Kite API.");
    }
}

function findNiftyInstrument(instruments: any[]) {
    // Find the Nifty index instrument token to get its underlying value
    const niftyInstrument = instruments.find(
        (inst) => inst.tradingsymbol === "NIFTY 50" && inst.exchange === "NSE"
    );
    if (!niftyInstrument) {
        throw new Error("Could not find NIFTY 50 instrument in the instrument list.");
    }
    return niftyInstrument;
}

export async function GET(request: NextRequest) {
    const accessToken = getCookie("kite_access_token", { req: request });

    if (!accessToken) {
        return NextResponse.json({ error: "Access token not found. Please log in." }, { status: 401 });
    }

    try {
        const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
        kc.setAccessToken(accessToken as string);

        const allInstruments = await getInstruments(kc);
        const niftyInstrument = findNiftyInstrument(allInstruments);
        
        // Find the most recent (nearest) weekly expiry for NIFTY
        const niftyOptions = allInstruments.filter(
            (inst) => inst.name === "NIFTY" && inst.instrument_type === "CE"
        );

        if (niftyOptions.length === 0) {
             return NextResponse.json({ error: "No NIFTY options found." }, { status: 404 });
        }

        // Find the nearest expiry date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let nearestExpiry = new Date(niftyOptions[0].expiry);
        let minDiff = Math.abs(nearestExpiry.getTime() - today.getTime());

        for (const opt of niftyOptions) {
            const expiryDate = new Date(opt.expiry);
            const diff = Math.abs(expiryDate.getTime() - today.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                nearestExpiry = expiryDate;
            }
        }
        
        // Get all Call and Put options for the nearest expiry
        const nearestExpiryOptions = allInstruments.filter(
            inst => inst.name === "NIFTY" && new Date(inst.expiry).getTime() === nearestExpiry.getTime()
        );
        
        const instrumentSymbols = nearestExpiryOptions.map(inst => `${inst.exchange}:${inst.tradingsymbol}`);
        
        // Also fetch the underlying Nifty 50 quote
        instrumentSymbols.push(`${niftyInstrument.exchange}:${niftyInstrument.tradingsymbol}`);

        const quotes = await kc.getQuote(instrumentSymbols);

        const calls: any[] = [];
        const puts: any[] = [];
        let underlyingValue = 0;
        
        for (const symbol in quotes) {
            const quote = quotes[symbol];
            if (symbol === `${niftyInstrument.exchange}:${niftyInstrument.tradingsymbol}`) {
                 underlyingValue = quote.last_price || 0;
                 continue;
            }
            
            const instrumentDetail = nearestExpiryOptions.find(inst => `${inst.exchange}:${inst.tradingsymbol}` === symbol);
            if (!instrumentDetail) continue;

            const optionData = {
                strikePrice: instrumentDetail.strike,
                ltp: quote.last_price,
                iv: quote.oi ? quote.last_price : 0, // IV is not directly available, placeholder
                oiChange: quote.oi_day_high - quote.oi_day_low,
                oi: quote.oi,
            };

            if (instrumentDetail.instrument_type === 'CE') {
                calls.push(optionData);
            } else if (instrumentDetail.instrument_type === 'PE') {
                puts.push(optionData);
            }
        }
        
        const responseData = {
            underlyingValue,
            calls,
            puts,
        };

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error("[KITE API PROXY ERROR]", error);
        return NextResponse.json({ error: `Kite API Error: ${error.message}` }, { status: 500 });
    }
}
