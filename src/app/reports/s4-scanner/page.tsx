
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, ShieldAlert, ExternalLink, ArrowDownCircle, Info, Target, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import Link from "next/link";
import { fnoStocks } from "@/lib/fno-stocks";
import AnimatedCounter from "@/components/AnimatedCounter";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScannedStock {
  name: string;
  symbol: string;
  currentPrice: number;
  s4Level: number;
  high: number;
  low: number;
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  isTriggered: boolean;
}

export default function S4ScannerPage() {
  const [scannedResults, setScannedResults] = useState<ScannedStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  // Lookup Feature State
  const [lookupSymbol, setLookupSymbol] = useState("");
  const [lookupData, setLookupData] = useState<ScannedStock | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  const calculateLevels = (h: number, l: number, c: number) => {
    const p = (h + l + c) / 3;
    const r1 = (p * 2) - l;
    const s1 = (p * 2) - h;
    const r2 = p + (h - l);
    const s2 = p - (h - l);
    const r3 = h + 2 * (p - l);
    const s3 = l - 2 * (h - p);
    const s4 = s3 - (h - l); // S4 extension
    
    return { p, r1, r2, r3, s1, s2, s3, s4 };
  };

  const startScan = useCallback(async () => {
    setIsScanning(true);
    setProgress(0);
    setScannedResults([]);
    
    const total = fnoStocks.length;
    const results: ScannedStock[] = [];
    const batchSize = 5;

    for (let i = 0; i < total; i += batchSize) {
      const batch = fnoStocks.slice(i, i + batchSize);
      
      const promises = batch.map(async (stock) => {
        try {
          const res = await fetch(`/api/yahoo-finance?symbol=${stock.symbol}`);
          const data = await res.json();
          
          if (data && data.currentPrice && data.high && data.low) {
            const levels = calculateLevels(data.high, data.low, data.currentPrice);
            
            return {
              name: stock.name,
              symbol: stock.symbol,
              currentPrice: data.currentPrice,
              s4Level: levels.s4,
              high: data.high,
              low: data.low,
              pivot: levels.p,
              r1: levels.r1,
              r2: levels.r2,
              r3: levels.r3,
              s1: levels.s1,
              s2: levels.s2,
              s3: levels.s3,
              isTriggered: data.currentPrice <= levels.s4
            };
          }
        } catch (err) {
          console.error(`Failed to scan ${stock.symbol}`, err);
        }
        return null;
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(r => { if(r) results.push(r); });
      
      setProgress(Math.round(((i + batch.length) / total) * 100));
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setScannedResults(results);
    setIsScanning(false);
    setLastScanTime(new Date());
  }, []);

  const handleLookup = async (symbol: string) => {
    if (!symbol) return;
    setLookupSymbol(symbol);
    
    // Check if we already have it in scanned results
    const existing = scannedResults.find(s => s.symbol === symbol);
    if (existing) {
        setLookupData(existing);
        return;
    }

    setIsLookupLoading(true);
    try {
        const res = await fetch(`/api/yahoo-finance?symbol=${symbol}`);
        const data = await res.json();
        if (data && data.currentPrice) {
            const levels = calculateLevels(data.high, data.low, data.currentPrice);
            const stockInfo = fnoStocks.find(s => s.symbol === symbol);
            setLookupData({
                name: stockInfo?.name || symbol,
                symbol: symbol,
                currentPrice: data.currentPrice,
                s4Level: levels.s4,
                high: data.high,
                low: data.low,
                pivot: levels.p,
                r1: levels.r1,
                r2: levels.r2,
                r3: levels.r3,
                s1: levels.s1,
                s2: levels.s2,
                s3: levels.s3,
                isTriggered: data.currentPrice <= levels.s4
            });
        }
    } catch (err) {
        console.error("Lookup failed", err);
    } finally {
        setIsLookupLoading(false);
    }
  };

  const triggeredStocks = scannedResults.filter(s => 
    s.isTriggered && 
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stockOptions = useMemo(() => fnoStocks.map(s => ({ value: s.symbol, label: `${s.symbol} - ${s.name}` })), []);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-tight flex items-center gap-3">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              S4 Support Scanner
            </h1>
            <p className="text-muted-foreground">Monitoring 200+ FNO stocks for critical support breakouts.</p>
          </div>
          <div className="flex items-center gap-3">
             {lastScanTime && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                    Last scan: {lastScanTime.toLocaleTimeString()}
                </span>
             )}
             <Button 
                onClick={startScan} 
                disabled={isScanning}
                className={cn("min-w-[140px]", isScanning && "animate-pulse")}
             >
                <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                {isScanning ? "Scanning..." : "Start Full Scan"}
             </Button>
          </div>
        </header>

        {/* COOL FEATURE LOADED SEARCH BAR */}
        <Card className="border-primary/20 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Gauge className="h-24 w-24" />
            </div>
            <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl font-headline flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Instant Level Lookup
                </CardTitle>
                <CardDescription>Search any stock from the FNO list to identify its current S/R zone.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="max-w-md">
                    <Combobox
                        options={stockOptions}
                        value={lookupSymbol}
                        onChange={handleLookup}
                        placeholder="Search stock (e.g. RELIANCE)..."
                        searchPlaceholder="Type symbol or name..."
                    />
                </div>

                {isLookupLoading && (
                    <div className="flex items-center justify-center p-8">
                        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {lookupData && !isLookupLoading && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl border bg-background shadow-sm">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Current Price</p>
                                <p className="text-3xl font-mono font-black text-primary">₹<AnimatedCounter value={lookupData.currentPrice} /></p>
                                <p className="text-xs text-muted-foreground mt-1">{lookupData.name}</p>
                            </div>
                            <Button asChild variant="outline" className="w-full h-12">
                                <Link href={`/reports/${lookupData.symbol}`}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Detailed Technical Report
                                </Link>
                            </Button>
                        </div>

                        <div className="lg:col-span-2 p-6 rounded-xl border-2 border-primary/10 bg-primary/5 relative">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold uppercase tracking-tighter flex items-center gap-2">
                                    <Gauge className="h-4 w-4" />
                                    Market Position Gauge
                                </h4>
                                <Badge variant={lookupData.currentPrice > lookupData.pivot ? "success" : "destructive"}>
                                    {lookupData.currentPrice > lookupData.pivot ? "Bullish Territory" : "Bearish Territory"}
                                </Badge>
                             </div>
                             <div className="space-y-3">
                                <LevelIndicator label="R3 (Extreme Resistance)" value={lookupData.r3} current={lookupData.currentPrice} type="resistance" />
                                <LevelIndicator label="R2 (Major Resistance)" value={lookupData.r2} current={lookupData.currentPrice} type="resistance" />
                                <LevelIndicator label="R1 (Minor Resistance)" value={lookupData.r1} current={lookupData.currentPrice} type="resistance" />
                                <LevelIndicator label="Pivot Point (Balance)" value={lookupData.pivot} current={lookupData.currentPrice} type="pivot" />
                                <LevelIndicator label="S1 (Minor Support)" value={lookupData.s1} current={lookupData.currentPrice} type="support" />
                                <LevelIndicator label="S2 (Major Support)" value={lookupData.s2} current={lookupData.currentPrice} type="support" />
                                <LevelIndicator label="S3 (Critical Floor)" value={lookupData.s3} current={lookupData.currentPrice} type="support" />
                                <LevelIndicator label="S4 (Deep Support)" value={lookupData.s4Level} current={lookupData.currentPrice} type="support" />
                             </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between text-sm font-bold uppercase tracking-wider">
                        <span>Market Scan in Progress...</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-headline text-destructive">Scan Results: S4 Hits</CardTitle>
                        <CardDescription>
                            FNO stocks currently trading at or below the deep S4 support level.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filter full results..."
                                className="pl-9 h-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">S4 = S3 - (High - Low)</p>
                                    <p className="text-[10px] italic">Identifies extreme oversold conditions in the market.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Stock Name</TableHead>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead className="text-right">S4 Level</TableHead>
                                    <TableHead className="text-right">Current Price</TableHead>
                                    <TableHead className="text-right">Difference</TableHead>
                                    <TableHead className="text-center">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {triggeredStocks.length > 0 ? (
                                    triggeredStocks.map((stock) => (
                                        <TableRow key={stock.symbol} className="bg-destructive/5 hover:bg-destructive/10 transition-colors group">
                                            <TableCell className="font-semibold">{stock.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="destructive">{stock.symbol}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-destructive">
                                                ₹<AnimatedCounter value={stock.s4Level} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-black">
                                                ₹<AnimatedCounter value={stock.currentPrice} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-destructive">
                                                <div className="flex items-center justify-end gap-1">
                                                    <ArrowDownCircle className="h-3 w-3" />
                                                    {((stock.currentPrice - stock.s4Level) / stock.s4Level * 100).toFixed(2)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button size="sm" variant="outline" asChild className="h-8 group-hover:bg-destructive group-hover:text-destructive-foreground transition-all">
                                                    <Link href={`/reports/${stock.symbol}`}>
                                                        <ExternalLink className="mr-2 h-3 w-3" />
                                                        Details
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                                            {isScanning ? "Market scanning in progress..." : scannedResults.length > 0 ? "No stocks currently at S4 levels. High stability detected." : "Initiate scan to monitor FNO markets."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function LevelIndicator({ label, value, current, type }: { label: string, value: number, current: number, type: 'resistance'|'support'|'pivot' }) {
    // Determine if the price is currently "at" this level (within 0.2%)
    const isAtLevel = Math.abs(current - value) / value < 0.002;
    // Determine if the price is between this level and the next one (simplified)
    const isActive = (type === 'resistance' && current < value) || (type === 'support' && current > value);

    return (
        <div className={cn(
            "flex items-center justify-between p-2 rounded-lg border transition-all",
            isAtLevel ? "bg-primary border-primary text-primary-foreground scale-[1.02] shadow-lg z-10" : "bg-background border-muted opacity-60"
        )}>
            <div className="flex items-center gap-2">
                {isAtLevel ? (
                    <Target className="h-3 w-3 animate-pulse" />
                ) : (
                    type === 'resistance' ? <TrendingUp className="h-3 w-3 text-success" /> : 
                    type === 'support' ? <TrendingDown className="h-3 w-3 text-destructive" /> : 
                    <Info className="h-3 w-3 text-primary" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
            </div>
            <div className="flex items-center gap-4">
                {isAtLevel && <span className="text-[9px] font-black uppercase tracking-widest animate-bounce">Currently At</span>}
                <span className="font-mono text-xs font-bold">₹{value.toFixed(2)}</span>
            </div>
        </div>
    );
}
