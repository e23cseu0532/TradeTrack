
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
import { AlertCircle, TrendingUp, TrendingDown, Target, Shield, Info } from "lucide-react";
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

  // Fetch user's trade record for this symbol to get stop loss
  const tradeQuery = useMemoFirebase(() => {
    if (!user || !firestore || !symbol) return null;
    return query(collection(firestore, `users/${user.uid}/stockRecords`), where("stockSymbol", "==", symbol));
  }, [user, firestore, symbol]);

  const { data: trades } = useCollection<StockRecord>(tradeQuery);
  const trade = trades?.[0];

  const stopLossHit = useMemo(() => {
    if (!stockData?.currentPrice || !trade?.stopLoss) return false;
    return stockData.currentPrice <= trade.stopLoss;
  }, [stockData, trade]);

  // 1. GANN SQUARE OF NINE (Fixed & Dynamic)
  const calculateGann = (price: number) => {
    if (!price) return [];
    const root = Math.sqrt(price);
    const levels = [];
    for (let n = -9; n <= 9; n++) {
      levels.push({
        label: `T${n + 9}`,
        value: Math.pow(root + (n * 0.125), 2),
        n
      });
    }
    return levels;
  };

  const fixedGann = useMemo(() => calculateGann(stockData?.previousClose || 0), [stockData]);
  const dynamicGann = useMemo(() => calculateGann(stockData?.currentPrice || 0), [stockData]);

  // 2. RETRACEMENT LEVELS (Gann & Fib)
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

  // 3. SUPPORT & RESISTANCE (Pivot Points)
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
      <main className="flex-1 p-4 md:p-8 space-y-8 animate-fade-in">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-tight">
              {symbol} Report
            </h1>
            <p className="text-muted-foreground">Detailed technical analysis and price levels.</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* GANN LEVELS TABLE */}
          <Card>
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
                  <TabsTrigger value="dynamic" className="flex-1">Dynamic (LTP)</TabsTrigger>
                </TabsList>
                <TabsContent value="fixed" className="mt-0">
                   <GannTable levels={fixedGann} />
                </TabsContent>
                <TabsContent value="dynamic" className="mt-0">
                   <GannTable levels={dynamicGann} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* RETRACEMENT TABLE */}
          <Card>
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="font-headline flex items-center gap-2">
                <Shield className="text-primary h-5 w-5" />
                Retracement Analysis
              </CardTitle>
              <CardDescription>Key price correction zones for trend continuation.</CardDescription>
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
          <Card className="lg:col-span-2">
            <CardHeader className="border-b bg-muted/30">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="font-headline flex items-center gap-2">
                            <TrendingUp className="text-primary h-5 w-5" />
                            Pivot Point Levels (S/R)
                        </CardTitle>
                        <CardDescription>Standard pivot calculation for immediate support and resistance.</CardDescription>
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
                                    <p className="text-[10px] text-muted-foreground italic pt-2">Formula uses Period High, Period Low, and Current Price.</p>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-success uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" /> Resistance
                        </h4>
                        <div className="space-y-1">
                            <LevelRow label="R3" value={pivots?.r3} className="text-success font-bold" />
                            <LevelRow label="R2" value={pivots?.r2} className="text-success" />
                            <LevelRow label="R1" value={pivots?.r1} className="text-success/80" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                            Pivot Point
                        </h4>
                        <div className="bg-primary/5 border rounded-lg p-4 text-center">
                            <p className="text-2xl font-mono font-black text-primary">₹<AnimatedCounter value={pivots?.p} /></p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-destructive uppercase tracking-widest flex items-center gap-2">
                            <TrendingDown className="h-4 w-4" /> Support
                        </h4>
                        <div className="space-y-1">
                            <LevelRow label="S1" value={pivots?.s1} className="text-destructive/80" />
                            <LevelRow label="S2" value={pivots?.s2} className="text-destructive" />
                            <LevelRow label="S3" value={pivots?.s3} className="text-destructive font-bold" />
                        </div>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function GannTable({ levels }: { levels: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Level</TableHead>
          <TableHead className="text-right">Price Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {levels.map((l, i) => (
          <TableRow key={i} className={cn(l.n === 0 && "bg-primary/10 font-bold")}>
            <TableCell>{l.label}</TableCell>
            <TableCell className="text-right font-mono">₹<AnimatedCounter value={l.value} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
        <div className="flex justify-between items-center p-3 border rounded-md bg-muted/10">
            <span className="text-xs font-bold text-muted-foreground">{label}</span>
            <span className={cn("font-mono text-lg", className)}>
                ₹<AnimatedCounter value={value} />
            </span>
        </div>
    )
}
