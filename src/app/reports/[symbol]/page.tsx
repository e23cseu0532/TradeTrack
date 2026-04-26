
"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { StockRecord } from "@/app/types/trade";
import AnimatedCounter from "@/components/AnimatedCounter";
import { AlertCircle, TrendingUp, TrendingDown, Target, Shield, Info, FileText, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export default function StockReportPage() {
  const { symbol } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();

  const [stockData, setStockData] = useState<any>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);

  // Fetch stock details from Yahoo Finance
  useEffect(() => {
    if (!symbol) return;
    setIsLoadingPrice(true);
    fetch(`/api/yahoo-finance?symbol=${symbol}`)
      .then(res => res.json())
      .then(data => {
        setStockData(data);
        setIsLoadingPrice(false);
      })
      .catch(err => {
        console.error("Failed to fetch stock data", err);
        setIsLoadingPrice(false);
      });
  }, [symbol]);

  // Fetch user's trade record for this symbol
  const tradeQuery = useMemoFirebase(() => {
    if (!user || !firestore || !symbol) return null;
    return query(collection(firestore, `users/${user.uid}/stockRecords`), where("stockSymbol", "==", symbol));
  }, [user, firestore, symbol]);

  const { data: trades } = useCollection<StockRecord>(tradeQuery);
  const trade = useMemo(() => {
      if (!trades || trades.length === 0) return null;
      // Get the latest entry
      return [...trades].sort((a, b) => 
        (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
      )[0];
  }, [trades]);

  const stopLossHit = useMemo(() => {
    if (!stockData?.currentPrice || !trade?.stopLoss) return false;
    return stockData.currentPrice <= trade.stopLoss;
  }, [stockData, trade]);

  // 1. FIXED GANN SQUARE OF NINE
  const fixedGann = useMemo(() => {
    const price = stockData?.previousClose || 0;
    if (!price) return [];
    const root = Math.sqrt(price);
    const step = 0.25;
    const levels = [];
    for (let n = -9; n <= 9; n++) {
      levels.push({
        levelNumber: n + 10,
        value: n === 0 ? price : Math.pow(root + (n * step), 2),
        angle: n * 45,
        n
      });
    }
    return levels;
  }, [stockData]);

  // 2. DYNAMIC GANN SQUARE OF NINE
  const dynamicGann = useMemo(() => {
    const price = stockData?.currentPrice || 0;
    if (!price || price <= 0) return [];

    const baseRoot = Math.floor(Math.sqrt(price));
    const rows = [baseRoot - 1, baseRoot, baseRoot + 1];

    return rows.map(rowBase => {
        const levels = [];
        for (let i = 0; i < 9; i++) {
            const value = Math.pow(rowBase + (i * 0.125), 2);
            levels.push(value);
        }
        return { base: rowBase, levels };
    });
  }, [stockData]);

  // 3. RETRACEMENT LEVELS
  const retracements = useMemo(() => {
    const high = stockData?.high || trade?.targetPrice1 || 0;
    const low = stockData?.low || trade?.entryPrice || 0;
    const range = high - low;

    if (range <= 0) return { gann: [], fib: [] };

    const gannRatios = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
    const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786];

    return {
      gann: gannRatios.map(r => ({ ratio: (r * 100).toFixed(1) + "%", value: high - (range * r) })),
      fib: fibRatios.map(r => ({ ratio: (r * 100).toFixed(1) + "%", value: high - (range * r) }))
    };
  }, [stockData, trade]);

  // 4. PIVOT LEVELS
  const pivots = useMemo(() => {
    const h = stockData?.high || 0;
    const l = stockData?.low || 0;
    const c = stockData?.currentPrice || 0;

    if (!h || !l || !c) return null;

    const p = (h + l + c) / 3;
    return {
      p,
      r1: (p * 2) - l,
      r2: p + (h - l),
      r3: h + 2 * (p - l),
      s1: (p * 2) - h,
      s2: p - (h - l),
      s3: l - 2 * (h - p)
    };
  }, [stockData]);

  if (isLoadingPrice) {
    return (
      <AppLayout>
        <div className="p-8 space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 animate-fade-in max-w-7xl mx-auto w-full">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-tight">
              {symbol} Report
            </h1>
            <p className="text-muted-foreground">Detailed technical analysis and trade thesis.</p>
          </div>
          <div className="flex gap-4">
            <Card className="px-6 py-2 border-primary/20 bg-primary/5">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Current Price</p>
                <p className="text-2xl font-mono font-black text-primary">
                    ₹<AnimatedCounter value={stockData?.currentPrice} />
                </p>
            </Card>
            <Card className="px-6 py-2 border-muted">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Previous Close</p>
                <p className="text-2xl font-mono font-bold text-muted-foreground">
                    ₹<AnimatedCounter value={stockData?.previousClose} />
                </p>
            </Card>
          </div>
        </header>

        {stopLossHit && (
          <div className="bg-destructive/10 border-2 border-destructive p-4 rounded-xl flex items-center gap-4 text-destructive animate-pulse">
            <AlertCircle className="h-8 w-8" />
            <div>
                <h4 className="font-bold uppercase tracking-widest text-sm">Stop-Loss Triggered</h4>
                <p className="text-xs">Current price is below your defined limit of ₹{trade?.stopLoss}.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* TRADE NOTES SECTION - REDESIGNED */}
          <Card className="lg:col-span-1 shadow-lg border-primary/10 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4">
                <CardTitle className="text-lg font-headline flex items-center gap-2">
                    <FileText className="text-primary h-5 w-5" />
                    Trade Thesis
                </CardTitle>
                <CardDescription className="text-xs">Notes recorded for this entry.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 relative min-h-[200px]">
                <Quote className="absolute top-2 right-4 h-12 w-12 text-primary/5 -z-0" />
                {trade?.notes ? (
                    <div className="relative z-10">
                        <p className="text-sm leading-relaxed italic text-muted-foreground whitespace-pre-wrap">
                            "{trade.notes}"
                        </p>
                        <div className="mt-6 pt-4 border-t border-dashed flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Entry Date</span>
                            <Badge variant="outline" className="text-[10px]">{trade.dateTime?.toDate().toLocaleDateString()}</Badge>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 opacity-50 space-y-2">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <p className="text-xs italic">No notes found for this trade.</p>
                        <Button variant="link" size="sm" asChild>
                            <a href="/">Add notes on Home Page</a>
                        </Button>
                    </div>
                )}
            </CardContent>
          </Card>

          {/* GANN LEVELS TABLE */}
          <Card className="lg:col-span-2 shadow-lg border-primary/5">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="font-headline flex items-center gap-2">
                <Target className="text-primary h-5 w-5" />
                Gann Square of Nine
              </CardTitle>
              <CardDescription>Support and resistance levels based on Gann mathematics.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="fixed">
                <TabsList className="w-full rounded-none h-12">
                  <TabsTrigger value="fixed" className="flex-1">Fixed (Prev Close)</TabsTrigger>
                  <TabsTrigger value="dynamic" className="flex-1">Dynamic (LTP Grid)</TabsTrigger>
                </TabsList>
                <TabsContent value="fixed" className="mt-0">
                   <FixedGannTable levels={fixedGann} />
                </TabsContent>
                <TabsContent value="dynamic" className="mt-0">
                   <DynamicGannGrid rows={dynamicGann} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* RETRACEMENT TABLE */}
          <Card className="shadow-lg border-primary/5">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="font-headline flex items-center gap-2">
                <Shield className="text-primary h-5 w-5" />
                Retracement Analysis
              </CardTitle>
              <CardDescription>Key price correction zones.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="gann">
                <TabsList className="w-full rounded-none h-12">
                  <TabsTrigger value="gann" className="flex-1">Gann Retracement</TabsTrigger>
                  <TabsTrigger value="fib" className="flex-1">Fibonacci Levels</TabsTrigger>
                </TabsList>
                <TabsContent value="gann" className="mt-0">
                  <RetracementTable data={retracements.gann} type="Gann" />
                </TabsContent>
                <TabsContent value="fib" className="mt-0">
                  <RetracementTable data={retracements.fib} type="Fibonacci" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* PIVOT LEVELS TABLE */}
          <Card className="shadow-lg border-primary/5 lg:col-span-2">
            <CardHeader className="border-b bg-muted/30">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="font-headline flex items-center gap-2">
                            <TrendingUp className="text-primary h-5 w-5" />
                            Pivot Points (S/R)
                        </CardTitle>
                        <CardDescription>Immediate support and resistance.</CardDescription>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                                    <Info className="h-5 w-5 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="p-4 max-w-sm">
                                <div className="space-y-2">
                                    <h4 className="font-bold border-b pb-1">Standard Floor Pivot Formulas</h4>
                                    <div className="font-mono text-[11px] space-y-1">
                                        <p className="text-primary font-bold">P = (High + Low + Close) / 3</p>
                                        <div className="grid grid-cols-2 gap-x-4">
                                            <div>
                                                <p className="text-success">R1 = (P * 2) - Low</p>
                                                <p className="text-success">R2 = P + (High - Low)</p>
                                                <p className="text-success">R3 = High + 2*(P - Low)</p>
                                            </div>
                                            <div>
                                                <p className="text-destructive">S1 = (P * 2) - High</p>
                                                <p className="text-destructive">S2 = P - (High - Low)</p>
                                                <p className="text-destructive">S3 = Low - 2*(High - P)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="grid grid-cols-2 gap-4 order-2 md:order-1">
                        <LevelRow label="R3" value={pivots?.r3} className="text-success font-bold" />
                        <LevelRow label="S3" value={pivots?.s3} className="text-destructive font-bold" />
                        <LevelRow label="R2" value={pivots?.r2} className="text-success" />
                        <LevelRow label="S2" value={pivots?.s2} className="text-destructive" />
                        <LevelRow label="R1" value={pivots?.r1} className="text-success/80" />
                        <LevelRow label="S1" value={pivots?.s1} className="text-destructive/80" />
                    </div>
                    <div className="bg-primary/5 border-2 border-primary/10 rounded-2xl p-10 text-center order-1 md:order-2 shadow-inner">
                        <span className="text-xs uppercase font-bold text-muted-foreground block mb-2 tracking-widest">Central Pivot Point</span>
                        <p className="text-5xl font-mono font-black text-primary">₹<AnimatedCounter value={pivots?.p} /></p>
                        <p className="text-[10px] text-muted-foreground mt-4 italic font-medium">Equilibrium Zone</p>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function FixedGannTable({ levels }: { levels: any[] }) {
  const getRowClass = (levelNumber: number) => {
    if (levelNumber === 10) return "bg-primary/20 font-bold";
    if (levelNumber === 8 || levelNumber === 12) return "bg-yellow-500/10";
    if (levelNumber % 2 === 0) return "bg-purple-500/10";
    return "bg-muted/50";
  };

  return (
    <div className="overflow-x-auto">
        <Table>
        <TableHeader>
            <TableRow>
            <TableHead>Level</TableHead>
            <TableHead className="text-right">Price Value</TableHead>
            <TableHead className="text-right">Angle</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {levels.map((l, i) => (
            <TableRow key={i} className={getRowClass(l.levelNumber)}>
                <TableCell>{l.levelNumber}</TableCell>
                <TableCell className="text-right font-mono">₹<AnimatedCounter value={l.value} /></TableCell>
                <TableCell className="text-right text-muted-foreground">{l.angle}°</TableCell>
            </TableRow>
            ))}
        </TableBody>
        </Table>
    </div>
  );
}

function DynamicGannGrid({ rows }: { rows: any[] }) {
    if (rows.length === 0) return <p className="p-8 text-center text-muted-foreground">Price data unavailable.</p>;
    
    return (
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Base</TableHead>
                {Array.from({ length: 9 }).map((_, i) => (
                  <TableHead key={i} className="text-right">T{i}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.base}>
                  <TableCell className="font-bold bg-muted/30">{row.base}</TableCell>
                  {row.levels.map((level: number, index: number) => (
                    <TableCell key={index} className="text-right font-mono text-xs">
                       ₹<AnimatedCounter value={level} precision={2} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
    );
}

function RetracementTable({ data, type }: { data: any[], type: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{type} Ratio</TableHead>
          <TableHead className="text-right">Retracement Level</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item, i) => (
          <TableRow key={i} className={cn(item.ratio === "50.0%" && "bg-amber-500/10 font-bold")}>
            <TableCell className="font-semibold">{item.ratio}</TableCell>
            <TableCell className="text-right font-mono">₹<AnimatedCounter value={item.value} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LevelRow({ label, value, className }: { label: string, value?: number, className?: string }) {
    return (
        <div className="flex justify-between items-center p-3 border rounded-xl bg-muted/10">
            <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
            <span className={cn("font-mono text-sm", className)}>
                ₹<AnimatedCounter value={value} />
            </span>
        </div>
    )
}
