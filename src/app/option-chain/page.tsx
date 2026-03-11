
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { GrowwOptionChainResponse } from "@/app/types/option-chain";
import { Activity, RefreshCw, Terminal, ChevronDown, ChevronUp, Trash2, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface SessionDoc {
    id: string;
    lastError: string | null;
    lastFailureAt: Timestamp | null;
    token: string | null;
    updatedAt: Timestamp | null;
    isAuthenticating?: boolean;
    lastUsedIp?: string;
    debugSecretLength?: number;
    debugKeyDetected?: boolean;
}

export default function OptionChainPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<GrowwOptionChainResponse | null>(null);
  const [realSpotPrice, setRealSpotPrice] = useState<number | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cacheRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'NIFTY_GROWW');
  }, [firestore]);

  const sessionRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'SESSION_CONFIG');
  }, [firestore]);

  const { data: cachedData, isLoading: isCacheLoading } = useDoc<any>(cacheRef);
  const { data: sessionData } = useDoc<SessionDoc>(sessionRef);

  const fetchRealSpotPrice = useCallback(async () => {
    try {
      const res = await fetch('/api/yahoo-finance?symbol=NIFTY');
      const data = await res.json();
      if (data.currentPrice) {
        setRealSpotPrice(data.currentPrice);
        return data.currentPrice;
      }
    } catch (e) {
      console.error("Failed to fetch spot", e);
    }
    return null;
  }, []);

  const generateSimulatedData = useCallback((spot: number): GrowwOptionChainResponse => {
    const strikes: { [key: string]: any } = {};
    const baseStrike = Math.round(spot / 50) * 50;
    // Generate 31 strikes (-15 to +15) to ensure the 3-up/3-down slice always has data
    for (let i = -15; i <= 15; i++) {
      const s = baseStrike + (i * 50);
      const intrinsicCE = Math.max(0, spot - s);
      const intrinsicPE = Math.max(0, s - spot);
      strikes[s.toString()] = {
        CE: { ltp: intrinsicCE + 40 + Math.random() * 15, open_interest: 1000 + Math.floor(Math.random() * 500), volume: 500, greeks: { iv: 12 + Math.random() * 2 } },
        PE: { ltp: intrinsicPE + 35 + Math.random() * 12, open_interest: 1200 + Math.floor(Math.random() * 600), volume: 400, greeks: { iv: 11 + Math.random() * 2 } }
      };
    }
    return { underlying_ltp: spot, strikes };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();
      
      if (!response.ok || responseData.error) {
        throw { message: responseData.error || "Unknown server error", status: response.status };
      }
      
      setIsSimulating(false);
    } catch (err: any) {
      setError(err);
      setIsSimulating(true);
      
      // CRITICAL: Generate an immediate simulation so the UI isn't empty while waiting for the real spot price
      const baselineSpot = realSpotPrice || 24500;
      setSimulatedSnapshot(generateSimulatedData(baselineSpot));
      
      // Then try to refine it with the absolute latest spot price
      fetchRealSpotPrice().then(freshSpot => {
          if (freshSpot) setSimulatedSnapshot(generateSimulatedData(freshSpot));
      });
      
      if (err.status !== 429 && err.message !== 'MISSING_CONFIG') {
          toast({
            variant: "destructive",
            title: "Sync Failed",
            description: err.message || "Failed to connect to the broker API."
          });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchRealSpotPrice, generateSimulatedData, realSpotPrice]);

  const clearSessionCache = async () => {
    if (!sessionRef) return;
    try {
        await setDoc(sessionRef, { 
            lastError: null, 
            lastFailureAt: null, 
            token: null, 
            updatedAt: null,
            isAuthenticating: false
        }, { merge: true });
        toast({ title: "Local Back-off Cleared", description: "You can now attempt a fresh sync." });
        setError(null);
        setIsSimulating(false);
    } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Failed to clear session cache." });
    }
  };

  useEffect(() => {
    if (isCacheLoading) return;
    const lastUpdate = cachedData?.updatedAt?.toDate()?.getTime() || 0;
    const isStale = (new Date().getTime() - lastUpdate) > 15 * 60 * 1000; 
    if (!cachedData || isStale) fetchData();
    else { setIsLoading(false); setIsSimulating(false); }
  }, [cachedData, isCacheLoading, fetchData]);

  useEffect(() => {
    fetchRealSpotPrice();
    const interval = setInterval(fetchRealSpotPrice, 30000);
    return () => clearInterval(interval);
  }, [fetchRealSpotPrice]);

  useEffect(() => {
    if (isSimulating) {
        simIntervalRef.current = setInterval(async () => {
            if (realSpotPrice) setSimulatedSnapshot(generateSimulatedData(realSpotPrice));
        }, 10000);
    }
    return () => { if (simIntervalRef.current) clearInterval(simIntervalRef.current); };
  }, [isSimulating, realSpotPrice, generateSimulatedData]);

  const rawSnapshot = isSimulating ? simulatedSnapshot : cachedData?.snapshot;
  
  const isRateLimited = error?.status === 429 || sessionData?.lastError?.includes('429') || sessionData?.lastError === 'QUOTA_EXHAUSTED';
  const isConfigMissing = error?.message === 'MISSING_CONFIG' || sessionData?.lastError === 'MISSING_CONFIG';
  const isSyncingWithLive = !!sessionData?.token && !isSimulating;

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    const underlying = rawSnapshot?.underlying_ltp || realSpotPrice || 0;
    
    // EXTRACTION: Handle Maps, Arrays, and Nested Objects safely
    let strikesData: any = rawSnapshot?.strikes || rawSnapshot?.option_chain || rawSnapshot?.records || rawSnapshot?.payload?.strikes;
    
    if (!strikesData || (typeof strikesData === 'object' && Object.keys(strikesData).length === 0)) {
        // Return a simulation if the current snapshot is empty to prevent blank UI
        const fallback = generateSimulatedData(underlying || 24500);
        strikesData = fallback.strikes;
    }

    let normalized: { strike: number, CE: any, PE: any }[] = [];

    if (Array.isArray(strikesData)) {
        normalized = strikesData.map((item: any) => ({
            strike: Number(item.strikePrice || item.strike_price || item.strike || 0),
            CE: item.CE || item.call_option || {},
            PE: item.PE || item.put_option || {}
        })).filter(s => s.strike > 0);
    } else {
        normalized = Object.keys(strikesData).map(s => ({
            strike: Number(s),
            CE: strikesData[s].CE || strikesData[s].call_option || {},
            PE: strikesData[s].PE || strikesData[s].put_option || {}
        })).filter(s => !isNaN(s.strike) && s.strike > 0);
    }

    if (normalized.length === 0) {
        return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying };
    }

    normalized.sort((a, b) => a.strike - b.strike);
    const strikesList = normalized.map(n => n.strike);

    const closestStrike = strikesList.reduce((prev, curr) => 
        Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev, strikesList[0]
    );
    
    const atmIndex = strikesList.indexOf(closestStrike);
    
    // STRIKE FILTER: Exactly 3 above and 3 below (Total 7 rows)
    const startIndex = Math.max(0, atmIndex - 3);
    const endIndex = Math.min(strikesList.length, atmIndex + 4); 
    
    const focusedSlice = normalized.slice(startIndex, endIndex);

    const callsData = focusedSlice.map(s => ({
        strikePrice: s.strike, 
        ltp: s.CE.ltp || s.CE.lastPrice || 0, 
        iv: s.CE.greeks?.iv || s.CE.impliedVolatility || s.CE.iv || 0, 
        oi: s.CE.open_interest || s.CE.openInterest || 0
    }));
    const putsData = focusedSlice.map(s => ({
        strikePrice: s.strike, 
        ltp: s.PE.ltp || s.PE.lastPrice || 0, 
        iv: s.PE.greeks?.iv || s.PE.impliedVolatility || s.PE.iv || 0, 
        oi: s.PE.open_interest || s.PE.openInterest || 0
    }));
    
    return { calls: callsData, puts: putsData, atmStrike: closestStrike, underlyingValue: underlying };
  }, [rawSnapshot, realSpotPrice, generateSimulatedData]);

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
              <div className="flex items-center gap-2 mt-2">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest",
                    isSyncingWithLive ? "bg-success/10 border-success/30 text-success" : "bg-primary/10 border-primary/30 text-primary"
                )}>
                    <span className={cn("flex h-2 w-2 rounded-full animate-pulse", isSyncingWithLive ? "bg-success" : "bg-primary")} />
                    Data Source: {isSyncingWithLive ? "Live Groww API" : "Real-Time Simulation"}
                </div>
                {sessionData?.isAuthenticating && (
                    <Badge variant="outline" className="animate-pulse bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                        <ShieldCheck className="mr-1 h-3 w-3" /> Auth Guard Active
                    </Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading || isRateLimited || sessionData?.isAuthenticating}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", (isLoading || sessionData?.isAuthenticating) && 'animate-spin')} />
                    Force Sync Live Data
                </Button>
            </div>
          </header>

          <Collapsible
            open={isDebugOpen}
            onOpenChange={setIsDebugOpen}
            className="mb-8 w-full"
          >
            <div className="flex items-center justify-between mb-2">
                <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground hover:text-primary">
                    <Terminal className="h-4 w-4" />
                    Backend Connection Status
                    {isDebugOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                </CollapsibleTrigger>
                {isDebugOpen && (
                    <Button variant="ghost" size="sm" onClick={clearSessionCache} className="text-destructive text-[10px] uppercase font-bold tracking-tighter h-6">
                        <Trash2 className="mr-1 h-3 w-3" /> Clear Local Back-off
                    </Button>
                )}
            </div>
            <CollapsibleContent className="space-y-4">
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4 font-mono text-xs space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Last Backend Error</p>
                      <p className={cn("break-all leading-relaxed", (sessionData?.lastError || error) ? "text-destructive" : "text-success")}>
                        {sessionData?.lastError || error?.message || "None - Connection healthy"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Workstation Outgoing IP</p>
                      <p className="text-primary font-bold">{sessionData?.lastUsedIp || "Not yet detected"}</p>
                      <p className="text-[9px] text-muted-foreground italic">Whitelist this IP in Groww portal if required.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-muted/50">
                    <div className="space-y-1">
                        <p className="text-muted-foreground uppercase font-bold text-[10px]">Session Token Status</p>
                        <p className="truncate font-bold">
                        {sessionData?.token ? "ACTIVE (Ends with: ..." + sessionData.token.slice(-10) + ")" : "EXPIRED / NULL"}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-muted-foreground uppercase font-bold text-[10px]">Diagnostic Config</p>
                        <p className="text-[10px]">Key Detected: {sessionData?.debugKeyDetected ? "YES" : "NO"}</p>
                        <p className="text-[10px]">Secret Length: {sessionData?.debugSecretLength || "N/A"} chars</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 pt-2 border-t border-muted/50">
                    <div className="space-y-1">
                        <p className="text-muted-foreground uppercase font-bold text-[10px]">Last Attempt</p>
                        <p>
                            {sessionData?.updatedAt ? format(sessionData.updatedAt.toDate(), "PPpp") : 
                             sessionData?.lastFailureAt ? format(sessionData.lastFailureAt.toDate(), "PPpp") : "Never"}
                        </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
          
          {isRateLimited && (
                <Alert className="mb-8 border-l-4 border-amber-500 bg-amber-500/5">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <AlertTitle className="font-bold">Rate Limit Breached</AlertTitle>
                    <AlertDescription className="mt-2">
                        The broker has temporarily paused live requests. We've switched to <strong>Real-Time Simulation</strong> centered on the actual NIFTY spot price to keep your tools functional. Please wait a few minutes before trying to sync again.
                    </AlertDescription>
                </Alert>
           )}

           {isConfigMissing && (
                <Alert variant="destructive" className="mb-8 border-l-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-bold">Configuration Missing</AlertTitle>
                    <AlertDescription className="mt-2">
                        The backend is missing <strong>GROWW_API_KEY</strong> or <strong>GROWW_API_SECRET</strong>. Please ensure these are set in your environment variables. 
                        Simulation mode is active using live Yahoo spot prices.
                    </AlertDescription>
                </Alert>
           )}

          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-2 p-6">
                <div className="text-center p-6 border rounded-lg bg-background w-full max-w-sm shadow-sm">
                    <h4 className="font-semibold text-muted-foreground mb-2">NIFTY 50 Spot</h4>
                    <div className="font-mono text-5xl font-bold text-primary">
                        <AnimatedCounter value={underlyingValue} precision={2}/>
                    </div>
                </div>
                {rawSnapshot?.updatedAt && !isSimulating && (
                    <p className="text-xs text-muted-foreground mt-4">Last Sync: {format(rawSnapshot.updatedAt.toDate(), "PPpp")}</p>
                )}
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
