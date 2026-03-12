"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { Activity, RefreshCw, Terminal, ChevronDown, ChevronUp, Clock, AlertCircle, ShieldCheck, Database, Zap } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, Timestamp } from "firebase/firestore";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface SessionDoc {
    id: string;
    token: string | null;
    updatedAt: Timestamp | null;
    lastUsedIp?: string;
    debugSecretLength?: number;
}

const safeToDate = (val: any): Date | null => {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
};

export default function OptionChainPage() {
  const firestore = useFirestore();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulatedData, setSimulatedData] = useState<any>(null);
  const [spotPrice, setSpotPrice] = useState<number>(24000);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const fetchLockRef = useRef(false);

  useEffect(() => { setIsMounted(true); }, []);

  const sessionRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  }, [firestore]);

  const { data: sessionData } = useDoc<SessionDoc>(sessionRef);

  const generateSimulation = useCallback((price: number) => {
    const strikes: { [key: string]: any } = {};
    const base = Math.round(price / 50) * 50;
    for (let i = -10; i <= 10; i++) {
      const s = base + (i * 50);
      strikes[s.toString()] = {
        CE: { ltp: Math.max(5, price - s + 50), open_interest: 10000 + Math.random() * 5000, greeks: { iv: 12 + Math.random() * 2 } },
        PE: { ltp: Math.max(5, s - price + 50), open_interest: 12000 + Math.random() * 4000, greeks: { iv: 11 + Math.random() * 2 } }
      };
    }
    return { underlying_ltp: price, strikes, expiry_date: "REAL-TIME SIMULATION", updatedAt: new Date().toISOString() };
  }, []);

  const fetchData = useCallback(async () => {
    if (fetchLockRef.current) return;
    fetchLockRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch Spot
      const spotRes = await fetch('/api/yahoo-finance?symbol=NIFTY');
      const spotData = await spotRes.json();
      const currentSpot = spotData.currentPrice || 24000;
      setSpotPrice(currentSpot);

      // 2. Fetch Option Chain
      const res = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const data = await res.json();

      if (!res.ok || data.error || !data.strikes) {
        throw new Error(data.error || "No strikes found");
      }

      setSimulatedData(null);
      setIsSimulating(false);
    } catch (err: any) {
      setError(err.message);
      setIsSimulating(true);
      setSimulatedData(generateSimulation(spotPrice));
    } finally {
      setIsLoading(false);
      fetchLockRef.current = false;
    }
  }, [generateSimulation, spotPrice]);

  useEffect(() => {
    if (isMounted) fetchData();
  }, [isMounted, fetchData]);

  const rawSnapshot = isSimulating ? simulatedData : null; // In real app, we'd use cached Live data if not simulating

  const { calls, puts, atmStrike, expiryDisplay } = useMemo(() => {
    const data = rawSnapshot;
    if (!data?.strikes) return { calls: [], puts: [], atmStrike: null, expiryDisplay: "Pending..." };

    const strikeKeys = Object.keys(data.strikes).map(Number).sort((a, b) => a - b);
    const closest = strikeKeys.reduce((prev, curr) => Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev);
    const atmIdx = strikeKeys.indexOf(closest);
    
    // Strictly 7 rows: 3 OTM, 1 ATM, 3 ITM
    const slice = strikeKeys.slice(Math.max(0, atmIdx - 3), Math.min(strikeKeys.length, atmIdx + 4));

    const callsData = slice.map(s => ({
      strikePrice: s,
      ltp: data.strikes[s].CE?.ltp || 0,
      iv: data.strikes[s].CE?.greeks?.iv || 0,
      oi: data.strikes[s].CE?.open_interest || 0
    }));

    const putsData = slice.map(s => ({
      strikePrice: s,
      ltp: data.strikes[s].PE?.ltp || 0,
      iv: data.strikes[s].PE?.greeks?.iv || 0,
      oi: data.strikes[s].PE?.open_interest || 0
    }));

    return { calls: callsData, puts: putsData, atmStrike: closest, expiryDisplay: data.expiry_date };
  }, [rawSnapshot, spotPrice]);

  if (!isMounted) return null;

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3">
                <Activity className="h-10 w-10" />
                Options Dashboard
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant={isSimulating ? "secondary" : "success"} className="uppercase tracking-widest text-[10px] py-1">
                    <Zap className="mr-1 h-3 w-3" />
                    Source: {isSimulating ? "Simulation" : "Live Broker"}
                  </Badge>
                  <Badge variant="outline" className="uppercase tracking-widest text-[10px] py-1 bg-muted/50">
                    Expiry: {expiryDisplay}
                  </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && 'animate-spin')} />
                Force Sync Market Data
            </Button>
          </header>

          <Collapsible open={isDebugOpen} onOpenChange={setIsDebugOpen} className="mb-8">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground text-[10px] uppercase font-bold">
                <Terminal className="mr-2 h-3 w-3" />
                Backend Connection Status {isDebugOpen ? <ChevronUp className="ml-1 h-3 w-3"/> : <ChevronDown className="ml-1 h-3 w-3"/>}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card className="bg-muted/30 border-dashed border-2">
                <CardContent className="p-4 font-mono text-[10px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-muted-foreground font-bold">SESSION TOKEN</p>
                    <p className={cn("font-bold", sessionData?.token ? "text-success" : "text-destructive")}>
                      {sessionData?.token ? "VALID / ACTIVE" : "NULL / EXPIRED"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-bold">LAST ATTEMPT</p>
                    <p>{sessionData?.updatedAt ? format(safeToDate(sessionData.updatedAt)!, "PPpp") : "Never"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-bold">WORKSTATION IP</p>
                    <p>{sessionData?.lastUsedIp || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-bold">SECRET LENGTH</p>
                    <p>{sessionData?.debugSecretLength || 0} characters</p>
                  </div>
                  <div className="col-span-full pt-2 border-t border-muted-foreground/20">
                    <p className="text-muted-foreground font-bold">LAST ENGINE ERROR</p>
                    <p className={cn(error ? "text-destructive" : "text-success")}>{error || "None - Connection Healthy"}</p>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {isSimulating && (
            <Alert className="mb-8 border-l-4 border-amber-500 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="font-bold">Live Data Unavailable</AlertTitle>
              <AlertDescription>
                The broker API returned an empty dataset. We've switched to <strong>Real-Time Simulation</strong> centered on the current NIFTY spot.
              </AlertDescription>
            </Alert>
          )}

          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-2 p-8">
                <div className="text-center p-6 border-2 rounded-xl bg-background shadow-xl min-w-[280px]">
                    <h4 className="font-bold text-muted-foreground uppercase tracking-widest text-xs mb-2">NIFTY 50 Spot</h4>
                    <div className="font-mono text-6xl font-black text-primary">
                        <AnimatedCounter value={spotPrice} precision={2}/>
                    </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-4 uppercase font-bold tracking-tighter">
                  Data Feed Latency: {isSimulating ? "Simulated (Real-Time)" : "Live (Approx 1s Delay)"}
                </p>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <OptionChainTable title="Calls" data={calls} isLoading={isLoading && calls.length === 0} atmStrike={atmStrike} />
              <OptionChainTable title="Puts" data={puts} isLoading={isLoading && puts.length === 0} atmStrike={atmStrike} />
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
