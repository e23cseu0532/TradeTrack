
"use client";

import { useMemo } from "react";
import type { StockRecord } from "@/app/types/trade";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Rows, Sigma } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";

type QuickLevelsCalculatorProps = {
  trade: StockRecord;
  currentPrice: number | null;
};

const RetracementCalculator = ({ trade }: { trade: StockRecord }) => {
  const retracementLevels = useMemo(() => {
    const start = trade.stopLoss;
    const end = trade.targetPrice1;

    if (isNaN(start) || isNaN(end) || start === 0 || end <= start) {
      return [];
    }

    const diff = end - start;
    const keyLevels = [
      { name: "33.3%", value: 1 / 3 },
      { name: "50.0%", value: 0.5 },
      { name: "66.7%", value: 2 / 3 },
    ];

    return keyLevels.map((p) => ({
      percentage: p.name,
      level: start + diff * p.value,
    }));
  }, [trade]);

  if (retracementLevels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        Cannot calculate levels. Please ensure the trade has a valid Stop Loss and Target 1, with the target being higher than the stop loss.
      </p>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Retracement</TableHead>
            <TableHead className="text-right">Price Level</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {retracementLevels.map((level, index) => (
            <TableRow key={index}>
              <TableCell>{level.percentage}</TableCell>
              <TableCell className="text-right font-mono">
                <AnimatedCounter value={level.level} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};


const SquareOfNineCalculator = ({ price }: { price: number | null }) => {
    const gannLevels = useMemo(() => {
        if (price === null || price <= 0) return [];

        const baseRoot = Math.round(Math.sqrt(price));
        const rows = [baseRoot - 1, baseRoot, baseRoot + 1];

        return rows.map(rowBase => {
            const levels = [];
            for (let i = 0; i < 9; i++) { // T0 to T8
                const value = Math.pow(rowBase + (i * 0.125), 2);
                levels.push({ name: `T${i}`, value });
            }
            return { base: rowBase, levels };
        });
    }, [price]);

    if (!price || gannLevels.length === 0) {
        return (
            <p className="text-sm text-muted-foreground p-4">
                Current price not available or invalid for Square of 9 calculation.
            </p>
        );
    }
    
    return (
        <div className="space-y-4">
            {gannLevels.map(row => (
                <div key={row.base} className="w-full overflow-hidden rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead colSpan={2} className="bg-muted/50">Base: {row.base}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {row.levels.map(level => (
                                <TableRow key={level.name}>
                                    <TableCell>{level.name}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        <AnimatedCounter value={level.value} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ))}
        </div>
    );
};


export default function QuickLevelsCalculator({ trade, currentPrice }: QuickLevelsCalculatorProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <TrendingUp className="text-primary" />
          Quick Levels
        </CardTitle>
        <CardDescription>
          Dynamic technical levels for the selected stock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="retracement" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="retracement"><Rows className="mr-2"/>Retracement</TabsTrigger>
            <TabsTrigger value="gann"><Sigma className="mr-2"/>Square of 9</TabsTrigger>
          </TabsList>
          <TabsContent value="retracement" className="mt-4">
             <RetracementCalculator trade={trade} />
          </TabsContent>
          <TabsContent value="gann" className="mt-4">
            <SquareOfNineCalculator price={currentPrice} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

