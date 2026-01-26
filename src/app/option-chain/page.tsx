
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format, subDays, startOfToday, isFuture, isSaturday, isSunday } from "date-fns";
import { useFirestore, useUser, useAuth } from "@/firebase";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { initiateAnonymousSignIn } from "@/firebase/non-blocking-login";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionChainSnapshot, DailyOptionData, OptionDataPoint } from "@/app/types/option-chain";
import { Loader2, Activity, LogIn } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";

export default function OptionChainPage() {
  const [snapshot, setSnapshot] = useState<Partial<OptionChainSnapshot> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(errorParam);
    }
    // Check for cookie existence on client-side
    // A simple way to check is to make a request to a protected endpoint
    // and see if it succeeds.
    setIsLoading(true);
    fetch('/api/nse-data')
      .then(async (res) => {
        if (res.status === 401) {
          setIsAuthenticated(false);
          return null;
        }
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error || "Failed to fetch initial data.");
        }
        setIsAuthenticated(true);
        return res.json();
      })
      .then(data => {
        if (data) {
          setSnapshot(data);
          setLastUpdated(new Date());
        }
      })
      .catch(err => {
         // If authenticated is not false, it means we thought we were logged in
         if (isAuthenticated !== false) {
            setError(err.message);
         }
      })
      .finally(() => setIsLoading(false));

  }, [searchParams]);

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
                Near real-time options data via Zerodha Kite.
              </p>
            </div>
          </header>
          
          {isAuthenticated === null && (
             <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          )}

          {isAuthenticated === false && (
            <Card className="max-w-md mx-auto text-center">
                <CardHeader>
                    <CardTitle className="font-headline">Authentication Required</CardTitle>
                    <CardDescription>To view live market data, you need to log in with your Zerodha account.</CardDescription>
                </CardHeader>
                <CardContent>
                    {error && <p className="text-destructive text-sm mb-4">{error}</p>}
                    <Button asChild size="lg">
                        <Link href="/api/zerodha/login">
                            <LogIn className="mr-2"/>
                            Login with Zerodha
                        </Link>
                    </Button>
                     <p className="text-xs text-muted-foreground mt-4">
                        This will redirect you to the official Zerodha login page. Your credentials are not shared with this application.
                    </p>
                </CardContent>
            </Card>
          )}

          {isAuthenticated === true && (
            <>
              <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="font-headline">Data Snapshot</CardTitle>
                    <CardDescription>Displaying nearest-expiry options for NIFTY.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                    <div className="text-center p-6 border rounded-lg bg-muted/30 w-full max-w-sm">
                        <h4 className="font-semibold text-muted-foreground">NIFTY Underlying Value</h4>
                        <div className="font-mono text-4xl font-bold text-primary">
                            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto"/> : <AnimatedCounter value={snapshot?.underlyingValue || 0} precision={2}/>}
                        </div>
                        {lastUpdated && (
                            <p className="text-sm text-muted-foreground text-center md:text-left">
                                Last updated: {format(lastUpdated, "PPpp")}
                            </p>
                        )}
                    </div>
                </CardContent>
              </Card>
              
              {error && <p className="text-destructive text-center mb-4">{error}</p>}
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <OptionChainTable title="Calls" data={calls} isLoading={isLoading} atmStrike={atmStrike} />
                  <OptionChainTable title="Puts" data={puts} isLoading={isLoading} atmStrike={atmStrike} />
              </div>
            </>
          )}

        </div>
      </main>
    </AppLayout>
  );
}
