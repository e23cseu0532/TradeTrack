"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";
import * as XLSX from "xlsx";


import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Search, ArrowLeft, RefreshCw, AlertTriangle, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import ReportsTable from "@/components/ReportsTable";
import type { Trade } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";


export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stockData, setStockData] = useState<StockData>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedTrades = localStorage.getItem("trades");
    if (savedTrades) {
      setTrades(JSON.parse(savedTrades, (key, value) => {
        if (key === 'dateTime') {
          return new Date(value);
        }
        return value;
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    if (trades.length > 0 && dateRange?.from && dateRange?.to) {
        const uniqueSymbols = [...new Set(trades.map(t => t.stockSymbol))];
        
        setIsLoading(true);
        const fetches = uniqueSymbols.map((symbol) => {
            return fetch(`/api/yahoo-finance?symbol=${symbol}&from=${dateRange.from!.toISOString()}&to=${dateRange.to!.toISOString()}`, { signal })
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
                    return { symbol, data };
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error(`Failed to fetch data for ${symbol}`, err);
                        return { symbol, error: true };
                    }
                });
        });

        Promise.all(fetches).then(results => {
            const newStockData: StockData = {};
            results.forEach(result => {
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
  }, [trades, date, refreshKey]);


  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  
  const filteredTrades = trades.filter((trade) =>
    trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const dateRange = date;

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };
  
  const stopLossTriggeredTrades = trades.filter(trade => {
    const data = stockData[trade.stockSymbol];
    return data && data.currentPrice && data.currentPrice < trade.stopLoss;
  });

  const handleDownloadExcel = () => {
    const formatCurrency = (amount: number | undefined) => {
      if (amount === undefined) return 'N/A';
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(amount);
    };

    // Stop Loss Report Data
    const stopLossData = stopLossTriggeredTrades.map(trade => ({
      "Date Added": format(trade.dateTime, "PP"),
      "Stock": trade.stockSymbol,
      "Entry Price": trade.entryPrice,
      "Stop Loss": trade.stopLoss,
      "Target Price": trade.targetPrice,
      "Current Price": stockData[trade.stockSymbol]?.currentPrice,
      "Period High": stockData[trade.stockSymbol]?.high,
      "Period Low": stockData[trade.stockSymbol]?.low,
    }));
    
    // Full Report Data
    const fullReportData = filteredTrades.map(trade => ({
      "Stock": trade.stockSymbol,
      "Current Price": stockData[trade.stockSymbol]?.currentPrice,
      "Entry Price": trade.entryPrice,
      "Stop Loss": trade.stopLoss,
      "Target Price": trade.targetPrice,
      "Period High": stockData[trade.stockSymbol]?.high,
      "Period Low": stockData[trade.stockSymbol]?.low,
    }));

    const wb = XLSX.utils.book_new();
    
    const wsStopLoss = XLSX.utils.json_to_sheet(stopLossData);
    XLSX.utils.book_append_sheet(wb, wsStopLoss, "Stop-Loss Triggered");

    const wsFullReport = XLSX.utils.json_to_sheet(fullReportData);
    XLSX.utils.book_append_sheet(wb, wsFullReport, "Watchlist");
    
    XLSX.writeFile(wb, `Stock_Reports_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <main className="min-h-screen bg-background animate-fade-in">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 flex items-center justify-between animate-fade-in-down">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary">
              My Watchlist
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Analyze your stock performance over a selected period.
            </p>
          </div>
           <Link href="/" passHref>
            <Button variant="outline" className="transition-transform duration-300 ease-in-out hover:scale-105">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </header>

        <Card className="shadow-lg mb-8 transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
          <CardHeader>
            <CardTitle>Filters & Actions</CardTitle>
            <CardDescription>
              Select date range, search, refresh data, or download reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
             <div className="flex flex-wrap items-center gap-2">
              <DatePickerWithRange date={date} setDate={setDate} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleRefresh} className="transition-transform duration-300 ease-in-out hover:rotate-90">
                      <RefreshCw className="h-4 w-4" />
                      <span className="sr-only">Refresh Data</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh Data</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
               <Button onClick={handleDownloadExcel} className="transition-transform duration-300 ease-in-out hover:scale-105">
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </Button>
               <Link
                href="/reports/stop-loss"
                className={cn(buttonVariants({ variant: "destructive" }), "transition-transform duration-300 ease-in-out hover:scale-105")}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Stop-Loss Triggers
              </Link>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by stock symbol..."
                className="pl-9"
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-8">
            <Card className="shadow-lg transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
                <CardHeader>
                    <CardTitle>Watchlist</CardTitle>
                    <CardDescription>
                        Displaying all stock records for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ReportsTable 
                    trades={filteredTrades} 
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
