
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
import { AlertCircle, TrendingUp, Target, Shield, Info, FileText, Quote, Edit3, Save, X, Gauge, Layers } from "lucide-react";
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

export default function StockReportPage() {
  const { symbol } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [stockData, setStockData] = useState<any>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [gannLevelCount, setGannLevelCount] = useState(7); // Default to 7 levels

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
    toast({
      title: "Stock Thesis Synced",
      description: `Your thoughts for ${symbol} have been updated across all records.`,
    });
  };

  // 1. FIXED GANN SQUARE OF NINE (Calculator Logic with Dynamic Level Count)
  const fixedGann = useMemo(() => {
    const price = stockData?.previousClose || 0;
    if (!price) return [];
    const root = Math.sqrt(price);
    const stepValue = 0.25;
    const levels = [];
    
    // Calculate range based on odd levelCount
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

  // 2. DYNAMIC GANN SQUARE OF NINE (Grid Logic)
  const dynamicGann = useMemo(() => {
    const price = stockData?.currentPrice || 0;
    if (price <= 0) return [];

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
        {/* DASHBOARD HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card border-2 p-6 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Gauge className="h-24 w-24" />
          </div>
          <div className="z-10">
            <h1 className="text-5xl font-headline font-black text-primary uppercase tracking-tighter">
              {symbol}
            </h1>
            <p className="text-muted-foreground font-medium">Detailed Analysis Dashboard</p>
          </div>
          
          <div className="flex flex-wrap gap-4 z-10">
            <div className="flex items-center gap-4 bg-muted/30 px-6 py-3 rounded-xl border border-primary/5">
                <div className="text-center px-4 border-r">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">LTP</p>
                    <p className="text-2xl font-mono font-black text-primary">
                        ₹<AnimatedCounter value={stockData?.currentPrice} />
                    </p>
                </div>
                <div className="text-center px-4 border-r">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Prev Close</p>
                    <p className="text-2xl font-mono font-bold text-muted-foreground">
                        ₹<AnimatedCounter value={stockData?.previousClose} />
                    </p>
                </div>
                {trade && (
                   <div className="text-center px-4">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Stop Loss</p>
                      <p className="text-2xl font-mono font-bold text-destructive">
                          ₹{trade.stopLoss}
                      </p>
                  </div>
                )}
            </div>
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

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: GANN AND PIVOTS */}
          <div className="xl:col-span-8 space-y-8">
            
            {/* GANN LEVELS TABLE */}
            <Card className="shadow-lg border-primary/10 overflow-hidden">
                <CardHeader className="border-b bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-4 py-4">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-headline flex items-center gap-2">
                        <Target className="text-primary h-5 w-5" />
                        Gann Square of Nine
                    </CardTitle>
                    <CardDescription>Support and resistance levels based on Gann math.</CardDescription>
                  </div>
                  
                  {/* GANN LEVEL COUNT SLIDER - ONLY FOR FIXED TAB */}
                  <div className="w-full md:w-48 space-y-2 px-2">
                    <div className="flex justify-between items-center mb-1">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                            <Layers className="h-3 w-3" /> Level Range
                        </Label>
                        <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded">{gannLevelCount} Levels</span>
                    </div>
                    <Slider
                      value={[gannLevelCount]}
                      onValueChange={(val) => setGannLevelCount(val[0])}
                      min={3}
                      max={19}
                      step={2}
                      className="cursor-pointer"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                <Tabs defaultValue="fixed">
                    <TabsList className="w-full rounded-none h-12 border-b">
                    <TabsTrigger value="fixed" className="flex-1 font-bold uppercase text-[10px] tracking-widest">Fixed (Prev Close)</TabsTrigger>
                    <TabsTrigger value="dynamic" className="flex-1 font-bold uppercase text-[10px] tracking-widest">Dynamic (LTP Grid)</TabsTrigger>
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

            {/* PIVOT LEVELS TABLE */}
            <Card className="shadow-lg border-primary/5 overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-headline flex items-center gap-2">
                                <TrendingUp className="text-primary h-5 w-5" />
                                Pivot Points (S/R)
                            </CardTitle>
                            <CardDescription>Standard floor pivot formulas for immediate boundaries.</CardDescription>
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
                                        <h4 className="font-bold border-b pb-1 text-xs">Standard Floor Pivot Formulas</h4>
                                        <div className="font-mono text-[10px] space-y-1">
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
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-2 tracking-widest">Central Pivot Point</span>
                            <p className="text-5xl font-mono font-black text-primary">₹<AnimatedCounter value={pivots?.p} /></p>
                            <p className="text-[10px] text-muted-foreground mt-4 italic font-medium uppercase tracking-tighter">Market Equilibrium Zone</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: THESIS AND RETRACEMENT */}
          <div className="xl:col-span-4 space-y-8">
            
            {/* TRADE THESIS SECTION */}
            <Card className="shadow-lg border-primary/10 overflow-hidden sticky top-8">
                <CardHeader className="bg-muted/30 border-b pb-4">
                    <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-headline flex items-center gap-2">
                            <FileText className="text-primary h-5 w-5" />
                            Trade Thesis
                        </CardTitle>
                        <CardDescription className="text-xs">Notes are synced across all {symbol} entries.</CardDescription>
                    </div>
                    {!isEditingNote && trade && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingNote(true)}>
                        <Edit3 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
                    </div>
                </CardHeader>
                <CardContent className="pt-6 relative min-h-[180px]">
                    <Quote className="absolute top-2 right-4 h-12 w-12 text-primary/5 -z-0" />
                    
                    {isEditingNote ? (
                    <div className="space-y-4 relative z-10">
                        <Textarea 
                        value={localNote} 
                        onChange={(e) => setLocalNote(e.target.value)}
                        placeholder="Enter your trade thesis..."
                        className="min-h-[140px] resize-none text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsEditingNote(false)}>
                            <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveNote} className="font-bold">
                            <Save className="h-3 w-3 mr-1" /> Save
                        </Button>
                        </div>
                    </div>
                    ) : (
                    <div className="relative z-10">
                        {localNote ? (
                            <p className="text-sm leading-relaxed italic text-muted-foreground whitespace-pre-wrap">
                                "{localNote}"
                            </p>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-40 opacity-50 space-y-2">
                                <FileText className="h-8 w-8 text-muted-foreground" />
                                <p className="text-xs italic">No thesis recorded.</p>
                                <Button variant="link" size="sm" onClick={() => setIsEditingNote(true)}>
                                    Start writing
                                </Button>
                            </div>
                        )}
                        {trade && (
                            <div className="mt-6 pt-4 border-t border-dashed flex justify-between items-center">
                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Original Entry</span>
                                <Badge variant="outline" className="text-[9px] font-mono">{trade.dateTime?.toDate().toLocaleDateString('en-GB')}</Badge>
                            </div>
                        )}
                    </div>
                    )}
                </CardContent>
                
                {/* RETRACEMENT TABLE INTEGRATED IN RIGHT COL */}
                <div className="border-t">
                    <CardHeader className="py-4 border-b bg-muted/10">
                        <CardTitle className="text-sm font-headline flex items-center gap-2">
                            <Shield className="text-primary h-4 w-4" />
                            Retracement Analysis
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Tabs defaultValue="gann">
                            <TabsList className="w-full rounded-none h-10 border-b">
                            <TabsTrigger value="gann" className="flex-1 text-[10px] font-bold uppercase">Gann</TabsTrigger>
                            <TabsTrigger value="fib" className="flex-1 text-[10px] font-bold uppercase">Fibonacci</TabsTrigger>
                            </TabsList>
                            <TabsContent value="gann" className="mt-0">
                                <RetracementTable data={retracements.gann} type="Gann" />
                            </TabsContent>
                            <TabsContent value="fib" className="mt-0">
                                <RetracementTable data={retracements.fib} type="Fib" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </div>
            </Card>

          </div>
        </div>
      </main>
    </AppLayout>
  );
}

