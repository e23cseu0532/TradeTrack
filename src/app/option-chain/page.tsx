
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint, RapidAPINSEResponse } from "@/app/types/option-chain";
import { Loader2, Activity, RefreshCw, AlertCircle, Zap, Globe, ShieldAlert, ExternalLink, Database } from "lucide-react";
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
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Collaborative Public Cache (Firestore)
  // Shared across ALL users to stay within RapidAPI limits.
  const cacheRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'NIFTY');
  }, [firestore]);

  const { data: cachedData, isLoading: isCacheLoading } = useDoc<CacheDoc>(cacheRef);

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

      // Update the collaborative cache for other users
      if (cacheRef) {
          setDoc(cacheRef, {
              snapshot: responseData,
              updatedAt: serverTimestamp(),
          }, { merge: true });
      }

      setIsSimulating(false);
      setSimulatedSnapshot(null);

    } catch (err: any) {
      console.warn("API fetch failed, checking if we can use existing cache:", err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [cacheRef]);

  // 2. Limit-Protection Logic
  useEffect(() => {
    if (isCacheLoading) return;

    const now = new Date().getTime();
    const lastUpdate = cachedData?.updatedAt?.toDate()?.getTime() || 0;
    
    // COLLABORATIVE COOLDOWN: 15 minutes
    // If ANY user synced in the last 15 mins, we don't call the API.
    const isStale = (now - lastUpdate) > 15 * 60 * 1000; 

    if ((!cachedData || isStale) && !isSimulating && !error) {
        fetchData(false);
    } else {
        setIsLoading(false);
    }
  }, [cachedData, isCacheLoading, fetchData, isSimulating, error]);

  const startSimulation = () => {
    setIsSimulating(true);
    setError(null);
    
    const baseSpot = cachedData?.snapshot?.optionChain?.result?.[0]?.quote?.regularMarketPrice || 24500;
    
    const generateSimulatedData = (spot: number): RapidAPINSEResponse => {
        const strikes = Array.from({ length: 21 }, (_, i) => Math.round(spot / 100) * 100 - 1000 + (i * 100));
        return {
            optionChain: {
                result: [{
                    underlyingSymbol: "NIFTY (Simulated)",
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
    };

    setSimulatedSnapshot(generateSimulatedData(baseSpot));

    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    simIntervalRef.current = setInterval(() => {
        setSimulatedSnapshot(prev => {
            const currentSpot = prev?.optionChain.result[0].quote.regularMarketPrice || baseSpot;
            const newSpot = currentSpot + (Math.random() - 0.5) * 10;
            return generateSimulatedData(newSpot);
        });
    }, 3000);
  };

  useEffect(() => {
    return () => {
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // Use simulated data if active, otherwise use cachedData
  const snapshot = isSimulating ? simulatedSnapshot : cachedData?.snapshot;

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    if (!snapshot?.optionChain?.result?.[0]) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: 0 };
    }
    
    const result = snapshot.optionChain.result[0];
    const underlying = result.quote?.regularMarketPrice || 0;
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
  }, [snapshot]);

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
                {isSimulating && <Badge className="bg-primary text-white">Simulation Mode <Zap className="ml-1 h-3 w-3 animate-pulse"/></Badge>}
                {error && <Badge variant="destructive">Sync Error</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading || isSimulating}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Force API Sync
                </Button>
            </div>
          </header>
          
          {(isLoading || isCacheLoading) && !snapshot && (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          )}

          {error && (
                <div className="max-w-3xl mx-auto mb-8">
                    <Alert variant="destructive" className="border-2">
                        {error.status === 403 ? <ShieldAlert className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                        <AlertTitle className="text-lg font-bold">
                            {error.status === 403 ? "Access Forbidden (403)" : error.status === 429 ? "Limit Reached (429)" : "API Error"}
                        </AlertTitle>
                        <AlertDescription className="mt-2 text-base">
                            <p className="mb-4">
                                {error.message}
                                {error.status === 403 && (
                                    <span className="block mt-2 font-medium bg-destructive/10 p-2 rounded">
                                        Tip: Subscribe to 'Yahoo Finance 15' on RapidAPI to enable cloud syncing.
                                    </span>
                                )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" onClick={startSimulation}>
                                    <Zap className="mr-2 h-4 w-4" /> Start Simulation Mode
                                </Button>
                                <Button variant="outline" size="sm" asChild className="bg-background">
                                    <a href="https://rapidapi.com/apidojo/api/yahoo-finance15" target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" /> Check Subscription
                                    </a>
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
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
                        <p className="text-xs text-primary font-medium text-center mt-2 flex items-center gap-1">
                            <Zap className="h-3 w-3 animate-pulse" /> Live Simulation Active
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
