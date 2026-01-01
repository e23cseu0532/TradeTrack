
"use client";

import React, { useState, useMemo, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockRecord } from "@/app/types/trade";
import AnimatedCounter from "./AnimatedCounter";

type PositionSizingTableProps = {
  trades: StockRecord[];
  stockSymbol: string;
  isLoading: boolean;
  riskPercentage: number;
};

export default function PositionSizingTable({
  trades,
  stockSymbol,
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
        <CardTitle className="font-headline">Stock View: {stockSymbol}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-hidden rounded-lg border">
          <Table>
            <TableCaption>Select a trade entry to calculate its position size.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Select</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Entry Price</TableHead>
                <TableHead className="text-right">Stop Loss</TableHead>
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
