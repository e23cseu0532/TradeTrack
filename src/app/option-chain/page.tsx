
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { useFirestore } from "@/firebase";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionChainSnapshot, DailyOptionData, OptionDataPoint } from "@/app/types/option-chain";
import { Loader2, Activity } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";

export default function OptionChainPage() {
  const [snapshot, setSnapshot] = useState<Partial<OptionChainSnapshot> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const firestore = useFirestore();

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (!firestore) return;

    if (isInitialLoad) {
      setIsLoading(true);
    }
    setError(null);
    const today = format(new Date(), 'yyyy-MM-dd');
    const docRef = doc(firestore, 'optionChainData', today);

    try {
      // 1. Check cache first on initial load
      if (isInitialLoad) {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as DailyOptionData;
            const intervals = Object.keys(data.intervals || {});
            if (intervals.length > 0) {
              const latestInterval = intervals.sort().pop()!;
              const cachedSnapshot = data.intervals[latestInterval];
              const cacheTimestamp = (cachedSnapshot.timestamp as unknown as Timestamp).toDate();
              const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

              if (cacheTimestamp > fiveMinutesAgo) {
                setSnapshot(cachedSnapshot);
                setLastUpdated(cacheTimestamp);
                setIsLoading(false);
                return; // Exit if fresh cache is found
              }
            }
          }
      }

      // 2. Fetch from our new API if cache is stale, doesn't exist, or on a refresh
      const response = await fetch('/api/nse-option-chain');
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch data from server.');
      }
      const { snapshot: newSnapshot } = await response.json();
      
      const newTimestamp = new Date(newSnapshot.timestamp);
      setSnapshot(newSnapshot);
      setLastUpdated(newTimestamp);

      // 3. Update the cache in Firestore
      const intervalKey = format(newTimestamp, 'HHmm');
      const snapshotForFirestore = {
        ...newSnapshot,
        timestamp: Timestamp.fromDate(newTimestamp),
      };
      const newIntervalData = {
          [`intervals.${intervalKey}`]: snapshotForFirestore
      };
      await setDoc(docRef, newIntervalData, { merge: true });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, [firestore]);

  useEffect(() => {
    fetchData(true); // Initial fetch
    const intervalId = setInterval(() => fetchData(false), 60000); // Refresh every 60 seconds
    return () => clearInterval(intervalId);
  }, [fetchData]);


  const { calls, puts, atmStrike } = useMemo(() => {
    if (!snapshot || !snapshot.calls || !snapshot.puts) {
      return { calls: [], puts: [], atmStrike: null };
    }

    const underlying = snapshot.underlyingValue || 0;
    const allStrikes = [...new Set([
        ...snapshot.calls.map(c => c.strikePrice),
        ...snapshot.puts.map(p => p.strikePrice)
    ])].sort((a, b) => a - b);
    
    if (allStrikes.length === 0) {
      return { calls: [], puts: [], atmStrike: null };
    }
    
    const closestStrike = allStrikes.reduce((prev, curr) => 
      Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev
    );

    const atmIndex = allStrikes.findIndex(s => s === closestStrike);
    if (atmIndex === -1) {
       return { calls: [], puts: [], atmStrike: null };
    }

    const startIndex = Math.max(0, atmIndex - 4);
    const endIndex = Math.min(allStrikes.length, atmIndex + 5);
    const visibleStrikes = allStrikes.slice(startIndex, endIndex);

    const filterAndMap = (data: OptionDataPoint[]) => {
      return visibleStrikes.map(strike => {
        return data.find(d => d.strikePrice === strike) || { strikePrice: strike, ltp: 0, iv: 0, oiChange: 0, oi: 0 };
      }).sort((a,b) => a.strikePrice - b.strikePrice);
    };

    return {
      calls: filterAndMap(snapshot.calls),
      puts: filterAndMap(snapshot.puts),
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
                Public options data from NSE, cached for performance.
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
