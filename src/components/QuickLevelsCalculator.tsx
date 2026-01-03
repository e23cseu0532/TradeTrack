
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
import { TrendingUp } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";

type QuickLevelsCalculatorProps = {
  trade: StockRecord;
};

type RetracementLevel = {
  percentage: string;
  level: number;
};

export default function QuickLevelsCalculator({ trade }: QuickLevelsCalculatorProps) {

  const retracementLevels = useMemo(() => {
    const start = trade.stopLoss;
    const end = trade.targetPrice1;

    if (isNaN(start) || isNaN(end) || start === 0 || end <= start) {
      return [];
    }

    const diff = end - start;
    const keyLevels = [
        { name: "33.3%", value: 1/3 },
        { name: "50.0%", value: 0.5 },
        { name: "66.7%", value: 2/3 }
    ];

    return keyLevels.map((p) => ({
      percentage: p.name,
      level: start + diff * p.value,
    }));
  }, [trade]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
            <TrendingUp className="text-primary"/>
            Quick Levels
        </CardTitle>
        <CardDescription>
          Retracement levels based on your trade's Stop Loss and Target 1.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {retracementLevels.length > 0 ? (
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
        ) : (
            <p className="text-sm text-muted-foreground">
                Cannot calculate levels. Please ensure the trade has a valid Stop Loss and Target 1, with the target being higher than the stop loss.
            </p>
        )}
      </CardContent>
    </Card>
  );
}
