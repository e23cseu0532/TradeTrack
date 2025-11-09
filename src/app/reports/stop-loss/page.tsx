"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import StopLossReportTable from "@/components/StopLossReportTable";
import type { Trade } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";

export default function StopLossPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stockData, setStockData] = useState<StockData>({});
  const [isLoading, setIsLoading] = useState(true);

  // Use a fixed date range for fetching current price data
  const dateRange: DateRange = {
    from: addDays(new Date(), -7),
    to: new Date(),
  };

  useEffect(() => {
    const savedTrades = localStorage.getItem("trades");
    if (savedTrades) {
      setTrades(
        JSON.parse(savedTrades, (key, value) => {
          if (key === "dateTime") {
            return new Date(value);
          }
          return value;
        })
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    if (trades.length > 0 && dateRange?.from && dateRange?.to) {
      const stopLossTrades = trades.filter(trade => {
          // Prefilter to reduce unnecessary API calls, though we fetch all for context
          const data = stockData[trade.stockSymbol];
          // If we already have data, we can check, but we will still refetch
          if (data) return data.currentPrice && data.currentPrice < trade.stopLoss;
          return true; // Fetch if no data yet
      });

      const uniqueSymbols = [...new Set(stopLossTrades.map((t) => t.stockSymbol))];

      if (uniqueSymbols.length === 0) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      const fetches = uniqueSymbols.map((symbol) => {
        return fetch(
          `/api/yahoo-finance?symbol=${symbol}&from=${dateRange.from!.toISOString()}&to=${dateRange.to!.toISOString()}`, { signal }
        )
          .then((res) => {
            if (!res.ok) {
              throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
          })
          .then((data) => {
            if (data.error) {
              throw new Error(data.error);
            }
            return { symbol, data };
          })
          .catch((err) => {
             if (err.name !== 'AbortError') {
                console.error(`Failed to fetch data for ${symbol}`, err);
                return { symbol, error: true };
             }
          });
      });

      Promise.all(fetches).then((results) => {
        const newStockData: StockData = {};
        results.forEach((result) => {
          if (result) {
            newStockData[result.symbol] = {
              currentPrice: result.data?.currentPrice,
              high: result.data?.high,
              low: result.data?.low,
              loading: false,
              error: !!result.error
            };
          }
        });
        setStockData(newStockData);
        setIsLoading(false);
      });
    } else {
        setIsLoading(false);
    }

    return () => {
        controller.abort();
    };

  }, [trades]);

  const stopLossTriggeredTrades = trades.filter((trade) => {
    const data = stockData[trade.stockSymbol];
    return data && data.currentPrice && data.currentPrice < trade.stopLoss;
  });

  return (
    <main className="min-h-screen bg-background animate-fade-in">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 flex items-center justify-between animate-fade-in-down">
          <div>
            <h1 className="text-4xl font-headline font-bold text-destructive">
              Stop-Loss Triggered
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Stocks where the current price has dropped below your set stop-loss.
            </p>
          </div>
          <Link href="/reports" passHref>
            <Button variant="outline" className="transition-transform duration-300 ease-in-out hover:scale-105">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Watchlist
            </Button>
          </Link>
        </header>

        <div className="space-y-8">
          <Card className="shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <CardTitle className="text-2xl text-destructive">Triggered Stocks</CardTitle>
              </div>
              <CardDescription>
                Review these positions. The current market price is below your defined stop-loss.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StopLossReportTable
                trades={stopLossTriggeredTrades}
                stockData={stockData}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
