
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint } from "@/app/types/option-chain";
import { Loader2, Activity } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";

export default function OptionChainPage() {
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Fetch from our API proxy, which now hits the NSE API
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch data from server.');
      }
      const newSnapshotData = await response.json();
      
      // Validate the structure of the new data from NSE
      if (!newSnapshotData.records?.data) {
        // If there's a specific error message from the proxy, use it.
        const errorMessage = newSnapshotData.error || newSnapshotData.records?.message?.desc;
        throw new Error(errorMessage || 'Invalid data structure received from server.');
      }
      
      const newTimestamp = new Date(newSnapshotData.records.timestamp);
      setSnapshot(newSnapshotData.records); // Store the 'records' object in state
      setLastUpdated(newTimestamp);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(true); // Initial fetch
    const intervalId = setInterval(() => fetchData(false), 60000); // Refresh every 60 seconds
    return () => clearInterval(intervalId);
  }, [fetchData]);


  const { calls, puts, atmStrike } = useMemo(() => {
    // This logic is now tailored for the NSE API response structure
    if (!snapshot || !snapshot.data || !snapshot.underlyingValue) {
      return { calls: [], puts: [], atmStrike: null };
    }

    const underlying = snapshot.underlyingValue;
    // Filter for entries that have both Call and Put data for consistency
    const optionsData = (snapshot.data as any[]).filter(d => d.CE && d.PE);

    const allStrikes = [...new Set(optionsData.map(d => d.strikePrice))].sort((a, b) => a - b);
    
    if (allStrikes.length === 0) {
      return { calls: [], puts: [], atmStrike: null };
    }
    
    // Find the strike price closest to the underlying value (At-The-Money)
    const closestStrike = allStrikes.reduce((prev, curr) => 
      Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev
    );

    const atmIndex = allStrikes.findIndex(s => s === closestStrike);
    if (atmIndex === -1) {
       return { calls: [], puts: [], atmStrike: null };
    }

    // Display 4 ITM, ATM, and 4 OTM strikes
    const startIndex = Math.max(0, atmIndex - 4);
    const endIndex = Math.min(allStrikes.length, atmIndex + 5);
    const visibleStrikes = allStrikes.slice(startIndex, endIndex);

    const callsData: OptionDataPoint[] = [];
    const putsData: OptionDataPoint[] = [];

    visibleStrikes.forEach(strike => {
        const option = optionsData.find(d => d.strikePrice === strike);
        if (option) {
            // Extract Call data
            if (option.CE) {
                callsData.push({
                    strikePrice: option.CE.strikePrice,
                    ltp: option.CE.lastPrice,
                    iv: option.CE.impliedVolatility,
                    oi: option.CE.openInterest,
                });
            }
             // Extract Put data
            if (option.PE) {
                 putsData.push({
                    strikePrice: option.PE.strikePrice,
                    ltp: option.PE.lastPrice,
                    iv: option.PE.impliedVolatility,
                    oi: option.PE.openInterest,
                });
            }
        }
    });

    return {
      calls: callsData.sort((a,b) => a.strikePrice - b.strikePrice),
      puts: putsData.sort((a,b) => a.strikePrice - b.strikePrice),
      atmStrike: closestStrike,
    };
  }, [snapshot]);
  

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3 justify-center md:justify-start">
                <Activity className="h-10 w-10" />
                NIFTY Option Chain
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Public options data from the NSE API.
              </p>
            </div>
          </header>
          
          {isLoading && (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          )}

          {!isLoading && !error && (
            <>
              <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="font-headline">Data Snapshot</CardTitle>
                    <CardDescription>Displaying nearest-expiry options for NIFTY.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                    <div className="text-center p-6 border rounded-lg bg-muted/30 w-full max-w-sm">
                        <h4 className="font-semibold text-muted-foreground">NIFTY Underlying Value</h4>
                        <div className="font-mono text-4xl font-bold text-primary">
                            <AnimatedCounter value={snapshot?.underlyingValue || 0} precision={2}/>
                        </div>
                    </div>
                    {lastUpdated && (
                        <p className="text-sm text-muted-foreground text-center">
                            Last updated: {format(lastUpdated, "PPpp")}
                        </p>
                    )}
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <OptionChainTable title="Calls" data={calls} isLoading={isLoading} atmStrike={atmStrike} />
                  <OptionChainTable title="Puts" data={puts} isLoading={isLoading} atmStrike={atmStrike} />
              </div>
            </>
          )}

           {!isLoading && error && (
                <Card className="max-w-xl mx-auto text-center">
                    <CardHeader>
                        <CardTitle className="font-headline text-destructive">Error Fetching Data</CardTitle>
                        <CardDescription>There was a problem retrieving the option chain data from the server.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md">{error}</p>
                    </CardContent>
                </Card>
           )}

        </div>
      </main>
    </AppLayout>
  );
}
