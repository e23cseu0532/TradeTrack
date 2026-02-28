
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
  const [dataSource, setDataSource] = useState<"live" | "cache" | "simulation" | null>(null);

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
    const intervalId = setInterval(() => {
        if (dataSource === "live") fetchData(false);
    }, 60000); 
    return () => clearInterval(intervalId);
  }, [fetchData, dataSource]);

  // Start Simulation Mode: Fluctuates data based on a base value
  const startSimulation = async () => {
    setIsLoading(true);
    setError(null);
    try {
        // Try to get a real spot price for the simulation base
        const priceRes = await fetch('/api/yahoo-finance?symbol=NIFTY');
        const priceData = await priceRes.json();
        const baseSpot = priceData.currentPrice || 24500;
        
        const generateSimulatedData = (spot: number) => {
            const strikes = Array.from({ length: 15 }, (_, i) => Math.round(spot / 100) * 100 - 700 + (i * 100));
            return {
                optionChain: {
                    result: [{
                        quote: { regularMarketPrice: spot },
                        options: [{
                            calls: strikes.map(s => {
                                const intrinsic = Math.max(0, spot - s);
                                return { 
                                    strike: s, 
                                    lastPrice: intrinsic + 50 + Math.random() * 20, 
                                    impliedVolatility: 0.12 + Math.random() * 0.05, 
                                    openInterest: 50000 + Math.floor(Math.random() * 10000) 
                                };
                            }),
                            puts: strikes.map(s => {
                                const intrinsic = Math.max(0, s - spot);
                                return { 
                                    strike: s, 
                                    lastPrice: intrinsic + 40 + Math.random() * 15, 
                                    impliedVolatility: 0.11 + Math.random() * 0.04, 
                                    openInterest: 45000 + Math.floor(Math.random() * 12000) 
                                };
                            })
                        }]
                    }]
                }
            };
        };

        setSnapshot(generateSimulatedData(baseSpot));
        setLastUpdated(new Date());
        setDataSource("simulation");

        // Continuously fluctuate the simulation
        const simInterval = setInterval(() => {
            setSnapshot((prev: any) => {
                if (!prev) return prev;
                const currentSpot = prev.optionChain.result[0].quote.regularMarketPrice;
                const nextSpot = currentSpot + (Math.random() - 0.5) * 5; // Small drift
                return generateSimulatedData(nextSpot);
            });
            setLastUpdated(new Date());
        }, 3000);

        return () => clearInterval(simInterval);

    } catch (e) {
        console.error("Simulation failed", e);
    } finally {
        setIsLoading(false);
    }
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
                <p className="text-muted-foreground">Free NSE data for your dashboard.</p>
                {dataSource === "live" && <Badge className="bg-success text-white">Live <Globe className="ml-1 h-3 w-3"/></Badge>}
                {dataSource === "cache" && <Badge variant="secondary">Community Cache <Database className="ml-1 h-3 w-3"/></Badge>}
                {dataSource === "simulation" && <Badge className="bg-primary text-white">Live Simulation <Zap className="ml-1 h-3 w-3 animate-pulse"/></Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh API
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
                        <AlertTitle>API Access Restricted</AlertTitle>
                        <AlertDescription className="mt-2">
                            <p className="mb-4">Yahoo Finance is currently blocking requests from this region. Start Simulation to continue testing with realistic moving data.</p>
                            <Button variant="secondary" size="sm" onClick={startSimulation}>
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
                  <AlertTitle>Using Collaborative Snapshot</AlertTitle>
                  <AlertDescription>
                    The live API is temporarily restricted. Showing the latest data contributed by another user in the community.
                  </AlertDescription>
                </Alert>
              )}

              <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Market Overview</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                    <div className="text-center p-6 border rounded-lg bg-muted/30 w-full max-w-sm transition-all duration-1000">
                        <h4 className="font-semibold text-muted-foreground">NIFTY Spot</h4>
                        <div className="font-mono text-4xl font-bold text-primary">
                            <AnimatedCounter value={underlyingValue} precision={2}/>
                        </div>
                    </div>
                    {lastUpdated && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                            {dataSource === "simulation" ? "Simulated Stream active" : `Last Updated: ${format(lastUpdated, "PPpp")}`}
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
