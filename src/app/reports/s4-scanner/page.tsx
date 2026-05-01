
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, ShieldAlert, ExternalLink, ArrowDownCircle, Info, Target, TrendingUp, TrendingDown, Gauge, ArrowUpCircle, Layers } from "lucide-react";
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

type PivotLevel = 'r4' | 'r3' | 'r2' | 'r1' | 's1' | 's2' | 's3' | 's4';

interface ScannedStock {
  name: string;
  symbol: string;
  currentPrice: number;
  targetValue: number;
  high: number;
  low: number;
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  isTriggered: boolean;
}

export default function S4ScannerPage() {
  const [targetLevel, setTargetLevel] = useState<PivotLevel>('s4');
  const [scannedResults, setScannedResults] = useState<ScannedStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

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
            
            const isSupport = targetLevel.startsWith('s');
            const targetVal = (levels as any)[targetLevel];
            const isTriggered = isSupport ? (data.currentPrice <= targetVal) : (data.currentPrice >= targetVal);

            return {
              name: stock.name,
              symbol: stock.symbol,
              currentPrice: data.currentPrice,
              targetValue: targetVal,
              high: data.high,
              low: data.low,
              ...levels,
              isTriggered: isTriggered
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
  }, [targetLevel]);

  const handleLookup = async (symbol: string) => {
    if (!symbol) return;
    setLookupSymbol(symbol);
    
    setIsLookupLoading(true);
    try {
        const res = await fetch(`/api/yahoo-finance?symbol=${symbol}`);
        const data = await res.json();
        if (data && data.currentPrice) {
            const levels = calculateLevels(data.high, data.low, data.currentPrice);
            const stockInfo = fnoStocks.find(s => s.symbol === symbol);
            
            const isSupport = targetLevel.startsWith('s');
            const targetVal = (levels as any)[targetLevel];
            const isTriggered = isSupport ? (data.currentPrice <= targetVal) : (data.currentPrice >= targetVal);

            setLookupData({
                name: stockInfo?.name || symbol,
                symbol: symbol,
                currentPrice: data.currentPrice,
                targetValue: targetVal,
                high: data.high,
                low: data.low,
                ...levels,
                isTriggered: isTriggered
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

  const isSupportScan = targetLevel.startsWith('s');

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-tight flex items-center gap-3">
              <Layers className="h-10 w-10 text-primary" />
              Market Breakout Scanner
            </h1>
            <p className="text-muted-foreground font-medium">Monitor 200+ FNO stocks for specific pivot level triggers.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-2 rounded-2xl border">
             <div className="flex items-center gap-2 px-3">
                <span className="text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">Target Level</span>
                <Select value={targetLevel} onValueChange={(val: PivotLevel) => setTargetLevel(val)}>
                    <SelectTrigger className="w-24 h-9 font-black uppercase tracking-widest text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="r4" className="text-success">R4 High</SelectItem>
                        <SelectItem value="r3" className="text-success">R3 Resist</SelectItem>
                        <SelectItem value="r2" className="text-success">R2 Resist</SelectItem>
                        <SelectItem value="r1" className="text-success">R1 Resist</SelectItem>
                        <SelectItem value="s1" className="text-destructive">S1 Supp</SelectItem>
                        <SelectItem value="s2" className="text-destructive">S2 Supp</SelectItem>
                        <SelectItem value="s3" className="text-destructive">S3 Supp</SelectItem>
                        <SelectItem value="s4" className="text-destructive">S4 Low</SelectItem>
                    </SelectContent>
                </Select>
             </div>
             <Button 
                onClick={startScan} 
                disabled={isScanning}
                className={cn("min-w-[140px] h-9 font-bold", isScanning && "animate-pulse")}
             >
                <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                {isScanning ? "Scanning..." : "Start Full Scan"}
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
                    Technical Position Gauge
                </CardTitle>
                <CardDescription>Select any FNO stock to visualize its current range and nearest triggers.</CardDescription>
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
                            <div className="p-4 rounded-xl border bg-background shadow-sm text-center">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Current LTP</p>
                                <p className="text-4xl font-mono font-black text-primary">₹<AnimatedCounter value={lookupData.currentPrice} /></p>
                                <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">{lookupData.name}</p>
                            </div>
                            <Button asChild variant="outline" className="w-full h-12 font-bold uppercase tracking-tight">
                                <Link href={`/reports/${lookupData.symbol}`}>
                                    <ExternalLink className="mr-2 h-4 w-4 text-primary" />
                                    Detailed Report
                                </Link>
                            </Button>
                        </div>

                        <div className="lg:col-span-2 p-6 rounded-xl border-2 border-primary/10 bg-primary/5 relative">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="font-black uppercase tracking-tighter text-xs flex items-center gap-2 text-muted-foreground">
                                    <Gauge className="h-4 w-4" />
                                    Market Position
                                </h4>
                                <Badge variant={lookupData.currentPrice > lookupData.pivot ? "success" : "destructive"} className="font-bold uppercase tracking-widest text-[9px]">
                                    {lookupData.currentPrice > lookupData.pivot ? "Bullish Sentiment" : "Bearish Sentiment"}
                                </Badge>
                             </div>
                             <div className="space-y-2">
                                <LevelIndicator label="R4 (High Extension)" value={lookupData.r4} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r4'} />
                                <LevelIndicator label="R3 (Extreme Resistance)" value={lookupData.r3} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r3'} />
                                <LevelIndicator label="R2 (Major Resistance)" value={lookupData.r2} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r2'} />
                                <LevelIndicator label="R1 (Minor Resistance)" value={lookupData.r1} current={lookupData.currentPrice} type="resistance" target={targetLevel === 'r1'} />
                                <LevelIndicator label="Pivot Point (Balance)" value={lookupData.pivot} current={lookupData.currentPrice} type="pivot" target={false} />
                                <LevelIndicator label="S1 (Minor Support)" value={lookupData.s1} current={lookupData.currentPrice} type="support" target={targetLevel === 's1'} />
                                <LevelIndicator label="S2 (Major Support)" value={lookupData.s2} current={lookupData.currentPrice} type="support" target={targetLevel === 's2'} />
                                <LevelIndicator label="S3 (Critical Floor)" value={lookupData.s3} current={lookupData.currentPrice} type="support" target={targetLevel === 's3'} />
                                <LevelIndicator label="S4 (Deep Support)" value={lookupData.s4} current={lookupData.currentPrice} type="support" target={targetLevel === 's4'} />
                             </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between text-xs font-black uppercase tracking-wider text-primary">
                        <span className="flex items-center gap-2">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Analyzing Full FNO List...
                        </span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
            <Card className="border-2">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-7 bg-muted/10">
                    <div className="space-y-1">
                        <CardTitle className={cn("text-2xl font-headline flex items-center gap-2", isSupportScan ? "text-destructive" : "text-success")}>
                            {isSupportScan ? <TrendingDown /> : <TrendingUp />}
                            {targetLevel.toUpperCase()} {isSupportScan ? "Breakdown" : "Breakout"} Watch
                        </CardTitle>
                        <CardDescription>
                            Stocks currently trading {isSupportScan ? "below" : "above"} the {targetLevel.toUpperCase()} pivot level.
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                         <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filter stocks..."
                                className="pl-9 h-9 text-xs"
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
                                <TooltipContent className="max-w-xs">
                                    <p className="text-xs font-bold mb-1">Calculation Method:</p>
                                    <p className="text-[10px] leading-relaxed">
                                        This scanner uses Standard Floor Pivot formulas. Support triggers indicate oversold conditions, while Resistance triggers indicate extreme bullish strength.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="border-t">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="text-[10px] font-black uppercase tracking-widest">Stock Details</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">{targetLevel.toUpperCase()} Level</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Current LTP</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Deviation %</TableHead>
                                    <TableHead className="text-center text-[10px] font-black uppercase tracking-widest">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {triggeredStocks.length > 0 ? (
                                    triggeredStocks.map((stock) => (
                                        <TableRow key={stock.symbol} className={cn(
                                            "transition-colors group h-14",
                                            isSupportScan ? "bg-destructive/5 hover:bg-destructive/10" : "bg-success/5 hover:bg-success/10"
                                        )}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={isSupportScan ? "destructive" : "success"} className="font-bold font-mono">
                                                        {stock.symbol}
                                                    </Badge>
                                                    <span className="text-xs font-bold text-muted-foreground truncate max-w-[120px] hidden md:inline">
                                                        {stock.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-muted-foreground">
                                                ₹<AnimatedCounter value={stock.targetValue} />
                                            </TableCell>
                                            <TableCell className={cn("text-right font-mono font-black", isSupportScan ? "text-destructive" : "text-success")}>
                                                ₹<AnimatedCounter value={stock.currentPrice} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                <div className={cn(
                                                    "flex items-center justify-end gap-1 font-black text-xs",
                                                    isSupportScan ? "text-destructive" : "text-success"
                                                )}>
                                                    {isSupportScan ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                                                    {((stock.currentPrice - stock.targetValue) / stock.targetValue * 100).toFixed(2)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button size="sm" variant="outline" asChild className="h-8 group-hover:scale-105 transition-all text-[10px] font-black uppercase">
                                                    <Link href={`/reports/${stock.symbol}`}>
                                                        Details
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic">
                                            {isScanning ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <RefreshCw className="h-5 w-5 animate-spin" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">Scanning Market Depth...</p>
                                                </div>
                                            ) : scannedResults.length > 0 ? (
                                                <div className="flex flex-col items-center gap-2 opacity-50">
                                                    <ShieldAlert className="h-8 w-8" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No triggers found at {targetLevel.toUpperCase()} level.</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 opacity-50">
                                                    <Layers className="h-8 w-8" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">Select target level and start scan.</p>
                                                </div>
                                            )}
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

function LevelIndicator({ label, value, current, type, target }: { label: string, value: number, current: number, type: 'resistance'|'support'|'pivot', target: boolean }) {
    const isAtLevel = value > 0 && Math.abs(current - value) / value < 0.002;
    const displayValue = value ?? 0;
    
    return (
        <div className={cn(
            "flex items-center justify-between p-2 rounded-lg border transition-all relative overflow-hidden",
            isAtLevel ? "bg-primary border-primary text-primary-foreground scale-[1.02] shadow-lg z-10" : 
            target ? "bg-muted border-primary/50 opacity-100 border-2" : "bg-background border-muted opacity-60"
        )}>
            {target && !isAtLevel && (
                <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
            )}
            <div className="flex items-center gap-2">
                {isAtLevel ? (
                    <Target className="h-3 w-3 animate-pulse" />
                ) : (
                    type === 'resistance' ? <TrendingUp className="h-3 w-3 text-success" /> : 
                    type === 'support' ? <TrendingDown className="h-3 w-3 text-destructive" /> : 
                    <Info className="h-3 w-3 text-primary" />
                )}
                <span className="text-[9px] font-black uppercase tracking-tight">{label}</span>
            </div>
            <div className="flex items-center gap-4">
                {isAtLevel && <span className="text-[8px] font-black uppercase tracking-widest animate-bounce">Currently At</span>}
                {target && !isAtLevel && <span className="text-[8px] font-black uppercase tracking-widest text-primary">Scan Target</span>}
                <span className="font-mono text-xs font-bold">₹{displayValue.toFixed(2)}</span>
            </div>
        </div>
    );
}
