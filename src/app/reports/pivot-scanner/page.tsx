
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, ShieldAlert, Layers, Clock, Calendar, ArrowRightLeft, TrendingUp, TrendingDown, Target, Zap, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fnoStocks } from "@/lib/fno-stocks";
import AnimatedCounter from "@/components/AnimatedCounter";
import { cn } from "@/lib/utils";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import type { StockRecord } from "@/app/types/trade";
import Link from "next/link";

type ScannerTimeframe = 'weekly' | 'monthly';

interface PivotMatrixStock {
  symbol: string;
  name: string;
  currentPrice: number;
  lowerLevel: { label: string; value: number };
  upperLevel: { label: string; value: number };
  zone: string;
}

export default function PivotScannerPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [timeframe, setTimeframe] = useState<ScannerTimeframe>('monthly');
  const [fnoResults, setFnoResults] = useState<PivotMatrixStock[]>([]);
  const [watchlistResults, setWatchlistResults] = useState<PivotMatrixStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // 1. Fetch User Watchlist
  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  const { data: trades } = useCollection<StockRecord>(stockRecordsCollection);

  const uniqueWatchlistSymbols = useMemo(() => {
    if (!trades) return [];
    return Array.from(new Set(trades.map(t => t.stockSymbol)));
  }, [trades]);

  /**
   * Official Camarilla Pivot Multipliers (TradingView Pine Script Standard)
   */
  const calculateMatrix = (symbol: string, name: string, h: number, l: number, c: number, current: number) => {
    const range = h - l;
    const p = (h + l + c) / 3;
    const levels = [
        { label: 'S5', value: c - (range * 1.1) },
        { label: 'S4', value: c - (range * 1.1 / 2) },
        { label: 'S3', value: c - (range * 1.1 / 4) },
        { label: 'S2', value: c - (range * 1.1 / 6) },
        { label: 'S1', value: c - (range * 1.1 / 12) },
        { label: 'Pivot', value: p },
        { label: 'R1', value: c + (range * 1.1 / 12) },
        { label: 'R2', value: c + (range * 1.1 / 6) },
        { label: 'R3', value: c + (range * 1.1 / 4) },
        { label: 'R4', value: c + (range * 1.1 / 2) },
        { label: 'R5', value: c + (range * 1.1) },
    ].sort((a, b) => a.value - b.value);

    let lower = levels[0];
    let upper = levels[levels.length - 1];

    for (let i = 0; i < levels.length - 1; i++) {
        if (current >= levels[i].value && current <= levels[i + 1].value) {
            lower = levels[i];
            upper = levels[i + 1];
            break;
        }
    }

    if (current > levels[levels.length - 1].value) {
        lower = levels[levels.length - 1];
        upper = { label: 'SKY', value: levels[levels.length - 1].value * 1.1 };
    }
    if (current < levels[0].value) {
        lower = { label: 'FLOOR', value: levels[0].value * 0.9 };
        upper = levels[0];
    }

    return {
        symbol,
        name,
        currentPrice: current,
        lowerLevel: lower,
        upperLevel: upper,
        zone: `${lower.label} - ${upper.label}`
    };
  };

  const runScanner = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress(0);
    setFnoResults([]);
    setWatchlistResults([]);

    // Step 1: Scan Watchlist (High Priority)
    const watchlistData: PivotMatrixStock[] = [];
    for (const sym of uniqueWatchlistSymbols) {
        try {
            const res = await fetch(`/api/yahoo-finance?symbol=${sym}&timeframe=${timeframe}`);
            const data = await res.json();
            if (data && data.currentPrice) {
                watchlistData.push(calculateMatrix(sym, sym, data.high, data.low, data.previousClose, data.currentPrice));
            }
        } catch (e) { console.error(e); }
    }
    setWatchlistResults(watchlistData);

    // Step 2: Scan FNO (Batched)
    const total = fnoStocks.length;
    const batchSize = 4;
    const fnoData: PivotMatrixStock[] = [];

    for (let i = 0; i < total; i += batchSize) {
        const batch = fnoStocks.slice(i, i + batchSize);
        const promises = batch.map(async (stock) => {
            try {
                const res = await fetch(`/api/yahoo-finance?symbol=${stock.symbol}&timeframe=${timeframe}`);
                const data = await res.json();
                if (data && data.currentPrice) {
                    return calculateMatrix(stock.symbol, stock.name, data.high, data.low, data.previousClose, data.currentPrice);
                }
            } catch (e) { return null; }
            return null;
        });

        const results = await Promise.all(promises);
        results.forEach(r => { if (r) fnoData.push(r); });
        
        setFnoResults([...fnoData]);
        setProgress(Math.round(((i + batch.length) / total) * 100));
        await new Promise(r => setTimeout(r, 300));
    }

    setIsScanning(false);
  }, [isScanning, timeframe, uniqueWatchlistSymbols]);

  // Default scan on mount
  useEffect(() => {
    if (uniqueWatchlistSymbols.length > 0 && fnoResults.length === 0 && !isScanning) {
        runScanner();
    }
  }, [uniqueWatchlistSymbols, runScanner]);

  const filteredWatchlist = watchlistResults.filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredFno = fnoResults.filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-down">
          <div>
            <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tight flex items-center gap-3">
              <Layers className="h-10 w-10 text-primary" />
              Pivot Matrix Scanner
            </h1>
            <p className="text-muted-foreground font-medium">Real-time zone detection synced with TradingView anchors.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-2 rounded-2xl border">
             <div className="flex items-center gap-2 px-3 border-r pr-4">
                <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> TV Context
                </span>
                <Select value={timeframe} onValueChange={(val: ScannerTimeframe) => setTimeframe(val)}>
                    <SelectTrigger className="w-56 h-9 font-bold uppercase text-[10px] border-primary/20 bg-background shadow-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="monthly">Monthly (Daily Charts)</SelectItem>
                        <SelectItem value="weekly">Weekly (Hourly Charts)</SelectItem>
                    </SelectContent>
                </Select>
             </div>
             <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Filter matrices..." 
                    className="pl-9 h-9 text-xs" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                />
             </div>
             <Button 
                onClick={runScanner} 
                disabled={isScanning}
                className={cn("min-w-[140px] h-9 font-bold transition-all", isScanning && "bg-muted-foreground animate-pulse")}
             >
                <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                {isScanning ? "Scanning..." : "Refresh Matrix"}
             </Button>
          </div>
        </header>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5 shadow-inner">
                <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-primary">
                        <span className="flex items-center gap-2">
                            <Zap className="h-3 w-3 animate-pulse" />
                            Analyzing {timeframe.toUpperCase()} Matrix Zones...
                        </span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* WATCHLIST MATRIX */}
            <Card className="border-2 shadow-xl overflow-hidden bg-card/50 backdrop-blur-md">
                <CardHeader className="bg-primary/5 border-b py-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary" />
                            Watchlist Matrix
                        </CardTitle>
                        <Badge variant="outline" className="text-[9px] font-black uppercase bg-background border-primary/20">
                            {watchlistResults.length} Assets
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <MatrixTable data={filteredWatchlist} isLoading={isScanning && watchlistResults.length === 0} />
                </CardContent>
            </Card>

            {/* FNO MATRIX */}
            <Card className="border-2 shadow-xl overflow-hidden bg-card/50 backdrop-blur-md">
                <CardHeader className="bg-muted/30 border-b py-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                            FNO Market Matrix
                        </CardTitle>
                        <Badge variant="secondary" className="text-[9px] font-black uppercase">
                            {fnoResults.length} Scanned
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <MatrixTable data={filteredFno} isLoading={isScanning && fnoResults.length === 0} />
                </CardContent>
            </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function MatrixTable({ data, isLoading }: { data: PivotMatrixStock[], isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Initializing Data Stream...</p>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-50">
                <ShieldAlert className="h-10 w-10 mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">No Matrix Data Found</p>
            </div>
        );
    }

    return (
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-20">
                    <TableRow className="h-10 border-b">
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Lower Anchor</TableHead>
                        <TableHead className="text-[10px] font-black uppercase px-6">Stock Zone</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Upper Anchor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((stock) => {
                        const distToLow = Math.abs(stock.currentPrice - stock.lowerLevel.value) / stock.lowerLevel.value;
                        const distToHigh = Math.abs(stock.currentPrice - stock.upperLevel.value) / stock.upperLevel.value;
                        const nearLow = distToLow < 0.003;
                        const nearHigh = distToHigh < 0.003;

                        return (
                            <TableRow key={stock.symbol} className="h-14 hover:bg-primary/5 transition-all group border-b last:border-0">
                                {/* LOWER ANCHOR */}
                                <TableCell className="text-center bg-muted/5">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[9px] font-black uppercase", nearLow ? "text-primary animate-pulse" : "text-muted-foreground/60")}>
                                            {stock.lowerLevel.label}
                                        </span>
                                        <span className={cn("font-mono text-[11px] font-bold", nearLow ? "text-primary scale-105" : "text-muted-foreground/80")}>
                                            ₹{stock.lowerLevel.value.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>

                                {/* STOCK INFO */}
                                <TableCell className="px-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-black tracking-tighter group-hover:text-primary transition-colors">
                                                    {stock.symbol}
                                                </span>
                                                {nearLow && <TrendingDown className="h-3 w-3 text-destructive animate-bounce" />}
                                                {nearHigh && <TrendingUp className="h-3 w-3 text-success animate-bounce" />}
                                            </div>
                                            <span className="text-[8px] font-bold text-muted-foreground uppercase truncate max-w-[120px]">
                                                {stock.name}
                                            </span>
                                        </div>
                                        <div className="text-right flex flex-col">
                                            <span className="font-mono text-xs font-black text-primary">
                                                ₹<AnimatedCounter value={stock.currentPrice} />
                                            </span>
                                            <div className="flex items-center justify-end gap-1">
                                                <div className="h-1 w-16 bg-muted rounded-full overflow-hidden relative">
                                                    <div 
                                                        className="h-full bg-primary/40 transition-all duration-700" 
                                                        style={{ width: `${Math.min(100, Math.max(0, ((stock.currentPrice - stock.lowerLevel.value) / (stock.upperLevel.value - stock.lowerLevel.value)) * 100))}%` }} 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>

                                {/* UPPER ANCHOR */}
                                <TableCell className="text-center bg-muted/5">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[9px] font-black uppercase", nearHigh ? "text-primary animate-pulse" : "text-muted-foreground/60")}>
                                            {stock.upperLevel.label}
                                        </span>
                                        <span className={cn("font-mono text-[11px] font-bold", nearHigh ? "text-primary scale-105" : "text-muted-foreground/80")}>
                                            ₹{stock.upperLevel.value.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

