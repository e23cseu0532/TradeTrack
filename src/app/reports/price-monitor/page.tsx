"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Bell, Trash2, TrendingUp, TrendingDown, RefreshCw, PlusCircle, BookOpen, Quote, FileText, ChevronRight, Loader2, Grid3X3, Zap } from "lucide-react";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, serverTimestamp, query, where } from "firebase/firestore";
import { addDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { stockList } from "@/lib/stock-list";
import AnimatedCounter from "@/components/AnimatedCounter";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockRecord } from "@/app/types/trade";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PriceTrigger {
  id: string;
  stockSymbol: string;
  targetPrice: number;
  createdAt: any;
}

export default function PriceMonitorPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [newSymbol, setNewSymbol] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [preAddPrice, setPreAddPrice] = useState<number | null>(null);
  const [isPreAddLoading, setIsPreAddLoading] = useState(false);
  const [stockPrices, setStockPrices] = useState<{ [symbol: string]: number }>({});
  const [isPricesLoading, setIsPricesLoading] = useState(false);
  
  // 1. Fetch Trigger Records
  const triggersCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/priceTriggers`);
  }, [user, firestore]);
  const { data: triggers, isLoading: isTriggersLoading } = useCollection<PriceTrigger>(triggersCollection);

  // 2. Fetch User's Main Stock Records (for synced notes)
  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  const { data: allTrades } = useCollection<StockRecord>(stockRecordsCollection);

  // 3. Stock Notes Logic (Symbol Synced)
  const [selectedNoteSymbol, setSelectedNoteSymbol] = useState<string | null>(null);
  const [localTradeNote, setLocalTradeNote] = useState("");

  const uniqueSymbolsInMonitor = useMemo(() => {
    if (!triggers) return [];
    return Array.from(new Set(triggers.map(t => t.stockSymbol))).sort();
  }, [triggers]);

  useEffect(() => {
    if (selectedNoteSymbol && allTrades) {
      const latestEntry = allTrades
        .filter(t => t.stockSymbol === selectedNoteSymbol)
        .sort((a, b) => (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0))[0];
      setLocalTradeNote(latestEntry?.notes || "");
    }
  }, [selectedNoteSymbol, allTrades]);

  const handleSaveNote = () => {
    if (!user || !firestore || !selectedNoteSymbol || !allTrades) return;
    const tradesToUpdate = allTrades.filter(t => t.stockSymbol === selectedNoteSymbol);
    tradesToUpdate.forEach(t => {
        const tradeRef = doc(firestore, `users/${user.uid}/stockRecords`, t.id);
        updateDocumentNonBlocking(tradeRef, { notes: localTradeNote });
    });
    toast({ title: "Thesis Synced", description: `Notes for ${selectedNoteSymbol} updated everywhere.` });
  };

  // 4. Fetch Live Price for "New Item" Selection
  useEffect(() => {
    if (!newSymbol) {
      setPreAddPrice(null);
      return;
    }

    const fetchPreAddPrice = async () => {
      setIsPreAddLoading(true);
      try {
        const res = await fetch(`/api/yahoo-finance?symbol=${newSymbol}`);
        const data = await res.json();
        if (data && data.currentPrice) {
          setPreAddPrice(data.currentPrice);
        }
      } catch (err) {
        console.error("Failed to fetch pre-add price", err);
      } finally {
        setIsPreAddLoading(false);
      }
    }
    fetchPreAddPrice();
  }, [newSymbol]);

  // 5. Price Fetching Logic for existing triggers
  const fetchPrices = useCallback(async () => {
    if (!triggers || triggers.length === 0) return;
    setIsPricesLoading(true);
    const uniqueSymbols = Array.from(new Set(triggers.map(t => t.stockSymbol)));
    
    try {
      const fetches = uniqueSymbols.map(sym => 
        fetch(`/api/yahoo-finance?symbol=${sym}`).then(r => r.json())
      );
      const results = await Promise.all(fetches);
      const newPrices: { [symbol: string]: number } = {};
      results.forEach((res, i) => {
        if (res && res.currentPrice) {
          newPrices[uniqueSymbols[i]] = res.currentPrice;
        }
      });
      setStockPrices(newPrices);
    } catch (err) {
      console.error("Failed to fetch monitor prices", err);
    } finally {
      setIsPricesLoading(false);
    }
  }, [triggers]);

  useEffect(() => {
    if (triggers && triggers.length > 0) {
      fetchPrices();
    }
  }, [triggers, fetchPrices]);

  const handleAddTrigger = () => {
    if (!triggersCollection || !newSymbol || !newPrice) return;
    const triggerData = {
      stockSymbol: newSymbol,
      targetPrice: parseFloat(newPrice),
      createdAt: serverTimestamp(),
    };
    addDocumentNonBlocking(triggersCollection, triggerData);
    setNewSymbol("");
    setNewPrice("");
    setPreAddPrice(null);
  };

  const handleDeleteTrigger = (id: string) => {
    if (!triggersCollection) return;
    const docRef = doc(triggersCollection, id);
    deleteDocumentNonBlocking(docRef);
  };

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
        <header className="animate-fade-in-down">
          <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tight flex items-center gap-3">
            <Bell className="h-10 w-10" />
            Price Trigger Monitor
          </h1>
          <p className="text-muted-foreground font-medium">Track stocks against custom price targets. Automatically indicates when a stock is above your set price.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: ADD & NOTES */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-2 border-primary/10 shadow-xl overflow-hidden">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  New Monitor Item
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground">Select Stock</label>
                  <Combobox 
                    options={stockList} 
                    value={newSymbol} 
                    onChange={setNewSymbol} 
                    placeholder="Search Symbol..."
                  />
                  {newSymbol && (
                    <div className="flex justify-between items-center px-1 bg-muted/20 p-2 rounded-md border border-dashed animate-in fade-in slide-in-from-top-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                          {isPreAddLoading && <Loader2 className="h-2 w-2 animate-spin" />}
                          Live Price:
                        </span>
                        <span className="text-[10px] font-mono font-black text-primary">
                            {isPreAddLoading ? "---" : preAddPrice ? `₹${preAddPrice.toFixed(2)}` : "Price Error"}
                        </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground">Target Price (INR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                    <Input 
                      type="number" 
                      placeholder="e.g. 2500" 
                      className="pl-7"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={handleAddTrigger} disabled={!newSymbol || !newPrice || isPreAddLoading} className="w-full font-bold uppercase tracking-tighter">
                  Add to Monitor
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-primary/5">
              <CardHeader className="bg-muted/10 border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-headline">
                  < BookOpen className="text-primary h-5 w-5" />
                  Monitor Thesis
                </CardTitle>
                <CardDescription className="text-xs">Notes are shared across all monitor items and trade entries.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Active Monitor Stocks
                    <ChevronRight className="h-3 w-3" />
                  </label>
                  <Select value={selectedNoteSymbol || ""} onValueChange={setSelectedNoteSymbol}>
                    <SelectTrigger className="bg-muted/20 border-primary/10">
                      <SelectValue placeholder="Select symbol to edit note..." />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueSymbolsInMonitor.map(sym => (
                        <SelectItem key={sym} value={sym}>{sym}</SelectItem>
                      ))}
                      {uniqueSymbolsInMonitor.length === 0 && <p className="p-2 text-xs text-muted-foreground">No stocks being monitored.</p>}
                    </SelectContent>
                  </Select>
                </div>

                {selectedNoteSymbol ? (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 relative">
                    <Quote className="absolute top-0 right-0 h-10 w-10 text-primary/5" />
                    <Textarea
                      placeholder={`Enter shared thesis for ${selectedNoteSymbol}...`}
                      className="h-32 text-sm resize-none bg-muted/20 border-primary/10 relative z-10"
                      value={localTradeNote}
                      onChange={(e) => setLocalTradeNote(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="secondary" onClick={handleSaveNote} className="font-bold">
                        Save & Sync Note
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/5 opacity-50">
                    <p className="text-xs text-muted-foreground italic">Select a monitored stock to manage notes.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: TRIGGER TABLE & HEATMAP */}
          <div className="lg:col-span-8 space-y-8">
            <Card className="border-2 shadow-2xl overflow-hidden">
              <CardHeader className="bg-muted/30 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-headline flex items-center gap-2">
                    <TrendingUp className="text-success h-5 w-5" />
                    Price Analysis Report
                  </CardTitle>
                  <CardDescription>Live tracking against your manually added targets.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchPrices} disabled={isPricesLoading}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", isPricesLoading && "animate-spin")} />
                  Refresh Prices
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="h-10">
                      <TableHead className="pl-6 text-[10px] font-black uppercase">Stock</TableHead>
                      <TableHead className="text-right text-[10px] font-black uppercase">Your Target</TableHead>
                      <TableHead className="text-right text-[10px] font-black uppercase">Current Price</TableHead>
                      <TableHead className="text-center text-[10px] font-black uppercase">Status</TableHead>
                      <TableHead className="text-right pr-6 text-[10px] font-black uppercase">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTriggersLoading ? (
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell className="pl-6"><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto" /></TableCell>
                          <TableCell className="text-right pr-6"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : triggers?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-64 text-center text-muted-foreground italic">
                          <Bell className="h-10 w-10 mx-auto opacity-20 mb-2" />
                          No stocks added to monitor. Add one on the left to begin.
                        </TableCell>
                      </TableRow>
                    ) : (
                      triggers?.map((t) => {
                        const current = stockPrices[t.stockSymbol];
                        const isAbove = current >= t.targetPrice;
                        return (
                          <TableRow key={t.id} className={cn("h-16 group transition-colors", isAbove ? "bg-success/5 hover:bg-success/10" : "hover:bg-muted/50")}>
                            <TableCell className="pl-6">
                              <Badge variant="secondary" className="font-bold font-mono">{t.stockSymbol}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-muted-foreground">
                              ₹<AnimatedCounter value={t.targetPrice} />
                            </TableCell>
                            <TableCell className={cn("text-right font-mono font-black", isAbove ? "text-success" : "text-primary")}>
                              {current ? `₹` : ""}<AnimatedCounter value={current} />
                            </TableCell>
                            <TableCell className="text-center">
                              {current ? (
                                <Badge variant={isAbove ? "success" : "outline"} className="uppercase tracking-widest text-[9px] py-1">
                                  {isAbove ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                                  {isAbove ? "Above Target" : "Below Target"}
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground animate-pulse">Syncing...</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteTrigger(t.id)}
                                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* HEATMAP SECTION */}
            <Card className="border-2 shadow-lg border-primary/5 overflow-hidden">
                <CardHeader className="bg-muted/20 border-b">
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                        <Grid3X3 className="h-5 w-5 text-primary" />
                        Target Heatmap Grid
                    </CardTitle>
                    <CardDescription className="text-xs">Quick visual stance relative to your set target prices.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                        {triggers && triggers.length > 0 ? (
                            triggers.map((t) => {
                                const current = stockPrices[t.stockSymbol];
                                const diffPercent = current ? ((current - t.targetPrice) / t.targetPrice) * 100 : null;
                                
                                // Color logic
                                // Green: At or Above target (>= 0%)
                                // Amber: Approaching target (between -2% and 0%)
                                // Muted: Far below target (< -2%)
                                const isAbove = diffPercent !== null && diffPercent >= 0;
                                const isApproaching = diffPercent !== null && diffPercent >= -2 && diffPercent < 0;

                                return (
                                    <div 
                                        key={t.id}
                                        className={cn(
                                            "w-24 h-24 rounded-2xl flex flex-col items-center justify-center text-center p-2 transition-all duration-500 shadow-md group relative cursor-help",
                                            isAbove ? "bg-success text-success-foreground scale-105 shadow-success/20 ring-4 ring-success/10" : 
                                            isApproaching ? "bg-amber-500 text-white animate-pulse" : "bg-muted border border-primary/5 text-muted-foreground opacity-60"
                                        )}
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-tight mb-1">{t.stockSymbol}</p>
                                        <p className="text-xs font-mono font-bold leading-none">
                                            {diffPercent !== null ? `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%` : "---"}
                                        </p>
                                        <div className="mt-2">
                                            {isAbove ? <Zap className="h-3 w-3 fill-current" /> : (isApproaching ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3 opacity-20" />)}
                                        </div>
                                        
                                        {/* Simple Hover Overlay */}
                                        <div className="absolute inset-0 rounded-2xl bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1 overflow-hidden pointer-events-none">
                                            <p className="text-[8px] font-black uppercase text-white leading-tight">
                                                Target: ₹{t.targetPrice}<br/>
                                                LTP: ₹{current?.toFixed(1)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="w-full h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-xl opacity-20">
                                <Grid3X3 className="h-8 w-8 mb-2" />
                                <p className="text-xs font-black uppercase tracking-widest">Grid Inactive</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t pt-4">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-success" />
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Target Hit</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-amber-500" />
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Alert (Within 2%)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-muted" />
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">In Progress</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
