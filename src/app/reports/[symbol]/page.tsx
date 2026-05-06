
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
import { AlertCircle, TrendingUp, Target, Shield, Info, FileText, Quote, Edit3, Save, X, Gauge, Layers, MoveHorizontal, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function StockReportPage() {
  const { symbol } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [stockData, setStockData] = useState<any>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [gannLevelCount, setGannLevelCount] = useState(9); 

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

  const fixedGann = useMemo(() => {
    const price = stockData?.previousClose || 0;
    if (!price) return [];
    const root = Math.sqrt(price);
    const stepValue = 0.25;
    const levels = [];
    const k = (gannLevelCount - 1) / 2;
    for (let n = -k; n <= k; n++) {
      levels.push({
        levelNumber: n + 10,
        value: n === 0 ? price : Math.pow(root + (stepValue * n), 2),
        angle: n * 45,
        n
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
            levels.push(Math.pow(rowBase + (i * 0.125), 2));
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

  const pivots = useMemo(() => {
    const h = stockData?.high || 0;
    const l = stockData?.low || 0;
    const c = stockData?.currentPrice || 0;
    if (!h || !l || !c) return null;
    const p = (h + l + c) / 3;
    return {
      p,
      r1: (p * 2) - l, r2: p + (h - l), r3: h + 2 * (p - l), r4: (h + 2 * (p - l)) + (h - l),
      s1: (p * 2) - h, s2: p - (h - l), s3: l - 2 * (h - p), s4: (l - 2 * (h - p)) - (h - l)
    };
  }, [stockData]);

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
        
        {/* HEADER BAR (DENSE) */}
        <header className="flex items-center justify-between bg-card border-2 px-4 py-2 rounded-xl shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-headline font-black text-primary uppercase tracking-tighter">{symbol}</h1>
            <div className="h-8 w-px bg-border" />
            <MetricBadge label="LTP" value={stockData?.currentPrice} color="primary" />
            <MetricBadge label="PREV" value={stockData?.previousClose} color="muted" />
            <MetricBadge label="SL" value={trade?.stopLoss} color="destructive" />
          </div>
          <div className="flex items-center gap-2">
            {stopLossHit && (
              <Badge variant="destructive" className="animate-pulse py-1 px-3 uppercase text-[10px] font-black">
                <AlertCircle className="h-3 w-3 mr-1" /> Stop-Loss Triggered
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] uppercase font-bold bg-background">
              Terminal Active
            </Badge>
          </div>
        </header>

        {/* TRIPLE COLUMN WORKSPACE */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
          
          {/* COLUMN 1: PIVOT FEED (2/12) */}
          <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
             <Card className="flex-1 overflow-hidden flex flex-col border-primary/10">
                <CardHeader className="py-2 border-b bg-muted/30">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <Activity className="h-3 w-3 text-primary" /> Pivot Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col">
                        <PivotStrip label="R4 High" value={pivots?.r4} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R3 Resist" value={pivots?.r3} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R2 Resist" value={pivots?.r2} current={stockData?.currentPrice} type="res" />
                        <PivotStrip label="R1 Resist" value={pivots?.r1} current={stockData?.currentPrice} type="res" />
                        <div className="bg-primary/10 py-2 px-3 border-y border-primary/20 flex justify-between items-center">
                            <span className="text-[9px] font-black uppercase text-primary">Pivot Point</span>
                            <span className="font-mono text-xs font-black">₹{pivots?.p.toFixed(2)}</span>
                        </div>
                        <PivotStrip label="S1 Support" value={pivots?.s1} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S2 Support" value={pivots?.s2} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S3 Support" value={pivots?.s3} current={stockData?.currentPrice} type="sup" />
                        <PivotStrip label="S4 Low" value={pivots?.s4} current={stockData?.currentPrice} type="sup" />
                    </div>
                </CardContent>
             </Card>
          </div>

          {/* COLUMN 2: GANN CENTRAL (6/12) */}
          <div className="lg:col-span-6 flex flex-col gap-4 overflow-hidden">
             <Card className="flex-1 overflow-hidden flex flex-col border-primary/10">
                <CardHeader className="py-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                        <Target className="h-3 w-3 text-primary" /> Gann Hub
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-4 w-48 shrink-0">
                    <Slider
                      value={[gannLevelCount]}
                      onValueChange={(val) => setGannLevelCount(val[0])}
                      min={5} max={19} step={2}
                      className="cursor-pointer"
                    />
                    <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">{gannLevelCount}L</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
                    <Tabs defaultValue="dynamic" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="w-full rounded-none h-8 border-b bg-background p-0">
                            <TabsTrigger value="dynamic" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted">Dynamic (LTP Grid)</TabsTrigger>
                            <TabsTrigger value="fixed" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted">Fixed (Prev Close)</TabsTrigger>
                        </TabsList>
                        <TabsContent value="dynamic" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                             <div className="p-0">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                        <TableRow className="h-8">
                                            <TableHead className="w-[60px] text-[9px] font-black uppercase py-0 pl-4">Base</TableHead>
                                            {Array.from({ length: 9 }).map((_, i) => (
                                                <TableHead key={i} className="text-right text-[9px] font-black uppercase py-0">T{i}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dynamicGann.map((row) => (
                                            <TableRow key={row.base} className="h-8 hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-black bg-muted/10 text-[10px] py-0 pl-4">{row.base}</TableCell>
                                                {row.levels.map((level: number, index: number) => (
                                                    <TableCell key={index} className={cn("text-right font-mono text-[10px] font-bold py-0", index % 2 === 0 ? "text-primary" : "text-muted-foreground")}>
                                                        ₹{level.toFixed(1)}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                             </div>
                        </TabsContent>
                        <TabsContent value="fixed" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                    <TableRow className="h-8">
                                        <TableHead className="text-[9px] font-black uppercase py-0 pl-4">Level</TableHead>
                                        <TableHead className="text-right text-[9px] font-black uppercase py-0">Value (INR)</TableHead>
                                        <TableHead className="text-right text-[9px] font-black uppercase py-0 pr-4">Angle</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fixedGann.map((l, i) => (
                                        <TableRow key={i} className={cn("h-8 transition-colors", l.levelNumber === 10 ? "bg-primary/20" : "")}>
                                            <TableCell className="font-bold text-[10px] py-0 pl-4">{l.levelNumber}</TableCell>
                                            <TableCell className="text-right font-mono text-[10px] font-black py-0">₹{l.value.toFixed(1)}</TableCell>
                                            <TableCell className="text-right text-[9px] text-muted-foreground font-bold py-0 pr-4">{l.angle}°</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </CardContent>
             </Card>
          </div>

          {/* COLUMN 3: STRATEGY & NOTES (4/12) */}
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-hidden">
             
             {/* THESIS MINI CARD */}
             <Card className="h-1/2 overflow-hidden flex flex-col border-primary/10">
                <CardHeader className="py-2 border-b bg-muted/30 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <FileText className="h-3 w-3 text-primary" /> Trade Thesis
                  </CardTitle>
                  {!isEditingNote && trade && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingNote(true)}>
                      <Edit3 className="h-3 w-3" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-3 flex-1 flex flex-col overflow-hidden relative">
                    <Quote className="absolute top-1 right-2 h-8 w-8 text-primary/5 -z-0" />
                    {isEditingNote ? (
                        <div className="space-y-2 flex-1 flex flex-col z-10">
                            <Textarea value={localNote} onChange={(e) => setLocalNote(e.target.value)} className="flex-1 text-xs resize-none" />
                            <div className="flex gap-2 justify-end shrink-0">
                                <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setIsEditingNote(false)}>Cancel</Button>
                                <Button size="sm" className="h-7 text-[10px] font-black" onClick={handleSaveNote}>Save Thesis</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar z-10">
                            <p className="text-[11px] leading-relaxed italic text-muted-foreground whitespace-pre-wrap">
                                {localNote ? `"${localNote}"` : "No thesis recorded."}
                            </p>
                        </div>
                    )}
                </CardContent>
             </Card>

             {/* RETRACEMENT MINI CARD */}
             <Card className="h-1/2 overflow-hidden flex flex-col border-primary/10">
                <CardHeader className="py-2 border-b bg-muted/30">
                  <CardTitle className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <Shield className="h-3 w-3 text-primary" /> Retracement
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                    <Tabs defaultValue="gann" className="h-full flex flex-col overflow-hidden">
                        <TabsList className="w-full rounded-none h-8 border-b bg-background p-0">
                            <TabsTrigger value="gann" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted">Gann Ratio</TabsTrigger>
                            <TabsTrigger value="fib" className="flex-1 text-[9px] font-black uppercase rounded-none data-[state=active]:bg-muted">Fibonacci</TabsTrigger>
                        </TabsList>
                        <TabsContent value="gann" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <RetracementMiniTable data={retracements.gann} />
                        </TabsContent>
                        <TabsContent value="fib" className="flex-1 mt-0 overflow-y-auto custom-scrollbar">
                            <RetracementMiniTable data={retracements.fib} />
                        </TabsContent>
                    </Tabs>
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
            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">{label}</span>
            <span className={cn(
                "font-mono text-sm font-black",
                color === 'primary' ? 'text-primary' : color === 'muted' ? 'text-muted-foreground' : 'text-destructive'
            )}>₹<AnimatedCounter value={value} /></span>
        </div>
    );
}

function PivotStrip({ label, value, current, type }: { label: string, value?: number, current?: number, type: 'res'|'sup' }) {
    if (!value || !current) return null;
    const isAtLevel = Math.abs(current - value) / value < 0.003;
    
    return (
        <div className={cn(
            "flex items-center justify-between px-3 py-2 border-b last:border-0 transition-all",
            isAtLevel ? "bg-primary text-primary-foreground scale-x-[1.02] z-10 shadow-md border-y-2 border-primary" : "hover:bg-muted/50"
        )}>
            <div className="flex items-center gap-2">
                <div className={cn("h-1.5 w-1.5 rounded-full", type === 'res' ? "bg-success" : "bg-destructive")} />
                <span className={cn("text-[9px] font-bold uppercase", isAtLevel ? "text-primary-foreground" : "text-muted-foreground")}>{label}</span>
            </div>
            <span className="font-mono text-[11px] font-black">₹{value.toFixed(1)}</span>
        </div>
    );
}

function RetracementMiniTable({ data }: { data: any[] }) {
    return (
        <Table>
            <TableBody>
                {data.map((item, i) => (
                    <TableRow key={i} className={cn("h-8", item.ratio === "50.0%" ? "bg-amber-500/10 font-black" : "")}>
                        <TableCell className="text-[10px] font-bold py-0 pl-4">{item.ratio}</TableCell>
                        <TableCell className="text-right font-mono text-[10px] font-black py-0 pr-4 text-primary">₹{item.value.toFixed(1)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
