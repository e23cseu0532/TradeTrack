
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, ShieldAlert, ExternalLink, ArrowDownCircle, Info, Target, TrendingUp, TrendingDown, Gauge, ArrowUpCircle, Layers, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { format } from "date-fns";

type PivotLevel = 'r4' | 'r3' | 'r2' | 'r1' | 's1' | 's2' | 's3' | 's4';

interface ScannedStock {
  name: string;
  symbol: string;
  currentPrice: number;
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export default function PivotScannerPage() {
  const [targetLevel, setTargetLevel] = useState<PivotLevel>('s1');
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
    const pivot = (h + l + c) / 3;
    const r1 = (pivot * 2) - l;
    const s1 = (pivot * 2) - h;
    const r2 = pivot + (h - l);
    const s2 = pivot - (h - l);
    const r3 = h + 2 * (pivot - l);
    const s3 = l - 2 * (h - pivot);
    const s4 = s3 - (h - l);
    const r4 = r3 + (h - l);
    
    return { pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
  };

  const startScan = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setProgress(0);
    setScannedResults([]);
    
    const total = fnoStocks.length;
    // Small batches and higher delay to avoid Yahoo Finance 429/Block
    const batchSize = 3; 
    const delayBetweenBatches = 600;

    for (let i = 0; i < total; i += batchSize) {
      const batch = fnoStocks.slice(i, i + batchSize);
      
      const promises = batch.map(async (stock) => {
        try {
          const res = await fetch(`/api/yahoo-finance?symbol=${stock.symbol}`);
          const data = await res.json();
          
          if (data && data.currentPrice && data.high && data.low) {
            // Uses standard daily OHLC from API (prevDay)
            const levels = calculateLevels(data.high, data.low, data.previousClose);

            return {
              name: stock.name,
              symbol: stock.symbol,
              currentPrice: data.currentPrice,
              ...levels,
            };
          }
        } catch (err) {
          console.error(`Failed to scan ${stock.symbol}`, err);
        }
        return null;
      });

      const batchResults = await Promise.all(promises);
      const validResults = batchResults.filter((r): r is ScannedStock => r !== null);
      
      if (validResults.length > 0) {
        setScannedResults(prev => {
            // Filter out any potential duplicates by symbol
            const existingSymbols = new Set(prev.map(s => s.symbol));
            const newResults = validResults.filter(r => !existingSymbols.has(r.symbol));
            return [...prev, ...newResults];
        });
      }
      
      setProgress(Math.round(((i + batch.length) / total) * 100));
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }

    setIsScanning(false);
    setLastScanTime(new Date());
  }, [isScanning]);

  const handleLookup = async (symbol: string) => {
    if (!symbol) return;
    setLookupSymbol(symbol);
    
    setIsLookupLoading(true);
    try {
        const res = await fetch(`/api/yahoo-finance?symbol=${symbol}`);
        const data = await res.json();
        if (data && data.currentPrice) {
            const levels = calculateLevels(data.high, data.low, data.previousClose);
            const stockInfo = fnoStocks.find(s => s.symbol === symbol);
            
            setLookupData({
                name: stockInfo?.name || symbol,
                symbol: symbol,
                currentPrice: data.currentPrice,
                ...levels,
            });
        }
    } catch (err) {
        console.error("Lookup failed", err);
    } finally {
        setIsLookupLoading(false);
    }
  };

  const isSupportScan = targetLevel.startsWith('s');

  const triggeredStocks = useMemo(() => {
      return scannedResults.filter(s => {
          const targetVal = (s as any)[targetLevel];
          if (!targetVal) return false;

          // Hit logic:
          // For Support: Stock is at level, broken below, or within 2% above it (Approaching)
          // For Resistance: Stock is at level, broken above, or within 2% below it (Approaching)
          const deviation = (s.currentPrice - targetVal) / targetVal;
          
          const isTriggered = isSupportScan 
              ? deviation <= 0.02 // Within 2% buffer or already below
              : deviation >= -0.02; // Within 2% buffer or already above

          const matchesSearch = s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
                               s.name.toLowerCase().includes(searchTerm.toLowerCase());

          return isTriggered && matchesSearch;
      }).sort((a, b) => {
          const targetA = (a as any)[targetLevel];
          const targetB = (b as any)[targetLevel];
          const devA = Math.abs((a.currentPrice - targetA) / targetA);
          const devB = Math.abs((b.currentPrice - targetB) / targetB);
          return devA - devB; // Sort by absolute proximity
      });
  }, [scannedResults, searchTerm, targetLevel, isSupportScan]);

  const stockOptions = useMemo(() => fnoStocks.map(s => ({ value: s.symbol, label: `${s.symbol} - ${s.name}` })), []);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-down">
          <div>
            <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tight flex items-center gap-3">
              <Layers className="h-10 w-10 text-primary" />
              Pivot Level Scanner
            </h1>
            <p className="text-muted-foreground font-medium">Detecting key Technical Setups across {fnoStocks.length} FNO symbols.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-2 rounded-2xl border">
             <div className="flex items-center gap-2 px-3">
                <span className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Target Trigger</span>
                <Select value={targetLevel} onValueChange={(val: PivotLevel) => setTargetLevel(val)}>
                    <SelectTrigger className="w-24 h-9 font-black uppercase tracking-widest text-xs border-primary/20">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="r4" className="text-success font-bold">R4 High</SelectItem>
                        <SelectItem value="r3" className="text-success">R3 Res</SelectItem>
                        <SelectItem value="r2" className="text-success">R2 Res</SelectItem>
                        <SelectItem value="r1" className="text-success">R1 Res</SelectItem>
                        <SelectItem value="s1" className="text-destructive">S1 Supp</SelectItem>
                        <SelectItem value="s2" className="text-destructive">S2 Supp</SelectItem>
                        <SelectItem value="s3" className="text-destructive">S3 Supp</SelectItem>
                        <SelectItem value="s4" className="text-destructive font-bold">S4 Low</SelectItem>
                    </SelectContent>
                </Select>
             </div>
             <Button 
                onClick={startScan} 
                disabled={isScanning}
                className={cn("min-w-[140px] h-9 font-bold transition-all", isScanning && "bg-muted-foreground animate-pulse")}
             >
                <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                {isScanning ? "Scanning..." : "Start Market Scan"}
             </Button>
          </div>
        </header>

        {/* LOOKUP PANEL */}
        <Card className="border-primary/20 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Gauge className="h-24 w-24" />
            </div>
            <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl font-headline flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Quick Level Visualizer
                </CardTitle>
                <CardDescription>Check the current technical stance for any specific stock.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="max-w-md">
                    <Combobox
                        options={stockOptions}
                        value={lookupSymbol}
                        onChange={handleLookup}
                        placeholder="Select symbol..."
                        searchPlaceholder="Type name or symbol..."
                    />
                </div>

                {isLookupLoading && (
                    <div className="flex flex-col items-center justify-center p-8 gap-2">
                        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-[10px] font-black uppercase text-muted-foreground">Fetching market depth...</p>
                    </div>
                )}

                {lookupData && !isLookupLoading && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl border bg-background shadow-sm text-center">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Current LTP</p>
                                <p className="text-4xl font-mono font-black text-primary">₹<AnimatedCounter value={lookupData.currentPrice} /></p>
                                <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">{lookupData.name}</p>
                            </div>
                            <Button asChild variant="outline" className="w-full h-12 font-bold uppercase tracking-tight hover:bg-primary hover:text-primary-foreground transition-all">
                                <Link href={`/reports/${lookupData.symbol}`}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Detailed Analysis
                                </Link>
                            </Button>
                        </div>

                        <div className="lg:col-span-2 p-6 rounded-xl border-2 border-primary/10 bg-primary/5 relative">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="font-black uppercase tracking-tighter text-xs text-muted-foreground flex items-center gap-2">
                                    <Gauge className="h-4 w-4" /> Pivot Distribution
                                </h4>
                                {lookupData.currentPrice > lookupData.pivot ? (
                                    <Badge className="bg-success/20 text-success border-success/30 uppercase tracking-widest text-[9px]">Bullish Zone</Badge>
                                ) : (
                                    <Badge className="bg-destructive/20 text-destructive border-destructive/30 uppercase tracking-widest text-[9px]">Bearish Zone</Badge>
                                )}
                             </div>
                             <div className="space-y-2">
                                <LevelIndicator label="R4 Extension" value={lookupData.r4} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r4'} />
                                <LevelIndicator label="R3 Resistance" value={lookupData.r3} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r3'} />
                                <LevelIndicator label="R2 Resistance" value={lookupData.r2} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r2'} />
                                <LevelIndicator label="R1 Resistance" value={lookupData.r1} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r1'} />
                                <LevelIndicator label="Central Pivot" value={lookupData.pivot} current={lookupData.currentPrice} type="pivot" target={false} />
                                <LevelIndicator label="S1 Support" value={lookupData.s1} current={lookupData.currentPrice} type="support" target={targetLevel === 's1'} />
                                <LevelIndicator label="S2 Support" value={lookupData.s2} current={lookupData.currentPrice} type="support" target={targetLevel === 's2'} />
                                <LevelIndicator label="S3 Support" value={lookupData.s3} current={lookupData.currentPrice} type="support" target={targetLevel === 's3'} />
                                <LevelIndicator label="S4 Extension" value={lookupData.s4} current={lookupData.currentPrice} type="support" target={targetLevel === 's4'} />
                             </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5 shadow-inner">
                <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between text-xs font-black uppercase tracking-wider text-primary">
                        <span className="flex items-center gap-2">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Processing FNO Bucket... ({scannedResults.length} / {fnoStocks.length} symbols)
                        </span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
            <Card className="border-2 shadow-2xl">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-7 bg-muted/10">
                    <div className="space-y-1">
                        <div className="flex items-center gap-4">
                            <CardTitle className={cn("text-2xl font-headline flex items-center gap-2", isSupportScan ? "text-destructive" : "text-success")}>
                                {isSupportScan ? <TrendingDown /> : <TrendingUp />}
                                {targetLevel.toUpperCase()} {isSupportScan ? "Support Hits" : "Breakout Hits"}
                            </CardTitle>
                            {lastScanTime && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase bg-background border px-2 py-1 rounded-md">
                                    <Clock className="h-3 w-3" />
                                    Last Updated: {format(lastScanTime, "HH:mm:ss")}
                                </div>
                            )}
                        </div>
                        <CardDescription>
                            Stocks trading near or through the {targetLevel.toUpperCase()} level ($2\%$ detection buffer).
                        </CardDescription>
                    </div>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Filter symbol or name..."
                            className="pl-9 h-9 text-xs"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="h-10">
                                <TableHead className="text-[10px] font-black uppercase tracking-widest pl-6">Stock Identifier</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">{targetLevel.toUpperCase()} Target</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Live LTP</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest pr-10">Proximity %</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase tracking-widest pr-6">Report</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {triggeredStocks.length > 0 ? (
                                triggeredStocks.map((stock) => {
                                    const targetVal = (stock as any)[targetLevel];
                                    const diff = ((stock.currentPrice - targetVal) / targetVal * 100);
                                    return (
                                        <TableRow key={stock.symbol} className={cn(
                                            "transition-colors group h-14",
                                            isSupportScan ? "bg-destructive/5 hover:bg-destructive/10" : "bg-success/5 hover:bg-success/10"
                                        )}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={isSupportScan ? "destructive" : "success"} className="font-bold font-mono">
                                                        {stock.symbol}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[120px] hidden md:inline">
                                                        {stock.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-muted-foreground">
                                                ₹<AnimatedCounter value={targetVal} />
                                            </TableCell>
                                            <TableCell className={cn("text-right font-mono font-black", isSupportScan ? "text-destructive" : "text-success")}>
                                                ₹<AnimatedCounter value={stock.currentPrice} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono pr-10">
                                                <div className={cn(
                                                    "flex items-center justify-end gap-1 font-black text-xs",
                                                    diff > 0 ? (isSupportScan ? "text-primary" : "text-success") : (isSupportScan ? "text-destructive" : "text-primary")
                                                )}>
                                                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center pr-6">
                                                <Button size="sm" variant="outline" asChild className="h-8 shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                                                    <Link href={`/reports/${stock.symbol}`}>
                                                        View
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64 text-center text-muted-foreground italic">
                                        {isScanning ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative">
                                                    <RefreshCw className="h-10 w-10 animate-spin text-primary opacity-20" />
                                                    <Layers className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-black uppercase tracking-widest text-primary">Scanning In Progress...</p>
                                                    <p className="text-[9px] font-medium text-muted-foreground">Processed {scannedResults.length} of {fnoStocks.length} stocks. Hang tight.</p>
                                                </div>
                                            </div>
                                        ) : scannedResults.length > 0 ? (
                                            <div className="flex flex-col items-center gap-2 opacity-60">
                                                <ShieldAlert className="h-10 w-10" />
                                                <p className="text-sm font-bold">No setups detected at {targetLevel.toUpperCase()}</p>
                                                <p className="text-xs">No FNO stocks are currently trading within 2% of this level. Try S1 or R1 for more common triggers.</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-4 opacity-60">
                                                <div className="bg-muted p-4 rounded-full">
                                                    <RefreshCw className="h-10 w-10 text-muted-foreground" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-black uppercase tracking-widest">Market Feed Idle</p>
                                                    <p className="text-xs">Click 'Start Market Scan' to fetch live data for all FNO symbols.</p>
                                                </div>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function LevelIndicator({ label, value, current, type, target }: { label: string, value: number, current: number, type: 'resistance'|'support'|'pivot', target: boolean }) {
    const isAtLevel = value > 0 && Math.abs(current - value) / value < 0.003;
    
    return (
        <div className={cn(
            "flex items-center justify-between p-2 rounded-lg border transition-all",
            isAtLevel ? "bg-primary border-primary text-primary-foreground scale-[1.02] shadow-md ring-2 ring-primary/20" : 
            target ? "bg-muted border-primary/40 opacity-100 border-2" : "bg-background border-muted opacity-60"
        )}>
            <div className="flex items-center gap-2">
                {isAtLevel ? (
                    <Target className="h-3 w-3 animate-pulse" />
                ) : (
                    type === 'resistance' ? <TrendingUp className="h-3 w-3 text-success" /> : 
                    type === 'support' ? <TrendingDown className="h-3 w-3 text-destructive" /> : 
                    <Info className="h-3 w-3 text-primary" />
                )}
                <span className="text-[9px] font-black uppercase">{label}</span>
            </div>
            <div className="flex items-center gap-4">
                {isAtLevel && <span className="text-[8px] font-black uppercase animate-pulse">Live Test</span>}
                {target && !isAtLevel && <span className="text-[8px] font-black uppercase text-primary">Scanner Target</span>}
                <span className="font-mono text-xs font-bold">₹{value.toFixed(2)}</span>
            </div>
        </div>
    );
}
