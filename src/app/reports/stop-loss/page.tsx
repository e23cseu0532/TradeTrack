
"use client";

import { useState, useEffect } from "react";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search } from "lucide-react";
import StopLossReportTable from "@/components/StopLossReportTable";
import type { StockRecord } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import { Input } from "@/components/ui/input";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import AppLayout from "@/components/AppLayout";

export default function StopLossPage() {
  const [stockData, setStockData] = useState<StockData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const { user } = useUser();
  const firestore = useFirestore();

  // Use a fixed date range for fetching current price data
  const dateRange: DateRange = {
    from: addDays(new Date(), -7),
    to: new Date(),
  };

  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);

  const { data: trades, isLoading: tradesLoading } = useCollection<StockRecord>(stockRecordsCollection);
  const tradesList = trades || [];
  
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';

    if (tradesList.length > 0 && dateRange?.from && dateRange?.to) {
      const stopLossTrades = tradesList.filter(trade => {
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
          `${baseUrl}/api/yahoo-finance?symbol=${symbol}&from=${dateRange.from!.toISOString()}&to=${dateRange.to!.toISOString()}`, { signal }
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
          if (result && !('error' in result)) {
            newStockData[result.symbol] = {
              currentPrice: result.data?.currentPrice,
              high: result.data?.high,
              low: result.data?.low,
              loading: false,
              error: false,
            };
          } else if (result) {
            newStockData[result.symbol] = { loading: false, error: true };
          }
        });
        setStockData(newStockData);
        setIsLoading(false);
      });
    } else if (!tradesLoading) {
        setIsLoading(false);
    }

    return () => {
        controller.abort();
    };

  }, [tradesList, tradesLoading]);
  
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const stopLossTriggeredTrades = tradesList.filter((trade) => {
    const data = stockData[trade.stockSymbol];
    const isTriggered = data && data.currentPrice && data.currentPrice < trade.stopLoss;
    const matchesSearch = trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase());
    return isTriggered && matchesSearch;
  });

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down">
              <div className="text-center md:text-left">
                  <h1 className="text-4xl font-headline font-bold text-destructive uppercase tracking-wider">
                  Stop-Loss Triggered
                  </h1>
                  <p className="mt-2 text-lg text-muted-foreground">
                  Stocks where the current price has dropped below your set stop-loss.
                  </p>
              </div>
          </header>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CardTitle className="text-2xl text-destructive font-headline">Triggered Stocks</CardTitle>
                </div>
                <CardDescription>
                  Review these positions. The current market price is below your defined stop-loss.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by stock symbol..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={handleSearch}
                  />
                </div>
                <StopLossReportTable
                  trades={stopLossTriggeredTrades}
                  stockData={stockData}
                  isLoading={isLoading || tradesLoading}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
