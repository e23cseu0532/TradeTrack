
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { Activity, RefreshCw, Terminal, ChevronDown, ChevronUp, Trash2, ShieldCheck, Clock, AlertCircle, Eye, EyeOff, Calendar } from "lucide-react";
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
}

const safeToDate = (dateVal: any): Date | null => {
  if (!dateVal) return null;
  if (typeof dateVal.toDate === 'function') return dateVal.toDate();
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'string' || typeof dateVal === 'number') {
    const parsed = new Date(dateVal);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (dateVal && typeof dateVal === 'object' && 'seconds' in dateVal) {
      return new Date(dateVal.seconds * 1000);
  }
  return null;
};

export default function OptionChainPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<any | null>(null);
  const [realSpotPrice, setRealSpotPrice] = useState<number | null>(null);
  const [hasFailedInSession, setHasFailedInSession] = useState(false);
  
  const isFetchingRef = useRef(false);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const generateSimulatedData = useCallback((spot: number): any => {
    const strikes: { [key: string]: any } = {};
    const baseStrike = Math.round(spot / 50) * 50;
    for (let i = -15; i <= 15; i++) {
      const s = baseStrike + (i * 50);
      const intrinsicCE = Math.max(0, spot - s);
      const intrinsicPE = Math.max(0, s - spot);
      strikes[s.toString()] = {
        CE: { ltp: intrinsicCE + 40 + Math.random() * 15, open_interest: 1000 + Math.floor(Math.random() * 500), volume: 500, greeks: { iv: 12 + Math.random() * 2 } },
        PE: { ltp: intrinsicPE + 35 + Math.random() * 12, open_interest: 1200 + Math.floor(Math.random() * 600), volume: 400, greeks: { iv: 11 + Math.random() * 2 } }
      };
    }
    return { underlying_ltp: spot, strikes, expiry_date: "SIMULATED", updatedAt: new Date().toISOString() };
  }, []);

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/yahoo-finance?options=true&symbol=NIFTY`;
      const response = await fetch(url);
      const responseData = await response.json();
      
      if (!response.ok || responseData.error) {
        throw { message: responseData.error || "Unknown server error", status: response.status };
      }
      
      const hasStrikes = responseData.strikes && Object.keys(responseData.strikes).length > 0;
      
      if (!hasStrikes) {
          throw { message: "Broker returned empty dataset for this expiry", status: 204 };
      }

      setIsSimulating(false);
      setHasFailedInSession(false);
    } catch (err: any) {
      setError(err);
      setIsSimulating(true);
      setHasFailedInSession(true);
      
      const baselineSpot = realSpotPrice || 24500;
      setSimulatedSnapshot(generateSimulatedData(baselineSpot));
      
      if (err.status !== 429 && err.message !== 'MISSING_CONFIG' && err.status !== 204) {
          toast({
            variant: "destructive",
            title: "Sync Failed",
            description: err.message || "Failed to connect to the broker API."
          });
      }
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [generateSimulatedData, realSpotPrice]);

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
        setHasFailedInSession(false);
        fetchData();
    } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Failed to clear session cache." });
    }
  };

  useEffect(() => {
    if (isCacheLoading || !isMounted || hasFailedInSession) return;
    
    const lastUpdateDate = safeToDate(cachedData?.updatedAt);
    const lastUpdate = lastUpdateDate?.getTime() || 0;
    const isStale = (new Date().getTime() - lastUpdate) > 15 * 60 * 1000;
    
    const cachedHasStrikes = cachedData?.snapshot?.strikes && Object.keys(cachedData.snapshot.strikes).length > 0;

    if (!cachedData || isStale || !cachedHasStrikes) {
        fetchData();
    } else {
        setIsLoading(false);
        setIsSimulating(false);
    }
  }, [isMounted, isCacheLoading, fetchData, cachedData, hasFailedInSession]); 

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
  
  const isRateLimited = error?.status === 429 || sessionData?.lastError?.includes('429');
  const isConfigMissing = error?.message === 'MISSING_CONFIG' || sessionData?.lastError === 'MISSING_CONFIG';
  const isEmptyData = error?.status === 204;
  const isSyncingWithLive = !!sessionData?.token && !isSimulating;

  const { calls, puts, atmStrike, underlyingValue, expiryDateDisplay } = useMemo(() => {
    const underlying = rawSnapshot?.underlying_ltp || realSpotPrice || 0;
    const expiry = rawSnapshot?.expiry_date || (isSimulating ? "SIMULATED" : cachedData?.expiryDate || "Unknown");
    
    let strikesData: any = rawSnapshot?.strikes || rawSnapshot?.option_chain || rawSnapshot?.payload?.strikes;
    
    if (!strikesData || (typeof strikesData === 'object' && Object.keys(strikesData).length === 0)) {
        return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying, expiryDateDisplay: expiry };
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
        return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying, expiryDateDisplay: expiry };
    }

    normalized.sort((a, b) => a.strike - b.strike);
    const strikesList = normalized.map(n => n.strike);

    const closestStrike = strikesList.reduce((prev, curr) => 
        Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev, strikesList[0]
    );
    
    const atmIndex = strikesList.indexOf(closestStrike);
    
    // STRICT FILTERING: 3 OTM, 1 ATM, 3 ITM (Total 7)
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
    
    return { calls: callsData, puts: putsData, atmStrike: closestStrike, underlyingValue: underlying, expiryDateDisplay: expiry };
  }, [rawSnapshot, realSpotPrice, isSimulating, cachedData]);

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
                  <div className={cn(
                      "flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-colors duration-500",
                      isSyncingWithLive ? "bg-success/10 border-success/30 text-success" : "bg-primary/10 border-primary/30 text-primary"
                  )}>
                      <span className={cn("flex h-2 w-2 rounded-full animate-pulse", isSyncingWithLive ? "bg-success" : "bg-primary")} />
                      Data Source: {isSyncingWithLive ? "Live Broker API" : "Real-Time Simulation"}
                  </div>
                  
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full border bg-muted/50 text-[10px] font-bold uppercase tracking-widest">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      Expiry: {expiryDateDisplay}
                  </div>

                  {sessionData?.isAuthenticating && (
                      <Badge variant="outline" className="animate-pulse bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                          <ShieldCheck className="mr-1 h-3 w-3" /> Auth Guard Active
                      </Badge>
                  )}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setHasFailedInSession(false); fetchData(); }} disabled={isLoading || sessionData?.isAuthenticating}>
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
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowRawData(!showRawData)} className="text-[10px] uppercase font-bold tracking-tighter h-6">
                            {showRawData ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                            {showRawData ? "Hide Raw Data" : "Inspect Raw Data"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearSessionCache} className="text-destructive text-[10px] uppercase font-bold tracking-tighter h-6">
                            <Trash2 className="mr-1 h-3 w-3" /> Clear Local Back-off
                        </Button>
                    </div>
                )}
            </div>
            <CollapsibleContent className="space-y-4">
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="p-4 font-mono text-xs space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Session Token Status</p>
                      <p className={cn("font-bold", sessionData?.token ? "text-success" : "text-destructive")}>
                        {sessionData?.token ? "ACTIVE / VALID" : "EXPIRED / NULL"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Last Attempt</p>
                      <p className="text-primary font-bold">
                        {sessionData?.updatedAt ? format(safeToDate(sessionData.updatedAt)!, "PPpp") : "Never"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Workstation IP</p>
                      <p className="text-primary font-bold">{sessionData?.lastUsedIp || "Pending..."}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground uppercase font-bold text-[10px]">Secret Length</p>
                      <p className="text-primary font-bold">{sessionData?.debugSecretLength || 0} chars</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1 pt-2">
                    <p className="text-muted-foreground uppercase font-bold text-[10px]">Last Backend Error</p>
                    <p className={cn("break-all leading-relaxed", (sessionData?.lastError || error) ? "text-destructive" : "text-success")}>
                      {sessionData?.lastError || error?.message || "None - Connection healthy"}
                    </p>
                  </div>
                  
                  {showRawData && (
                    <div className="pt-4 border-t border-muted/50">
                        <p className={cn(
                            "uppercase font-bold text-[10px] mb-2 px-2 py-1 rounded inline-block",
                            isSimulating ? "bg-amber-500/20 text-amber-600" : "bg-success/20 text-success"
                        )}>
                            {isSimulating ? "Raw API Payload [REAL-TIME SIMULATION]" : "Raw API Payload [LIVE MARKET DATA]"}
                        </p>
                        <div className="bg-black text-emerald-400 p-4 rounded-lg overflow-auto max-h-[400px] text-[10px] leading-tight">
                            <pre>{JSON.stringify(rawSnapshot, null, 2)}</pre>
                        </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
          
          {isRateLimited && (
                <Alert className="mb-8 border-l-4 border-amber-500 bg-amber-500/5">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <AlertTitle className="font-bold">Rate Limit Breached</AlertTitle>
                    <AlertDescription className="mt-2">
                        The broker has temporarily paused live requests. We've switched to <strong>Real-Time Simulation</strong> centered on the actual NIFTY spot price.
                    </AlertDescription>
                </Alert>
           )}

           {isEmptyData && (
                <Alert className="mb-8 border-l-4 border-blue-500 bg-blue-500/5">
                    <AlertCircle className="h-4 w-4 text-blue-500" />
                    <AlertTitle className="font-bold">Expiry Data Unavailable</AlertTitle>
                    <AlertDescription className="mt-2">
                        The broker API returned no strike data for the current expiry. We've switched to <strong>Real-Time Simulation</strong> to keep the dashboard functional.
                    </AlertDescription>
                </Alert>
           )}

           {isConfigMissing && (
                <Alert variant="destructive" className="mb-8 border-l-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="font-bold">Configuration Missing</AlertTitle>
                    <AlertDescription className="mt-2">
                        The backend is missing <strong>GROWW_API_KEY</strong> or <strong>GROWW_API_SECRET</strong>. Ensure these are set in your environment variables.
                    </AlertDescription>
                </Alert>
           )}

          <Card className="mb-8 border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-2 p-6">
                <div className="text-center p-6 border rounded-lg bg-background w-full max-sm shadow-sm">
                    <h4 className="font-semibold text-muted-foreground mb-2">NIFTY 50 Spot</h4>
                    <div className="font-mono text-5xl font-bold text-primary">
                        <AnimatedCounter value={underlyingValue} precision={2}/>
                    </div>
                </div>
                {isMounted && (sessionData?.updatedAt || cachedData?.updatedAt) && (
                    <p className="text-xs text-muted-foreground mt-4">
                        Last Sync: {format(safeToDate(sessionData?.updatedAt || cachedData?.updatedAt)!, "PPpp")}
                    </p>
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
