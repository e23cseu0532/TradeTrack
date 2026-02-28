
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint } from "@/app/types/option-chain";
import { Loader2, Activity, RefreshCw, AlertCircle, Info, Zap, Database, Globe } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function OptionChainPage() {
  const db = useFirestore();
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "cache" | "mock" | null>(null);

  const fetchCache = useCallback(async () => {
    try {
      const cacheRef = doc(db, "optionChainData", "NIFTY");
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        setSnapshot(data.snapshot);
        setLastUpdated(data.updatedAt?.toDate() || new Date());
        setDataSource("cache");
        return true;
      }
    } catch (e) {
      console.error("Cache read failed", e);
    }
    return false;
  }, [db]);

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();

      if (!response.ok) throw responseData;
      
      const result = responseData.optionChain?.result?.[0];
      if (!result) throw { error: "Empty response" };

      setSnapshot(responseData);
      setLastUpdated(new Date());
      setDataSource("live");
      
      // Update shared cache for other users
      setDoc(doc(db, "optionChainData", "NIFTY"), {
        snapshot: responseData,
        updatedAt: new Date(),
      }, { merge: true });

    } catch (err: any) {
      console.warn("Live fetch failed, attempting cache...", err);
      const cacheFound = await fetchCache();
      if (!cacheFound) {
        setError(err);
      }
    } finally {
      if (isInitialLoad) setIsLoading(false);
    }
  }, [db, fetchCache]);

  useEffect(() => {
    fetchData(true); 
    const intervalId = setInterval(() => fetchData(false), 60000); 
    return () => clearInterval(intervalId);
  }, [fetchData]);

  const useMockData = () => {
    const mockValue = 24500;
    const strikes = Array.from({ length: 11 }, (_, i) => 24000 + (i * 100));
    const mockResult = {
      optionChain: {
        result: [{
          quote: { regularMarketPrice: mockValue },
          options: [{
            calls: strikes.map(s => ({ strike: s, lastPrice: 100 + Math.random() * 50, impliedVolatility: 0.12, openInterest: 50000 })),
            puts: strikes.map(s => ({ strike: s, lastPrice: 80 + Math.random() * 40, impliedVolatility: 0.11, openInterest: 45000 }))
          }]
        }]
      }
    };
    setSnapshot(mockResult);
    setLastUpdated(new Date());
    setDataSource("mock");
    setError(null);
  };

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    if (!snapshot?.optionChain?.result?.[0]) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: 0 };
    }
    const result = snapshot.optionChain.result[0];
    const underlying = result.quote?.regularMarketPrice || 0;
    const nearestOptions = result.options?.[0] || {};
    
    const callsData: OptionDataPoint[] = (nearestOptions.calls || []).map((o: any) => ({
      strikePrice: o.strike, ltp: o.lastPrice, iv: o.impliedVolatility, oi: o.openInterest
    }));
    const putsData: OptionDataPoint[] = (nearestOptions.puts || []).map((o: any) => ({
      strikePrice: o.strike, ltp: o.lastPrice, iv: o.impliedVolatility, oi: o.openInterest
    }));

    const allStrikes = [...new Set([...callsData, ...putsData].map(d => d.strikePrice))].sort((a, b) => a - b);
    const closestStrike = allStrikes.length > 0 
      ? allStrikes.reduce((prev, curr) => Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev)
      : null;

    return { calls: callsData, puts: putsData, atmStrike: closestStrike, underlyingValue: underlying };
  }, [snapshot]);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3">
                <Activity className="h-10 w-10" />
                NIFTY Option Chain
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-muted-foreground">Live options data via Yahoo Finance.</p>
                {dataSource === "live" && <Badge className="bg-success text-white">Live <Globe className="ml-1 h-3 w-3"/></Badge>}
                {dataSource === "cache" && <Badge variant="secondary">Cached <Database className="ml-1 h-3 w-3"/></Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>
          </header>
          
          {isLoading && !snapshot && (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          )}

          {error && !snapshot && (
                <div className="max-w-3xl mx-auto mb-8">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Network Restriction</AlertTitle>
                        <AlertDescription className="mt-2">
                            <p className="mb-4">Yahoo Finance is currently blocking live requests from this cloud region (Error 401). No cached data is available yet.</p>
                            <Button variant="secondary" size="sm" onClick={useMockData}>
                                <Zap className="mr-2 h-4 w-4" /> Start Simulation
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>
           )}

          {snapshot && (
            <>
              {dataSource === "cache" && (
                <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
                  <Database className="h-4 w-4" />
                  <AlertTitle>Displaying Cached Snapshot</AlertTitle>
                  <AlertDescription>
                    Live API is restricted. Showing the latest data contributed by the TradeTrack community.
                  </AlertDescription>
                </Alert>
              )}

              <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Market Overview</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                    <div className="text-center p-6 border rounded-lg bg-muted/30 w-full max-w-sm">
                        <h4 className="font-semibold text-muted-foreground">NIFTY Spot</h4>
                        <div className="font-mono text-4xl font-bold text-primary">
                            <AnimatedCounter value={underlyingValue} precision={2}/>
                        </div>
                    </div>
                    {lastUpdated && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                            Snapshot Time: {format(lastUpdated, "PPpp")}
                        </p>
                    )}
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <OptionChainTable title="Calls" data={calls} isLoading={isLoading && !snapshot} atmStrike={atmStrike} />
                  <OptionChainTable title="Puts" data={puts} isLoading={isLoading && !snapshot} atmStrike={atmStrike} />
              </div>
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
