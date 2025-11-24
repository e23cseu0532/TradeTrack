
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { stockList } from "@/lib/stock-list";
import { cn } from "@/lib/utils";


type Level = {
  angle: number;
  value: number;
  n: number;
  levelNumber: number;
};

export default function GannSquareCalculator() {
  const [symbol, setSymbol] = useState("");
  const [dayOffset, setDayOffset] = useState("0");
  const [step, setStep] = useState("0.25");
  const [levels, setLevels] = useState<Level[]>([]);
  const [stockPrice, setStockPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const calculateLevels = (price: number, stepValue: number) => {
    if (price <= 0) return;

    const r = Math.sqrt(price);
    const calculatedLevels: Level[] = [];

    for (let n = -9; n <= 9; n++) {
      const angle = n * 45;
      const value = n === 0 ? price : Math.pow(r + stepValue * n, 2);
      calculatedLevels.push({ angle, value, n, levelNumber: n + 10 });
    }
    setLevels(calculatedLevels);
  };

  const handleGenerateLevels = async () => {
    if (!symbol) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a stock symbol.",
      });
      return;
    }

    setIsLoading(true);
    setLevels([]);
    setStockPrice(null);

    try {
      const res = await fetch(
        `/api/yahoo-finance?symbol=${symbol}&daysAgo=${dayOffset}`
      );
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to fetch stock price.");
      }

      const close = data.previousClose;
      setStockPrice(close);
      calculateLevels(close, parseFloat(step));
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "API Error",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (stockPrice !== null) {
      calculateLevels(stockPrice, parseFloat(step));
    }
  }, [step, stockPrice]);

  const getRowClass = (levelNumber: number) => {
    if (levelNumber === 10) return "level-base";
    if (levelNumber === 8 || levelNumber === 12) return "level-gold";
    if (levelNumber % 2 === 0) return "level-purple";
    return "level-grey";
  };


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="space-y-2 md:col-span-1">
          <label>Stock Symbol</label>
          <Combobox
            options={stockList}
            value={symbol}
            onChange={setSymbol}
            placeholder="Select a stock..."
            searchPlaceholder="Search for a stock..."
            notFoundMessage="No stock found."
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="daySelector">Select Day</label>
          <Select value={dayOffset} onValueChange={setDayOffset}>
            <SelectTrigger id="daySelector">
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Today</SelectItem>
              <SelectItem value="1">Yesterday</SelectItem>
              <SelectItem value="2">2 Days Ago</SelectItem>
              <SelectItem value="3">3 Days Ago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label htmlFor="stepSelect">Step</label>
          <Select value={step} onValueChange={setStep}>
            <SelectTrigger id="stepSelect">
              <SelectValue placeholder="Select step" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.25">0.25</SelectItem>
              <SelectItem value="0.125">0.125</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={handleGenerateLevels} disabled={isLoading} className="w-full">
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (
          "Generate Levels"
        )}
      </Button>

      {stockPrice !== null && (
        <div className="text-center text-lg font-medium">
          Fetched Price for {symbol}:{" "}
          <span className="font-bold text-primary">
            {stockPrice.toFixed(2)}
          </span>
        </div>
      )}

      {levels.length > 0 && (
        <div className="w-full overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Angle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((level) => (
                <TableRow
                  key={level.n}
                  className={cn(getRowClass(level.levelNumber))}
                >
                  <TableCell>{level.levelNumber}</TableCell>
                  <TableCell className="text-right font-mono">
                    {level.value.toFixed(2)}
                  </TableCell>
                   <TableCell className="text-right">{level.angle}°</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
