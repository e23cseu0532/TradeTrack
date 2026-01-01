"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockRecord } from "@/app/types/trade";
import AnimatedCounter from "./AnimatedCounter";

type PositionSizingTableProps = {
  trades: StockRecord[];
  stockSymbol: string;
  currentPrice: number | null;
  isLoading: boolean;
  riskPercentage: number;
};

export default function PositionSizingTable({
  trades,
  stockSymbol,
  currentPrice,
  isLoading,
  riskPercentage,
}: PositionSizingTableProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  // When trades for a new symbol are loaded, default to the latest one
  useEffect(() => {
    if (trades && trades.length > 0) {
      const sortedTrades = [...trades].sort((a, b) => 
        (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
      );
      setSelectedTradeId(sortedTrades[0].id);
    } else {
      setSelectedTradeId(null);
    }
  }, [trades]);

  const calculateTradeableQuantity = (trade: StockRecord) => {
    const totalCapital = trade.entryPrice; 
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
          No trade records found for this stock.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle className="font-headline">Stock View: {stockSymbol}</CardTitle>
            <div className="text-right">
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-2xl font-bold font-mono text-primary">
                    {isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(currentPrice)}
                </div>
            </div>
        </div>
        <CardDescription>Select a trade record to calculate its position size.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-hidden rounded-lg border">
          <Table>
            <TableCaption>The "Tradeable Qty" is calculated based on the selected record and your risk settings.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Select</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Entry Price</TableHead>
                <TableHead className="text-right">Stop Loss</TableHead>
                <TableHead className="text-right">Target 1</TableHead>
                <TableHead className="text-right text-muted-foreground">Target 2</TableHead>
                <TableHead className="text-right text-muted-foreground">Target 3</TableHead>
                <TableHead className="text-right text-muted-foreground">Positional</TableHead>
                <TableHead className="text-right font-bold text-primary">Tradeable Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                [...Array(2)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-5 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              )}
               {!isLoading && trades.map(trade => {
                  const isSelected = selectedTradeId === trade.id;
                  return (
                    <TableRow key={trade.id}>
                        <TableCell>
                        <RadioGroup 
                            value={selectedTradeId || ""}
                            onValueChange={setSelectedTradeId}
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value={trade.id} id={trade.id} />
                            </div>
                        </RadioGroup>
                        </TableCell>
                        <TableCell>
                            <Label htmlFor={trade.id} className="font-normal">
                                {trade.dateTime.toDate().toLocaleDateString('en-GB')}
                            </Label>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(trade.entryPrice)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{formatNumber(trade.stopLoss)}</TableCell>
                        <TableCell className="text-right font-mono text-success">{formatNumber(trade.targetPrice1)}</TableCell>
                        <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.targetPrice2)}</TableCell>
                        <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.targetPrice3)}</TableCell>
                        <TableCell className="text-right font-mono text-success/80">{formatNumber(trade.positionalTargetPrice)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                            {isSelected ? calculateTradeableQuantity(trade) : "-"}
                        </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
