
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionDataPoint, GrowwOptionChainResponse } from "@/app/types/option-chain";
import { Activity, RefreshCw, Zap, Globe, Database, Key, AlertCircle, Info, WifiOff, Terminal, LogIn } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";

interface CacheDoc {
    id: string;
    snapshot: GrowwOptionChainResponse;
    updatedAt: Timestamp;
}

export default function OptionChainPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<GrowwOptionChainResponse | null>(null);
  const [realSpotPrice, setRealSpotPrice] = useState<number | null>(null);
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cacheRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'optionChainData', 'NIFTY_GROWW');
  }, [firestore]);

  const { data: cachedData, isLoading: isCacheLoading } = useDoc<CacheDoc>(cacheRef);

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
    
    for (let i = -10; i <= 10; i++) {
      const s = baseStrike + (i * 50);
      const intrinsicCE = Math.max(0, spot - s);
      const intrinsicPE = Math.max(0, s - spot);
      
      strikes[s.toString()] = {
        CE: {
          ltp: intrinsicCE + 40 + Math.random() * 15,
          open_interest: 1000 + Math.floor(Math.random() * 500),
          volume: 500 + Math.floor(Math.random() * 200),
          greeks: { iv: 12 + Math.random() * 2 }
        },
        PE: {
          ltp: intrinsicPE + 35 + Math.random() * 12,
          open_interest: 1200 + Math.floor(Math.random() * 600),
          volume: 400 + Math.floor(Math.random() * 300),
          greeks: { iv: 11 + Math.random() * 2 }
        }
      };
    }
    return { underlying_ltp: spot, strikes };
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);

    // If not forced and we have fresh cached data, don't fetch
    if (!force && cachedData?.updatedAt) {
        const now = new Date().getTime();
        const lastUpdate = cachedData.updatedAt.toDate().getTime();
        if ((now - lastUpdate) < 15 * 60 * 1000) {
            setIsLoading(false);
            setIsSimulating(false);
            return;
        }
    }

    try {
      const response = await fetch('/api/yahoo-finance?options=true&symbol=NIFTY');
      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        const errObj = { 
            message: responseData.error || "Request failed", 
            status: response.status 
        };
        setError(errObj);
        throw errObj;
      }
      
      if (cacheRef) {
          setDoc(cacheRef, {
              snapshot: responseData,
              updatedAt: serverTimestamp(),
          }, { merge: true });
      }
      setIsSimulating(false);
    } catch (err: any) {
      console.warn("API failure, enabling simulation:", err);
      const spot = await fetchRealSpotPrice();
      setIsSimulating(true);
      setSimulatedSnapshot(generateSimulatedData(spot || realSpotPrice || 24500));
    } finally {
      setIsLoading(false);
    }
  }, [cacheRef, cachedData, fetchRealSpotPrice, generateSimulatedData, realSpotPrice]);

  useEffect(() => {
    if (isCacheLoading) return;
    
    const lastUpdate = cachedData?.updatedAt?.toDate()?.getTime() || 0;
    const isStale = (new Date().getTime() - lastUpdate) > 15 * 60 * 1000; 

    if (!cachedData || isStale) {
        fetchData();
    } else {
        setIsLoading(false);
        setIsSimulating(false);
    }
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

  const snapshot = isSimulating ? simulatedSnapshot : cachedData?.snapshot;

  const { calls, puts, atmStrike, underlyingValue } = useMemo(() => {
    const underlying = snapshot?.underlying_ltp || realSpotPrice || 0;
    
    if (!snapshot?.strikes) {
      return { calls: [], puts: [], atmStrike: null, underlyingValue: underlying };
    }
    
    const strikesList = Object.keys(snapshot.strikes).map(Number).sort((a, b) => a - b);
    
    const callsData: OptionDataPoint[] = strikesList.map(s => ({
        strikePrice: s,
        ltp: snapshot.strikes[s.toString()].CE.ltp,
        iv: snapshot.strikes[s.toString()].CE.greeks?.iv || 0,
        oi: snapshot.strikes[s.toString()].CE.open_interest,
        volume: snapshot.strikes[s.toString()].CE.volume
    }));

    const putsData: OptionDataPoint[] = strikesList.map(s => ({
        strikePrice: s,
        ltp: snapshot.strikes[s.toString()].PE.ltp,
        iv: snapshot.strikes[s.toString()].PE.greeks?.iv || 0,
        oi: snapshot.strikes[s.toString()].PE.open_interest,
        volume: snapshot.strikes[s.toString()].PE.volume
    }));

    const closestStrike = (strikesList.length > 0)
      ? strikesList.reduce((prev, curr) => Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev)
      : null;

    return { calls: callsData, puts: putsData, atmStrike: closestStrike, underlyingValue: underlying };
  }, [snapshot, realSpotPrice]);

  const isConfigError = error?.status === 401 || error?.message?.includes("configuration incomplete");
  const isEndpointError = error?.message?.includes("ENDPOINT_NOT_FOUND");
  const isAuthError = error?.message === "AUTH_FAILED" || error?.message === "TOKEN_NOT_RECEIVED";

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
                <p className="text-muted-foreground text-sm flex items-center gap-1">
                    <Database className="h-3 w-3" /> Shared Cache (15m window)
                </p>
                {!isSimulating && snapshot && <Badge className="bg-success text-white">Live Groww <Globe className="ml-1 h-3 w-3"/></Badge>}
                {isSimulating && <Badge className="bg-primary text-white">Live Simulation <Zap className="ml-1 h-3 w-3 animate-pulse"/></Badge>}
              </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Force Sync Live Data
                </Button>
            </div>
          </header>
          
          {isSimulating && (
                <Alert className={`mb-8 border-l-4 ${isConfigError || isAuthError ? 'border-amber-500 bg-amber-500/5' : isEndpointError ? 'border-orange-500 bg-orange-500/5' : 'border-primary bg-primary/5'}`}>
                    {isConfigError || isAuthError ? <Key className="h-4 w-4 text-amber-500" /> : isEndpointError ? <Terminal className="h-4 w-4 text-orange-500" /> : <Info className="h-4 w-4" />}
                    <AlertTitle className="font-bold">
                        {isConfigError ? "Setup Required" : isAuthError ? "Authentication Error" : isEndpointError ? "Invalid URL Endpoint" : "Notice: Simulation Mode Active"}
                    </AlertTitle>
                    <AlertDescription className="mt-2 space-y-2">
                        {isConfigError ? (
                            <p>Please ensure your <strong>GROWW_API_TOKEN</strong> and <strong>GROWW_API_SECRET</strong> are set in your environment variables.</p>
                        ) : isAuthError ? (
                            <p>The login handshake failed. Please verify that your API Key and Secret are correct and that you have an active subscription.</p>
                        ) : isEndpointError ? (
                            <div className="space-y-2">
                                <p>The server reached the address but could not find the API path. This usually means your <strong>GROWW_API_URL</strong> base is slightly incorrect.</p>
                                <div className="bg-black/10 p-2 rounded text-xs font-mono break-all">
                                    <strong>Attempted URL:</strong><br/>
                                    {error?.message.split(': ')[1]}
                                </div>
                                <p className="text-xs"><strong>Fix:</strong> Your vendor URL should likely NOT end with /api if the SDK adds it automatically, or vice versa.</p>
                            </div>
                        ) : (
                            <p>We're having trouble reaching the Groww API. Error: <strong>{error?.message || "Internal Server Error"}</strong>. Centering simulation on NIFTY Spot.</p>
                        )}
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
                {cachedData?.updatedAt && !isSimulating && (
                    <p className="text-xs text-muted-foreground mt-4">Last Sync: {format(cachedData.updatedAt.toDate(), "PPpp")}</p>
                )}
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <OptionChainTable title="Calls" data={calls} isLoading={isLoading && !snapshot} atmStrike={atmStrike} />
              <OptionChainTable title="Puts" data={puts} isLoading={isLoading && !snapshot} atmStrike={atmStrike} />
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
