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
import type { Trade } from "@/app/types/trade";
import { DateRange } from "react-day-picker";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type ReportsTableProps = {
  trades: Trade[];
  dateRange: DateRange | undefined;
};

type StockData = {
  [key: string]: {
    currentPrice?: number;
    high?: number;
    low?: number;
    loading: boolean;
    error?: boolean;
  };
};

export default function ReportsTable({ trades, dateRange }: ReportsTableProps) {
    const [stockData, setStockData] = useState<StockData>({});

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    if (trades.length > 0 && dateRange?.from && dateRange?.to) {
        const uniqueSymbols = [...new Set(trades.map(t => t.stockSymbol))];

        uniqueSymbols.forEach((symbol) => {
            // Only fetch if we don't have data or are not already loading/errored
            if (!stockData[symbol]) {
                setStockData(prev => ({...prev, [symbol]: { loading: true }}));
                fetch(`/api/yahoo-finance?symbol=${symbol}&from=${dateRange.from!.toISOString()}&to=${dateRange.to!.toISOString()}`, { signal })
                    .then(res => {
                        if (!res.ok) {
                           throw new Error(`HTTP error! status: ${res.status}`);
                        }
                        return res.json();
                    })
                    .then(data => {
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        setStockData(prev => ({
                            ...prev,
                            [symbol]: {
                                currentPrice: data.currentPrice,
                                high: data.high,
                                low: data.low,
                                loading: false,
                            }
                        }));
                    })
                    .catch(err => {
                        if (err.name !== 'AbortError') {
                            console.error(`Failed to fetch data for ${symbol}`, err);
                            setStockData(prev => ({...prev, [symbol]: { loading: false, error: true }}));
                        }
                    });
            }
        });
    }

    return () => {
        controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, dateRange]);


  const formatCurrency = (amount: number | undefined) => {
    if(amount === undefined) return 'N/A';
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const renderCellContent = (symbol: string, field: 'currentPrice' | 'high' | 'low') => {
    const data = stockData[symbol];
    if (data?.loading) {
      return <Skeleton className="h-4 w-20" />;
    }
    if (data?.error) {
      return <span className="text-destructive text-xs">Failed to load</span>;
    }
    return formatCurrency(data?.[field]);
  }
  
  if (trades.length === 0) {
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
            <TableHead className="text-right">Target Price</TableHead>
            <TableHead className="text-right">Period High</TableHead>
            <TableHead className="text-right">Period Low</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>
                <Badge variant="secondary">{trade.stockSymbol}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{renderCellContent(trade.stockSymbol, 'currentPrice')}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{formatCurrency(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono text-primary font-semibold">{formatCurrency(trade.targetPrice)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{renderCellContent(trade.stockSymbol, 'high')}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{renderCellContent(trade.stockSymbol, 'low')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
