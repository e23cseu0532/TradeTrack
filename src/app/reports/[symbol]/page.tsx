
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
import { collection, query, where, doc } from "firebase/firestore";
import type { StockRecord } from "@/app/types/trade";
import AnimatedCounter from "@/components/AnimatedCounter";
import { AlertCircle, TrendingUp, Target, Shield, Info, FileText, Quote, Edit3, Save, Gauge, Activity, ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReportTimeframe = 'daily' | 'weekly' | 'monthly';

export default function StockReportPage() {
  const { symbol } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [timeframe, setTimeframe] = useState<ReportTimeframe>('daily');
  const [stockData, setStockData] = useState<any>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [gannLevelCount, setGannLevelCount] = useState(13); 

  useEffect(() => {
    if (!symbol) return;
    setIsLoadingPrice(true);
    fetch(`/api/yahoo-finance?symbol=${symbol}&timeframe=${timeframe}`)
      .then(res => res.json())
      .then(data => {
        setStockData(data);
        setIsLoadingPrice(false);
      })
      .catch(err => {
        console.error("Failed to fetch stock data", err);
        setIsLoadingPrice(false);
      });
  }, [symbol, timeframe]);

  const tradeQuery = useMemoFirebase(() => {
    if (!user || !firestore || !symbol) return null;
    return query(collection(firestore, `users/${user.uid}/stockRecords`), where("stockSymbol", "==", symbol));
  }, [user, firestore, symbol]);

  const { data: trades } = useCollection<StockRecord>(tradeQuery);
  
  const trade = useMemo(() => {
      if (!trades || trades.length === 0) return null;
      return [...trades].sort((a, b) => 
        (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
      )[0];
  }, [trades]);

  useEffect(() => {
    if (trade && !isEditingNote) {
      setLocalNote(trade.notes || "");
    }
  }, [trade, isEditingNote]);

  const stopLossHit = useMemo(() => {
    if (!stockData?.currentPrice || !trade?.stopLoss) return false;
    return stockData.currentPrice <= trade.stopLoss;
  }, [stockData, trade]);

  const handleSaveNote = () => {
    if (!user || !firestore || !trades || trades.length === 0) return;
    trades.forEach(t => {
        const tradeRef = doc(firestore, `users/${user.uid}/stockRecords`, t.id);
        updateDocumentNonBlocking(tradeRef, { notes: localNote });
    });
    setIsEditingNote(false);
    toast({ title: "Thesis Synced", description: "Updated across all entries." });
  };

  /**
   * Official Camarilla Pivot Calculation Logic
   * Multipliers synced with TradingView Pine Script Standard Protocol.
   */
  const pivots = useMemo(() => {
    const h = stockData?.high;
    const l = stockData?.low;
    const c = stockData?.previousClose;
    
    if (!h || !l || !c) return null;
    
    const range = h - l;
    const p = (h + l + c) / 3;
    
    return {
      p,
      r5: c + (range * 1.1),
      r4: c + (range * 1.1 / 2),
      r3: c + (range * 1.1 / 4),
      r2: c + (range * 1.1 / 6),
      r1: c + (range * 1.1 / 12),
      s1: c - (range * 1.1 / 12),
      s2: c - (range * 1.1 / 6),
      s3: c - (range * 1.1 / 4),
      s4: c - (range * 1.1 / 2),
      s5: c - (range * 1.1),
    };
  }, [stockData]);

  const fixedGann = useMemo(() => {
    const price = stockData?.previousClose || 0;
    if (!price) return [];
    const root = Math.sqrt(price);
    const stepValue = 0.25;
    const levels = [];
    const k = (gannLevelCount - 1) / 2;
    for (let n = -k; n <= k; n++) {
      const val = n === 0 ? price : Math.pow(root + (stepValue * n), 2);
      levels.push({
        levelNumber: n + 10,
        value: val,
        angle: n * 45,
        n,
        isNear: Math.abs(val - (stockData?.currentPrice || 0)) / (stockData?.currentPrice || 1) < 0.01
      });
    }
    return levels;
  }, [stockData, gannLevelCount]);

  const dynamicGann = useMemo(() => {
    const price = stockData?.currentPrice || 0;
    if (price <= 0) return [];
    const baseRoot = Math.floor(Math.sqrt(price));
    const rows = [baseRoot - 1, baseRoot, baseRoot + 1];
    return rows.map(rowBase => {
        const levels = [];
        for (let i = 0; i < 9; i++) {
            const val = Math.pow(rowBase + (i * 0.125), 2);
            levels.push({
                value: val,
                isNear: Math.abs(val - price) / price < 0.005,
                isAbove: val > price
            });
        }
        return { base: rowBase, levels };
    });
  }, [stockData]);

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

  if (isLoadingPrice) {
    return (
      <AppLayout>
        <div className="p-8 space-y-4 h-screen overflow-hidden">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-3 gap-4 h-full">
            <Skeleton className="h-full w-full" />
            <Skeleton className="h-full w-full" />
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="h-[calc(100vh-64px)] flex flex-col p-4 gap-4 overflow-hidden bg-muted/20">
        
        {/* HEADER BAR */}
        <header className="flex items-center justify-between bg-card border-2 px-4 py-2 rounded-xl shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-headline font-black text-primary uppercase tracking-tighter">{symbol}</h1>
            <div className="h-8 w-px bg-border" />
            <div className="flex items-center gap-2 px-3 bg-muted/30 rounded-lg border">
                <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Period
                </span>
                <Select value={timeframe} onValueChange={(val: ReportTimeframe) => setTimeframe(val)}>
                    <SelectTrigger className="w-24 h-7 text-[10px] font-black uppercase bg-transparent border-none focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <MetricBadge label="LTP" value={stockData?.currentPrice} color="primary" />
            <MetricBadge label="REF CLOSE" value={stockData?.previousClose} color="muted" />
            <MetricBadge label="SL" value={trade?.stopLoss} color="destructive" />
          </div>
          <div className="flex items-center gap-2">
            {stopLossHit && (
              <Badge variant="destructive" className="animate-pulse py-1 px-3 uppercase text-[10px] font-black">
                <AlertCircle className="h-3 w-3 mr-1" /> Stop-Loss Triggered
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] uppercase font-black bg-background border-primary/20 flex items-center gap-2">
              <Activity className="h-3 w-3 text-success" />
              Camarilla Protocol
            </Badge>
          </div>
        </header>

        {/* TRIPLE COLUMN WORKSPACE */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
          
          {/* COLUMN 1: CAMARILLA PIVOT FEED (2/12) */}
          <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
             <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 bg-card/50 backdrop-blur-sm shadow-xl">
                <CardHeader className="py-2 border-b bg-muted/30">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <Gauge className="h-3 w-3 text-primary" /> Camarilla Levels ({timeframe})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col">
                        <PivotStrip label="R5 Super High" value={pivots?.r5} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R4 Breakout" value={pivots?.r4} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R3 Target" value={pivots?.r3} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R2 Target" value={pivots?.r2} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R1 Target" value={pivots?.r1} current={stockData?.currentPrice} type="res" />
                        <div className="bg-primary py-1.5 px-3 flex justify-between items-center shadow-lg z-10 relative">
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black uppercase text-primary-foreground/70">Neutral Equilibrium</span>
                                <span className="text-[10px] font-black uppercase text-primary-foreground">Daily Pivot</span>
                            </div>
                            <span className="font-mono text-sm font-black text-primary-foreground">₹{pivots?.p.toFixed(2)}</span>
                        </div>
                        <PivotStrip label="S1 Target" value={pivots?.s1} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S2 Target" value={pivots?.s2} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S3 Target" value={pivots?.s3} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S4 Breakdown" value={pivots?.s4} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S5 Super Low" value={pivots?.s5} current={stockData?.currentPrice} type="sup" />
                    </div>
                </CardContent>
             </Card>
          </div>

          {/* COLUMN 2: GANN HUB (6/12) */}
          <div className="lg:col-span-6 flex flex-col gap-4 overflow-hidden">
             <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 shadow-xl bg-card">
                <CardHeader className="py-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                        <Target className="h-3 w-3 text-primary" /> Gann Intelligence Hub
                    </Target>
                  </div>
                  <div className="flex items-center gap-4 w-48 shrink-0">
                    <Slider
                      value={[gannLevelCount]}
                      onValueChange={(val) => setGannLevelCount(val[0])}
                      min={5} max={19} step={2}
                      className="cursor-pointer"
                    />
                    <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{gannLevelCount} Rows</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
                    <Tabs defaultValue="dynamic" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="w-full rounded-none h-8 border-b bg-background p-0">
                            <TabsTrigger value="dynamic" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border-r">Dynamic Range (LTP Matrix)</TabsTrigger>
                            <TabsTrigger value="fixed" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Static Points (Angle Set)</TabsTrigger>
                        </TabsList>
                        <TabsContent value="dynamic" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                        <TableRow className="h-8">
                                            <TableHead className="w-[60px] text-[9px] font-black uppercase py-0 pl-4 border-r">Root</TableHead>
                                            {Array.from({ length: 9 }).map((_, i) => (
                                                <TableHead key={i} className="text-right text-[9px] font-black uppercase py-0">T{i}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dynamicGann.map((row) => (
                                            <TableRow key={row.base} className="h-9 hover:bg-muted/20 transition-colors">
                                                <TableCell className="font-black bg-muted/5 text-[10px] py-0 pl-4 border-r">{row.base}</TableCell>
                                                {row.levels.map((level: any, index: number) => (
                                                    <TableCell 
                                                        key={index} 
                                                        className={cn(
                                                            "text-right font-mono text-[10px] py-0 transition-all",
                                                            level.isNear ? "bg-primary/20 text-primary font-black scale-105 shadow-inner" : "font-bold",
                                                            !level.isNear && level.isAbove ? "text-success/70" : !level.isNear ? "text-destructive/70" : ""
                                                        )}
                                                    >
                                                        <span className="relative">
                                                            ₹{level.value.toFixed(1)}
                                                            {level.isNear && <span className="absolute -top-1.5 -right-1.5 h-1 w-1 bg-primary rounded-full animate-ping" />}
                                                        </span>
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                        </TabsContent>
                        <TabsContent value="fixed" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                    <TableRow className="h-8">
                                        <TableHead className="text-[9px] font-black uppercase py-0 pl-4">Degree</TableHead>
                                        <TableHead className="text-right text-[9px] font-black uppercase py-0">Value (INR)</TableHead>
                                        <TableHead className="text-right text-[9px] font-black uppercase py-0">Angle</TableHead>
                                        <TableHead className="text-right text-[9px] font-black uppercase py-0 pr-4">Type</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fixedGann.map((l, i) => {
                                        const isCardinal = l.angle % 90 === 0;
                                        return (
                                            <TableRow key={i} className={cn("h-9 transition-colors", l.levelNumber === 10 ? "bg-primary/15" : "", l.isNear ? "bg-amber-500/10" : "")}>
                                                <TableCell className="font-bold text-[10px] py-0 pl-4">{l.levelNumber} L</TableCell>
                                                <TableCell className={cn("text-right font-mono text-[10px] font-black py-0", l.isNear ? "text-primary scale-105" : "")}>₹{l.value.toFixed(1)}</TableCell>
                                                <TableCell className="text-right text-[9px] text-muted-foreground font-bold py-0">{l.angle}°</TableCell>
                                                <TableCell className="text-right py-0 pr-4">
                                                    <span className={cn("text-[8px] font-black uppercase px-1.5 py-0.5 rounded border", isCardinal ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" : "bg-muted text-muted-foreground border-transparent")}>
                                                        {isCardinal ? "Cardinal" : "Ordinal"}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </CardContent>
             </Card>
          </div>

          {/* COLUMN 3: STRATEGY & HUB (4/12) */}
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden">
             
             {/* RETRACEMENT MINI CARD */}
             <Card className="h-1/2 overflow-hidden flex flex-col border-primary/10 shadow-xl bg-card">
                <CardHeader className="py-2 border-b bg-muted/30">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <Shield className="h-3 w-3 text-primary" /> Mathematical Retracements
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                    <Tabs defaultValue="gann" className="h-full flex flex-col overflow-hidden">
                        <TabsList className="w-full rounded-none h-8 border-b bg-background p-0">
                            <TabsTrigger value="gann" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted border-r">Gann Factors</TabsTrigger>
                            <TabsTrigger value="fib" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted">Fibonacci Sequence</TabsTrigger>
                        </TabsList>
                        <TabsContent value="gann" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <RetracementMiniTable data={retracements.gann} current={stockData?.currentPrice} />
                        </TabsContent>
                        <TabsContent value="fib" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <RetracementMiniTable data={retracements.fib} current={stockData?.currentPrice} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
             </Card>

             {/* THESIS MINI CARD */}
             <Card className="h-1/2 overflow-hidden flex flex-col border-primary/10 shadow-xl bg-card">
                <CardHeader className="py-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <FileText className="h-3 w-3 text-primary" /> Active Strategy Thesis
                  </CardTitle>
                  {!isEditingNote && trade && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-primary/10 transition-colors" onClick={() => setIsEditingNote(true)}>
                      <Edit3 className="h-3 w-3 text-primary" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-3 flex-1 flex flex-col overflow-hidden relative group">
                    <Quote className="absolute top-1 right-2 h-10 w-10 text-primary/5 -z-0 transition-transform group-hover:scale-110" />
                    {isEditingNote ? (
                        <div className="space-y-2 flex-1 flex flex-col z-10">
                            <Textarea value={localNote} onChange={(e) => setLocalNote(e.target.value)} className="flex-1 text-xs resize-none bg-muted/20 border-primary/20" placeholder="Describe the entry setup and thesis..." />
                            <div className="flex gap-2 justify-end shrink-0">
                                <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setIsEditingNote(false)}>Discard</Button>
                                <Button size="sm" className="h-7 text-[10px] font-black" onClick={handleSaveNote}>Sync Symbols</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar z-10 pr-2">
                            <p className="text-[11px] leading-relaxed italic text-muted-foreground/80 whitespace-pre-wrap font-medium">
                                {localNote ? `"${localNote}"` : "No technical thesis recorded for this symbol."}
                            </p>
                        </div>
                    )}
                </CardContent>
             </Card>

          </div>

        </div>
      </main>
    </AppLayout>
  );
}

function MetricBadge({ label, value, color }: { label: string, value?: number, color: 'primary'|'muted'|'destructive' }) {
    return (
        <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1">{label}</span>
            <span className={cn(
                "font-mono text-sm font-black tracking-tight",
                color === 'primary' ? "text-primary" : color === 'muted' ? "text-muted-foreground" : "text-destructive"
            )}>₹<AnimatedCounter value={value} /></span>
        </div>
    );
}

function PivotStrip({ label, value, current, type }: { label: string, value?: number, current?: number, type: 'res'|'sup' }) {
    if (!value || !current) return null;
    const isAtLevel = Math.abs(current - value) / value < 0.003;
    const diffPercent = ((current - value) / value) * 100;
    const isAbove = current > value;
    
    return (
        <div className={cn(
            "group relative flex flex-col border-b last:border-0 transition-all",
            isAtLevel ? "bg-primary/5 py-1" : "hover:bg-muted/30 py-1.5"
        )}>
            <div className="flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "h-1.5 w-1.5 rounded-full", 
                        type === 'res' ? "bg-success" : "bg-destructive",
                        isAtLevel && "animate-ping"
                    )} />
                    <span className={cn(
                        "text-[9px] font-black uppercase tracking-tight", 
                        isAtLevel ? "text-primary" : "text-muted-foreground"
                    )}>{label}</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className={cn(
                            "text-[8px] font-bold uppercase",
                            isAbove ? "text-success" : "text-destructive"
                        )}>
                           {isAbove ? <ArrowUpRight className="inline h-2 w-2 mr-0.5" /> : <ArrowDownRight className="inline h-2 w-2 mr-0.5" />}
                           {Math.abs(diffPercent).toFixed(1)}%
                        </span>
                        <span className="font-mono text-[11px] font-black leading-none">₹{value.toFixed(1)}</span>
                    </div>
                </div>
            </div>
            
            <div className="mt-1.5 px-3">
                <div className="h-0.5 w-full bg-muted overflow-hidden rounded-full">
                    {isAtLevel ? (
                        <div className="h-full bg-primary w-full animate-pulse" />
                    ) : (
                        <div 
                            className={cn("h-full transition-all duration-1000", isAbove ? "bg-success/40" : "bg-destructive/40")}
                            style={{ width: `${Math.max(5, 100 - Math.min(Math.abs(diffPercent) * 10, 100))}%` }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function RetracementMiniTable({ data, current }: { data: any[], current?: number }) {
    return (
        <Table>
            <TableBody>
                {data.map((item, i) => {
                    const isNear = current ? Math.abs(item.value - current) / current < 0.005 : false;
                    return (
                        <TableRow key={i} className={cn("h-9 transition-colors", item.ratio === "50.0%" ? "bg-amber-500/5" : "", isNear ? "bg-primary/10" : "")}>
                            <TableCell className="text-[10px] font-black py-0 pl-4 flex items-center gap-2">
                                <span className={cn("h-1 w-1 rounded-full", item.ratio === "50.0%" ? "bg-amber-500" : "bg-muted-foreground/30")} />
                                {item.ratio}
                            </TableCell>
                            <TableCell className={cn(
                                "text-right font-mono text-[10px] font-black py-0 pr-4",
                                isNear ? "text-primary scale-105" : "text-muted-foreground"
                            )}>
                                ₹{item.value.toFixed(1)}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
