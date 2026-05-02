
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StockRecord } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Scaling, FileText, StickyNote, Save, Info, Target, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useFirestore, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import AnimatedCounter from "./AnimatedCounter";
import { cn } from "@/lib/utils";

type ReportsTableProps = {
  trades: StockRecord[];
  stockData: StockData;
  isLoading: boolean;
  onGetFinancials: (trade: StockRecord) => void;
};

export default function ReportsTable({ trades, stockData, isLoading, onGetFinancials }: ReportsTableProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [editingTrade, setEditingTrade] = useState<StockRecord | null>(null);
  const [localNote, setLocalNote] = useState("");

  const handleOpenNoteDialog = (trade: StockRecord) => {
    setEditingTrade(trade);
    setLocalNote(trade.notes || "");
  };

  const handleSaveNote = () => {
    if (!user || !firestore || !editingTrade) return;

    const tradesToUpdate = trades.filter(t => t.stockSymbol === editingTrade.stockSymbol);
    
    tradesToUpdate.forEach(t => {
        const tradeRef = doc(firestore, `users/${user.uid}/stockRecords`, t.id);
        updateDocumentNonBlocking(tradeRef, { notes: localNote });
    });

    setEditingTrade(null);
    toast({
      title: "Note Synced",
      description: `Thesis for ${editingTrade.stockSymbol} updated across all records.`,
    });
  };

  const renderCellContent = (symbol: string, field: 'currentPrice' | 'high' | 'low') => {
    const data = stockData[symbol];
    if (isLoading && !data) {
      return <Skeleton className="h-4 w-20" />;
    }
    if (data?.error) {
      return <span className="text-destructive text-xs">Failed</span>;
    }
    if (data?.[field] === undefined || data?.[field] === null) {
      return "-";
    }
    return <AnimatedCounter value={data[field]} />;
  }

  const formatNumber = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return "-";
    return <AnimatedCounter value={amount} />;
  };

  if (trades.length === 0 && !isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks to display. Add some stocks to see a report.
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableCaption>A list of your stock reports with technical position alerts.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Current Price</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Target 1</TableHead>
            <TableHead className="text-right text-muted-foreground">Target 2</TableHead>
            <TableHead className="text-right text-muted-foreground">Target 3</TableHead>
            <TableHead className="text-right text-muted-foreground">Positional</TableHead>
            <TableHead className="text-right">Period High</TableHead>
            <TableHead className="text-right">Period Low</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && trades.length === 0 && (
             [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-8 w-16 mx-auto" /></TableCell>
                </TableRow>
             ))
          )}
          {(!isLoading || trades.length > 0) && trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                    <TechnicalPositionPopover 
                        symbol={trade.stockSymbol} 
                        data={stockData[trade.stockSymbol]} 
                    />
                    <Badge variant="secondary" className="font-bold">
                        {trade.stockSymbol}
                    </Badge>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">{renderCellContent(trade.stockSymbol, 'currentPrice')}</TableCell>
              <TableCell className="text-right font-mono">{formatNumber(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{formatNumber(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono text-success font-semibold">{formatNumber(trade.targetPrice1)}</TableCell>
              <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.targetPrice2)}</TableCell>
              <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.targetPrice3)}</TableCell>
              <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.positionalTargetPrice)}</TableCell>
              <TableCell className="text-right font-mono text-success/80">{renderCellContent(trade.stockSymbol, 'high')}</TableCell>
              <TableCell className="text-right font-mono text-destructive/80">{renderCellContent(trade.stockSymbol, 'low')}</TableCell>
              <TableCell className="text-center">
                <TooltipProvider>
                    <div className="flex justify-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/reports/${trade.stockSymbol}`}>
                                <FileText className="h-4 w-4 text-primary" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Detailed Stock Report</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => onGetFinancials(trade)}>
                            <Sparkles className="h-4 w-4 text-amber-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Get Key Financials</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenNoteDialog(trade)}>
                            <StickyNote className="h-4 w-4 text-indigo-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Quick Note / Thesis</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" asChild>
                            <Link href={`/position-sizing?symbol=${trade.stockSymbol}`}>
                                <Scaling className="h-4 w-4 text-slate-500" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Position Sizing</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                </TooltipProvider>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    <Dialog open={!!editingTrade} onOpenChange={(open) => !open && setEditingTrade(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-headline">
            <StickyNote className="text-indigo-500 h-5 w-5" />
            Thesis: {editingTrade?.stockSymbol}
          </DialogTitle>
          <DialogDescription>
            Update your thesis. Changes apply to all entries of this stock.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea 
            value={localNote} 
            onChange={(e) => setLocalNote(e.target.value)}
            placeholder="Why are you taking this trade? Enter your thoughts here..."
            className="min-h-[120px] resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingTrade(null)}>Cancel</Button>
          <Button onClick={handleSaveNote}>
            <Save className="h-4 w-4 mr-2" />
            Save & Sync
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function TechnicalPositionPopover({ symbol, data }: { symbol: string; data?: any }) {
  const [isOpen, setIsOpen] = useState(false);

  const pivots = useMemo(() => {
    if (!data || data.error || !data.high || !data.low || !data.currentPrice) return null;
    
    // Using standard floor pivot logic with currentPrice as proxy for close if not provided
    const h = data.high;
    const l = data.low;
    const c = data.currentPrice;
    
    const p = (h + l + c) / 3;
    const r1 = (p * 2) - l;
    const s1 = (p * 2) - h;
    const r2 = p + (h - l);
    const s2 = p - (h - l);
    const r3 = h + 2 * (p - l);
    const s3 = l - 2 * (h - p);
    const r4 = r3 + (h - l);
    const s4 = s3 - (h - l);

    let zone = "Neutral";
    if (c > r4) zone = "Extreme Breakout";
    else if (c > r3) zone = "R3 ↔ R4";
    else if (c > r2) zone = "R2 ↔ R3";
    else if (c > r1) zone = "R1 ↔ R2";
    else if (c > p) zone = "Pivot ↔ R1";
    else if (c > s1) zone = "S1 ↔ Pivot";
    else if (c > s2) zone = "S2 ↔ S1";
    else if (c > s3) zone = "S3 ↔ S2";
    else if (c > s4) zone = "S4 ↔ S3";
    else zone = "Extreme Breakdown";

    return { p, r1, r2, r3, r4, s1, s2, s3, s4, zone };
  }, [data]);

  if (!pivots) return null;

  const currentPrice = data.currentPrice;
  const isBullish = currentPrice > pivots.p;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
        <div className="cursor-help flex items-center">
            <div className={cn(
                "h-2 w-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(0,0,0,0.2)]",
                isBullish ? "bg-emerald-500 shadow-emerald-500/50" : "bg-rose-500 shadow-rose-500/50"
            )} />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-0 overflow-hidden border-2 shadow-2xl z-[100]" 
        onMouseEnter={() => setIsOpen(true)} 
        onMouseLeave={() => setIsOpen(false)}
        side="right"
      >
        <div className={cn(
            "p-3 flex items-center justify-between border-b",
            isBullish ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
        )}>
            <div className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-widest">{symbol} Position</span>
            </div>
            <Badge variant={isBullish ? "success" : "destructive"} className="text-[9px] h-4">
                {isBullish ? "Bullish" : "Bearish"}
            </Badge>
        </div>
        
        <div className="p-4 space-y-4 bg-background">
            <div className="text-center space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Current Technical Zone</p>
                <h4 className="text-lg font-black tracking-tight text-primary">{pivots.zone}</h4>
            </div>

            <div className="space-y-1.5">
                <PivotRow label="R4 High" value={pivots.r4} current={currentPrice} type="resistance" />
                <PivotRow label="R3 Resist" value={pivots.r3} current={currentPrice} type="resistance" />
                <PivotRow label="R2 Resist" value={pivots.r2} current={currentPrice} type="resistance" />
                <PivotRow label="R1 Resist" value={pivots.r1} current={currentPrice} type="resistance" />
                <PivotRow label="Central Pivot" value={pivots.p} current={currentPrice} type="pivot" />
                <PivotRow label="S1 Support" value={pivots.s1} current={currentPrice} type="support" />
                <PivotRow label="S2 Support" value={pivots.s2} current={currentPrice} type="support" />
                <PivotRow label="S3 Support" value={pivots.s3} current={currentPrice} type="support" />
                <PivotRow label="S4 Low" value={pivots.s4} current={currentPrice} type="support" />
            </div>

            <div className="pt-2 border-t border-dashed flex justify-between items-center opacity-70">
                <span className="text-[9px] font-bold uppercase text-muted-foreground">LTP Reference</span>
                <span className="text-xs font-mono font-black">₹{currentPrice.toFixed(2)}</span>
            </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PivotRow({ label, value, current, type }: { label: string; value: number; current: number; type: 'resistance' | 'support' | 'pivot' }) {
    // Highlight if price is very near or has crossed this level
    const isAtLevel = Math.abs(current - value) / value < 0.003;
    const hasCrossedAbove = current > value;

    return (
        <div className={cn(
            "flex items-center justify-between py-1 px-2 rounded transition-colors",
            isAtLevel ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/50"
        )}>
            <div className="flex items-center gap-1.5">
                {type === 'resistance' ? <TrendingUp className="h-2.5 w-2.5 text-emerald-500" /> : 
                 type === 'support' ? <TrendingDown className="h-2.5 w-2.5 text-rose-500" /> : 
                 <Gauge className="h-2.5 w-2.5 text-primary" />}
                <span className={cn(
                    "text-[9px] font-bold uppercase",
                    isAtLevel ? "text-primary" : "text-muted-foreground"
                )}>{label}</span>
            </div>
            <span className={cn(
                "text-[10px] font-mono font-bold",
                isAtLevel ? "text-primary" : "text-foreground/80"
            )}>₹{value.toFixed(1)}</span>
        </div>
    );
}