function FixedGannTable({ levels }: { levels: any[] }) {
  const getRowClass = (levelNumber: number) => {
    if (levelNumber === 10) return "bg-primary/20 font-black border-y-2 border-primary/30";
    if (levelNumber === 8 || levelNumber === 12) return "bg-yellow-500/10";
    if (levelNumber % 2 === 0) return "bg-purple-500/5";
    return "";
  };

  return (
    <div className="overflow-x-auto">
        <Table>
        <TableHeader className="bg-muted/20">
            <TableRow>
            <TableHead className="text-[10px] font-black uppercase">Level</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase">Value (INR)</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase">Angle</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {levels.map((l, i) => (
            <TableRow key={i} className={cn("transition-colors h-10", getRowClass(l.levelNumber))}>
                <TableCell className="font-bold text-xs">{l.levelNumber}</TableCell>
                <TableCell className="text-right font-mono text-sm font-bold">₹<AnimatedCounter value={l.value} /></TableCell>
                <TableCell className="text-right text-[10px] text-muted-foreground font-bold">{l.angle}°</TableCell>
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
            <TableHeader className="bg-muted/20">
              <TableRow>
                <TableHead className="w-[80px] text-[10px] font-black uppercase">Base</TableHead>
                {Array.from({ length: 9 }).map((_, i) => (
                  <TableHead key={i} className="text-right text-[10px] font-black uppercase">T{i}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.base} className="h-12 hover:bg-muted/30 transition-colors">
                  <TableCell className="font-black bg-muted/20 text-xs">{row.base}</TableCell>
                  {row.levels.map((level: number, index: number) => (
                    <TableCell key={index} className={cn(
                        "text-right font-mono text-[11px] font-medium",
                        index % 2 === 0 ? "text-primary" : "text-muted-foreground"
                    )}>
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
      <TableHeader className="bg-muted/20">
        <TableRow>
          <TableHead className="text-[9px] font-black uppercase">{type} Ratio</TableHead>
          <TableHead className="text-right text-[9px] font-black uppercase">Price Level</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item, i) => (
          <TableRow key={i} className={cn("h-10", item.ratio === "50.0%" && "bg-amber-500/10 font-bold")}>
            <TableCell className="text-[10px] font-bold">{item.ratio}</TableCell>
            <TableCell className="text-right font-mono text-xs font-bold text-primary">₹<AnimatedCounter value={item.value} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LevelRow({ label, value, className }: { label: string, value?: number, className?: string }) {
    return (
        <div className="flex justify-between items-center p-3 border-2 rounded-xl bg-background shadow-sm hover:border-primary/20 transition-all">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">{label}</span>
            <span className={cn("font-mono text-xs font-bold", className)}>
                ₹<AnimatedCounter value={value} />
            </span>
        </div>
    )
}
