
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint, RapidAPINSEResponse } from "@/app/types/option-chain";
import { Loader2, Activity, RefreshCw, AlertCircle, Zap, Globe, ShieldAlert, Database } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";

interface CacheDoc {
    id: string;
    snapshot: RapidAPINSEResponse;
    updatedAt: Timestamp;
}

export default function OptionChainPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number; tip?: string } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<RapidAPINSEResponse | null>(null);
  const [realSpotPrice, setRealSpotPrice] = useState<number | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Collaborative Public Cache (Firestore)
  const cacheRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'NIFTY');
  }, [firestore]);

  const { data: cachedData, isLoading: isCacheLoading } = useDoc<CacheDoc>(cacheRef);

  // Fetch the actual real-time spot price (usually not blocked by Yahoo)
  const fetchRealSpotPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/yahoo-finance?symbol=NIFTY');
      const data = await res.json();
      if (data.currentPrice) {
        setRealSpotPrice(data.currentPrice);
        return data.currentPrice;
      }
    } catch (e) {
      console.error("Failed to fetch real spot price", e);
    }
    return null;
  }, []);

  const generateSimulatedData = useCallback((spot: number): RapidAPINSEResponse => {
    const strikes = Array.from({ length: 21 }, (_, i) => Math.round(spot / 100) * 100 - 1000 + (i * 100));
    return {
        optionChain: {
            result: [{
                underlyingSymbol: "NIFTY (Smart Simulated)",
                expirationDates: [Math.floor(Date.now() / 1000)],
                strikes: strikes,
                quote: {
                    regularMarketPrice: spot,
                    regularMarketChange: 0,
                    regularMarketChangePercent: 0
                },
                options: [{
                    expirationDate: Math.floor(Date.now() / 1000),
                    hasMiniOptions: false,
                    calls: strikes.map(s => {
                        const intrinsic = Math.max(0, spot - s);
                        return {
                            strike: s,
                            lastPrice: intrinsic + 50 + Math.random() * 20,
                            impliedVolatility: 12 + Math.random() * 5,
                            openInterest: 50000 + Math.floor(Math.random() * 10000),
                            change: 0,
                            percentChange: 0
                        };
                    }),
                    puts: strikes.map(s => {
                        const intrinsic = Math.max(0, s - spot);
                        return {
                            strike: s,
                            lastPrice: intrinsic + 40 + Math.random() * 15,
                            impliedVolatility: 11 + Math.random() * 4,
                            openInterest: 45000 + Math.floor(Math.random() * 12000),
                            change: 0,
                            percentChange: 0
                        };
                    })
                }]
            }]
        }
    };
  }, []);

  const fetchData = useCallback(async (isForce = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();

      if (!response.ok) {
        throw { 
          message: responseData.error || "Failed to fetch data", 
          status: response.status,
          tip: responseData.tip
        };
      }
      
      if (!responseData.optionChain?.result) throw { message: "Invalid API response structure" };

      if (cacheRef) {
          setDoc(cacheRef, {
              snapshot: responseData,
              updatedAt: serverTimestamp(),
          }, { merge: true });
      }

      setIsSimulating(false);
      setSimulatedSnapshot(null);

    } catch (err: any) {
      console.warn("API fetch failed, auto-starting smart simulation:", err);
      setError(err);
      
      // AUTO-SIMULATION LOGIC: Use real spot price to drive simulation if API fails
      const spot = await fetchRealSpotPrice();
      setIsSimulating(true);
      setSimulatedSnapshot(generateSimulatedData(spot || 24500));
    } finally {
      setIsLoading(false);
    }
  }, [cacheRef, fetchRealSpotPrice, generateSimulatedData]);

  useEffect(() => {
    if (isCacheLoading) return;

    const now = new Date().getTime();
    const lastUpdate = cachedData?.updatedAt?.toDate()?.getTime() || 0;
    const isStale = (now - lastUpdate) > 15 * 60 * 1000; 

    if ((!cachedData || isStale) && !isSimulating && !error) {
        fetchData(false);
    } else {
        setIsLoading(false);
    }
  }, [cachedData, isCacheLoading, fetchData, isSimulating, error]);

  // Real-time spot updates for simulation
  useEffect(() => {
    if (isSimulating) {
        simIntervalRef.current = setInterval(async () => {
            const spot = await fetchRealSpotPrice();
            if (spot) {
                setSimulatedSnapshot(generateSimulatedData(spot));
            }
        }, 10000); // Update simulation every 10s based on real spot
    }
    return () => {
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [isSimulating, fetchRealSpotPrice, generateSimulatedData]);

  const snapshot = isSimulating ? simulatedSnapshot : cachedData?.snapshot;

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    if (!snapshot?.optionChain?.result?.[0]) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: realSpotPrice || 0 };
    }
    
    const result = snapshot.optionChain.result[0];
    const underlying = result.quote?.regularMarketPrice || realSpotPrice || 0;
    const chainData = result.options?.[0];
    
    if (!chainData) {
        return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying };
    }
    
    const callsData: OptionDataPoint[] = chainData.calls.map(c => ({
        strikePrice: c.strike,
        ltp: c.lastPrice,
        iv: c.impliedVolatility,
        oi: c.openInterest,
        change: c.change,
        pchange: c.percentChange
    }));

    const putsData: OptionDataPoint[] = chainData.puts.map(p => ({
        strikePrice: p.strike,
        ltp: p.lastPrice,
        iv: p.impliedVolatility,
        oi: p.openInterest,
        change: p.change,
        pchange: p.percentChange
    }));

    const allStrikes = (result.strikes || []).sort((a, b) => a - b);
    const closestStrike = (allStrikes.length > 0 && underlying > 0)
      ? allStrikes.reduce((prev, curr) => Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev)
      : null;

    return { calls: callsData, puts: putsData, atmStrike: closestStrike, underlyingValue: underlying };
  }, [snapshot, realSpotPrice]);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3">
                <Activity className="h-10 w-10" />
                NSE Option Chain
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-muted-foreground text-sm flex items-center gap-1">
                    <Database className="h-3 w-3" /> Shared Cloud Cache (15m window)
                </p>
                {!isSimulating && !error && snapshot && <Badge className="bg-success text-white">Live Sync <Globe className="ml-1 h-3 w-3"/></Badge>}
                {isSimulating && <Badge className="bg-primary text-white">Smart Simulation <Zap className="ml-1 h-3 w-3 animate-pulse"/></Badge>}
                {error && <Badge variant="destructive">Quota Hit: Failover Active</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Retry API Sync
                </Button>
            </div>
          </header>
          
          {(isLoading || isCacheLoading) && !snapshot && (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          )}

          {error && isSimulating && (
                <Alert className="mb-8 border-primary/50 bg-primary/5">
                    <Zap className="h-4 w-4" />
                    <AlertTitle className="font-bold">Smart Simulator Active</AlertTitle>
                    <AlertDescription>
                        The RapidAPI quota is exhausted ({error.status}). We are currently using the **Real-Time NIFTY Spot Price** ({realSpotPrice || 'loading...'}) to drive a high-fidelity simulated option chain so your calculators stay functional.
                    </AlertDescription>
                </Alert>
           )}

          {snapshot && (
            <>
              <Card className="mb-8 border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Market Status</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-2">
                    <div className="text-center p-6 border rounded-lg bg-background w-full max-w-sm shadow-sm">
                        <h4 className="font-semibold text-muted-foreground mb-2">NIFTY Spot</h4>
                        <div className="font-mono text-5xl font-bold text-primary">
                            <AnimatedCounter value={underlyingValue} precision={2}/>
                        </div>
                    </div>
                    {cachedData?.updatedAt && !isSimulating && (
                        <p className="text-xs text-muted-foreground text-center mt-2 flex items-center gap-1">
                            Last Shared Sync: {format(cachedData.updatedAt.toDate(), "PPpp")}
                        </p>
                    )}
                    {isSimulating && (
                        <p className="text-xs text-primary font-medium text-center mt-2 flex items-center gap-1 uppercase tracking-tighter">
                            <Zap className="h-3 w-3 animate-pulse" /> Driven by Real-Time Spot Price
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
