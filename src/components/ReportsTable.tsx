"use client";

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
import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ReportsTableProps = {
  trades: StockRecord[];
  stockData: StockData;
  isLoading: boolean;
  onGetFinancials: (trade: StockRecord) => void;
};


export default function ReportsTable({ trades, stockData, isLoading, onGetFinancials }: ReportsTableProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return "-";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const renderCellContent = (symbol: string, field: 'currentPrice' | 'high' | 'low') => {
    const data = stockData[symbol];
    if (isLoading && !data) {
      return <Skeleton className="h-4 w-20" />;
    }
    if (data?.error) {
      return <span className="text-destructive text-xs">Failed to load</span>;
    }
    return formatCurrency(data?.[field]);
  }

  if (trades.length === 0 && !isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks to display for the selected period. Add some stocks to see a report.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableCaption>A list of your stock reports.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Current Price</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Target 1</TableHead>
            <TableHead className="text-right">Target 2</TableHead>
            <TableHead className="text-right">Target 3</TableHead>
            <TableHead className="text-right">Positional</TableHead>
            <TableHead className="text-right">Period High</TableHead>
            <TableHead className="text-right">Period Low</TableHead>
            <TableHead className="text-center">Financials</TableHead>
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
                    <TableCell className="text-center"><Skeleton className="h-8 w-8 mx-auto" /></TableCell>
                </TableRow>
             ))
          )}
          {(!isLoading || trades.length > 0) && trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>
                <Badge variant="secondary">{trade.stockSymbol}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{renderCellContent(trade.stockSymbol, 'currentPrice')}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{formatCurrency(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono text-primary font-semibold">{formatCurrency(trade.targetPrice1)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.targetPrice2)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.targetPrice3)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.positionalTargetPrice)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{renderCellContent(trade.stockSymbol, 'high')}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{renderCellContent(trade.stockSymbol, 'low')}</TableCell>
              <TableCell className="text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onGetFinancials(trade)}>
                        <Sparkles className="h-4 w-4 text-primary" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Get Key Financials</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
