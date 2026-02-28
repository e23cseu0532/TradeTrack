
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint, RapidAPINSEResponse } from "@/app/types/option-chain";
import { Loader2, Activity, RefreshCw, AlertCircle, Zap, Globe, Key } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export default function OptionChainPage() {
  const [snapshot, setSnapshot] = useState<RapidAPINSEResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<any | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();

      if (!response.ok) throw responseData;
      
      if (!responseData.optionChain?.result) throw { error: "Invalid API response structure" };

      setSnapshot(responseData);
      setLastUpdated(new Date());
      setIsSimulating(false);

    } catch (err: any) {
      console.warn("RapidAPI fetch failed:", err);
      setError(err);
    } finally {
      if (isInitialLoad) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true); 
    const intervalId = setInterval(() => {
        if (!isSimulating) fetchData(false);
    }, 60000); 
    return () => clearInterval(intervalId);
  }, [fetchData, isSimulating]);

  const startSimulation = () => {
    setIsSimulating(true);
    setError(null);
    
    const baseSpot = snapshot?.optionChain?.result?.[0]?.quote?.regularMarketPrice || 24500;
    
    const generateSimulatedData = (spot: number): RapidAPINSEResponse => {
        const strikes = Array.from({ length: 21 }, (_, i) => Math.round(spot / 100) * 100 - 1000 + (i * 100));
        return {
            optionChain: {
                result: [{
                    underlyingSymbol: "NIFTY",
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

    const simInterval = setInterval(() => {
        setSnapshot(prev => {
            const currentSpot = prev?.optionChain?.result?.[0]?.quote?.regularMarketPrice || 24500;
            const nextSpot = currentSpot + (Math.random() - 0.5) * 5;
            return generateSimulatedData(nextSpot);
        });
        setLastUpdated(new Date());
    }, 3000);

    return () => clearInterval(simInterval);
  };

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    if (!snapshot?.optionChain?.result?.[0]) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: 0 };
    }
    
    const result = snapshot.optionChain.result[0];
    const underlying = result.quote.regularMarketPrice;
    const chainData = result.options[0];
    
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

    const allStrikes = result.strikes.sort((a, b) => a - b);
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
                NSE Option Chain
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-muted-foreground">Powered by YH Finance via RapidAPI.</p>
                {!isSimulating && <Badge className="bg-success text-white">Live <Globe className="ml-1 h-3 w-3"/></Badge>}
                {isSimulating && <Badge className="bg-primary text-white">Simulation Mode <Zap className="ml-1 h-3 w-3 animate-pulse"/></Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading || isSimulating}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh Data
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
                        <AlertTitle>API Error</AlertTitle>
                        <AlertDescription className="mt-2">
                            <p className="mb-4">
                                {error.error || "Could not fetch data from RapidAPI. Make sure your RAPIDAPI_KEY is correctly configured."}
                            </p>
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={startSimulation}>
                                    <Zap className="mr-2 h-4 w-4" /> Start Simulation
                                </Button>
                                <Button variant="outline" size="sm" asChild>
                                    <a href="https://rapidapi.com/apidojo/api/yh-finance" target="_blank" rel="noopener noreferrer">
                                        <Key className="mr-2 h-4 w-4" /> Get Free Key
                                    </a>
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
           )}

          {snapshot && (
            <>
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
                            {isSimulating ? "Simulated Stream active" : `Last Updated: ${format(lastUpdated, "PPpp")}`}
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
