
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint } from "@/app/types/option-chain";
import { Loader2, Activity, RefreshCw, AlertCircle } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
      // Use NIFTY which is mapped to ^NSEI in the API route
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to fetch data from Yahoo Finance.');
      }
      
      const result = responseData.optionChain?.result?.[0];
      if (!result) {
        throw new Error("Invalid response format from Yahoo Finance.");
      }
      
      const newTimestamp = result.quote?.regularMarketTime 
        ? new Date(result.quote.regularMarketTime * 1000) 
        : new Date();

      setSnapshot(responseData); 
      setLastUpdated(newTimestamp);

    } catch (err: any) {
      console.error("[OPTION CHAIN FETCH ERROR]", err);
      setError(err.message);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(true); 
    const intervalId = setInterval(() => fetchData(false), 60000); 
    return () => clearInterval(intervalId);
  }, [fetchData]);


  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    if (!snapshot || !snapshot.optionChain || !snapshot.optionChain.result[0]) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: 0 };
    }

    const result = snapshot.optionChain.result[0];
    const underlying = result.quote?.regularMarketPrice || 0;
    
    // Yahoo provides an array of 'options' (one per expiration). We take the first (nearest).
    const nearestOptions = result.options?.[0];

    if (!nearestOptions || (!nearestOptions.calls && !nearestOptions.puts)) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying };
    }

    const callsData: OptionDataPoint[] = (nearestOptions.calls || []).map((option: any) => ({
      strikePrice: option.strike,
      ltp: option.lastPrice,
      iv: option.impliedVolatility,
      oi: option.openInterest,
    }));

    const putsData: OptionDataPoint[] = (nearestOptions.puts || []).map((option: any) => ({
      strikePrice: option.strike,
      ltp: option.lastPrice,
      iv: option.impliedVolatility,
      oi: option.openInterest,
    }));

    const allStrikes = [...new Set([...callsData, ...putsData].map(d => d.strikePrice))].sort((a, b) => a - b);
    
    // Find the strike price closest to the underlying value (ATM)
    const closestStrike = allStrikes.length > 0 
      ? allStrikes.reduce((prev, curr) => 
          Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev
        )
      : null;

    return {
      calls: callsData.sort((a,b) => a.strikePrice - b.strikePrice),
      puts: putsData.sort((a,b) => a.strikePrice - b.strikePrice),
      atmStrike: closestStrike,
      underlyingValue: underlying
    };
  }, [snapshot]);
  

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3 justify-center md:justify-start">
                <Activity className="h-10 w-10" />
                NIFTY Option Chain
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Options data powered by Yahoo Finance.
              </p>
            </div>
            <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
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

          {error && (
                <div className="max-w-3xl mx-auto mb-8">
                    <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Data Retrieval Issue</AlertTitle>
                        <AlertDescription className="mt-2">
                            <p className="mb-4">We encountered a problem fetching the latest data from the Yahoo Finance API.</p>
                            <div className="bg-background/50 p-3 rounded border font-mono text-xs overflow-auto max-h-32 mb-4">
                                {error}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => fetchData(true)}>
                                Try Again
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>
           )}

          {snapshot && (
            <>
              <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="font-headline">Market Overview</CardTitle>
                    <CardDescription>Displaying data for the nearest expiry.</CardDescription>
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
                            Market Time: {format(lastUpdated, "PPpp")}
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
