"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockRecord } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import AnimatedCounter from "./AnimatedCounter";

type PositionSizingTableProps = {
  trades: StockRecord[];
  stockData: StockData;
  isLoading: boolean;
  riskPercentage: number;
};

export default function PositionSizingTable({
  trades,
  stockData,
  isLoading,
  riskPercentage,
}: PositionSizingTableProps) {
  const [selectedTrades, setSelectedTrades] = useState<{ [symbol: string]: string }>({});

  const groupedTrades = useMemo(() => {
    return trades.reduce((acc, trade) => {
      if (!acc[trade.stockSymbol]) {
        acc[trade.stockSymbol] = [];
      }
      acc[trade.stockSymbol].push(trade);
      return acc;
    }, {} as { [symbol: string]: StockRecord[] });
  }, [trades]);

  // Set the default selected trade to the latest one for each group
  useEffect(() => {
    const initialSelection: { [symbol: string]: string } = {};
    for (const symbol in groupedTrades) {
      const sortedTrades = [...groupedTrades[symbol]].sort((a, b) => 
        (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
      );
      if (sortedTrades.length > 0) {
        initialSelection[symbol] = sortedTrades[0].id;
      }
    }
    setSelectedTrades(initialSelection);
  }, [groupedTrades]);

  const handleSelectionChange = (symbol: string, tradeId: string) => {
    setSelectedTrades(prev => ({
      ...prev,
      [symbol]: tradeId,
    }));
  };

  const calculateTradeableQuantity = (trade: StockRecord) => {
    const totalCapital = trade.entryPrice; // This is a simplification; a real app might have a total capital input.
    const maxLossPerTrade = (totalCapital * riskPercentage) / 100;
    const perShareRisk = trade.entryPrice - trade.stopLoss;

    if (perShareRisk <= 0) return "Invalid SL";
    
    const quantity = maxLossPerTrade / perShareRisk;
    return quantity.toFixed(2);
  };

  const formatNumber = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return "-";
    return <AnimatedCounter value={amount} />;
  };

  if (trades.length === 0 && !isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks recorded. Add stocks on the homepage to calculate position sizes.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Trades</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-hidden rounded-lg border">
          <Table>
            <TableCaption>Select a trade entry to calculate its position size.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Stock / Date</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">Stop Loss</TableHead>
                <TableHead className="text-right">Entry Price</TableHead>
                <TableHead className="text-right font-bold text-primary">Tradeable Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                [...Array(3)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              )}
              {!isLoading && Object.keys(groupedTrades).map(symbol => (
                // Use React.Fragment to group the header and its rows
                <React.Fragment key={symbol}>
                  <TableRow className="bg-muted/20 font-semibold">
                    <TableCell colSpan={5}>
                      <Badge variant="secondary" className="text-base">{symbol}</Badge>
                    </TableCell>
                  </TableRow>
                  {groupedTrades[symbol].map(trade => {
                    const data = stockData[symbol];
                    const isSelected = selectedTrades[symbol] === trade.id;
                    return (
                      <TableRow key={trade.id}>
                        <TableCell>
                          <RadioGroup 
                              value={selectedTrades[symbol]}
                              onValueChange={(value) => handleSelectionChange(symbol, value)}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value={trade.id} id={trade.id} />
                              <Label htmlFor={trade.id} className="font-normal">
                                {trade.dateTime.toDate().toLocaleDateString('en-GB')}
                              </Label>
                            </div>
                          </RadioGroup>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                            {data?.currentPrice ? <AnimatedCounter value={data.currentPrice} /> : <Skeleton className="h-4 w-20 ml-auto"/>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">{formatNumber(trade.stopLoss)}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(trade.entryPrice)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                            {isSelected ? calculateTradeableQuantity(trade) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
