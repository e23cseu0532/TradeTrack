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

type StopLossReportTableProps = {
  trades: StockRecord[];
  stockData: StockData;
  isLoading: boolean;
};


export default function StopLossReportTable({ trades, stockData, isLoading }: StopLossReportTableProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return "-";
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
  };
  
  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) {
      return "Invalid date";
    }
    return timestamp.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
  };
  
  if (trades.length === 0 && !isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks have triggered their stop-loss.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableCaption>A list of stocks that have fallen below their stop-loss.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date Added</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Target 1</TableHead>
            <TableHead className="text-right">Current Price</TableHead>
            <TableHead className="text-right">Period High</TableHead>
            <TableHead className="text-right">Period Low</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && trades.length === 0 && (
             [...Array(2)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32"/></TableCell>
                    <TableCell><Skeleton className="h-5 w-24"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                </TableRow>
             ))
          )}
          {(!isLoading || trades.length > 0) && trades.map((trade) => (
            <TableRow key={trade.id} className="bg-destructive/10 hover:bg-destructive/20">
              <TableCell className="font-medium">{formatDate(trade.dateTime)}</TableCell>
              <TableCell>
                <Badge variant="destructive">{trade.stockSymbol}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{formatCurrency(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.targetPrice1)}</TableCell>
              <TableCell className="text-right font-mono text-destructive font-bold">{renderCellContent(trade.stockSymbol, 'currentPrice')}</TableCell>
              <TableCell className="text-right font-mono text-primary">{renderCellContent(trade.stockSymbol, 'high')}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{renderCellContent(trade.stockSymbol, 'low')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
