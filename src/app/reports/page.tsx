"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import * as XLSX from "xlsx";


import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Search, ArrowLeft, RefreshCw, AlertTriangle, Download, Sparkles, Bot, BookOpen, ChevronsUpDown, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import ReportsTable from "@/components/ReportsTable";
import type { StockRecord } from "@/app/types/trade";
import type { StockData, FinancialData } from "@/app/types/stock";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import AiAssistant from "@/components/AiAssistant";
import { queryWatchlist, QueryWatchlistOutput } from "@/ai/flows/query-watchlist-flow";
import TradingJournal from "@/components/TradingJournal";
import { Skeleton } from "@/components/ui/skeleton";
import AnimatedCounter from "@/components/AnimatedCounter";


type FinancialsStateType = { 
  [symbol: string]: { loading: boolean; data: FinancialData | null; error: string | null } 
};

export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [stockData, setStockData] = useState<StockData>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [financials, setFinancials] = useState<FinancialsStateType>({});
  const [aiAssistantResponse, setAiAssistantResponse] = useState<QueryWatchlistOutput | null>(null);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [isAssistantDialogOpen, setIsAssistantDialogOpen] = useState(false);

  const [isInsightsDialogOpen, setIsInsightsDialogOpen] = useState(false);
  const [selectedStockForInsight, setSelectedStockForInsight] = useState<StockRecord | null>(null);
  const [isJournalOpen, setIsJournalOpen] = useState(false);


  const { user } = useUser();
  const firestore = useFirestore();

  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  
  const { data: trades, isLoading: tradesLoading } = useCollection<StockRecord>(stockRecordsCollection);
  
  const tradesList = trades || [];

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const uniqueSymbols = [...new Set(tradesList.map(t => t.stockSymbol))];
    if (uniqueSymbols.length > 0 && dateRange?.from && dateRange?.to) {
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

    } else if (!tradesLoading) {
        setIsLoading(false);
    }

    return () => {
        controller.abort();
    };
  }, [tradesList, date, refreshKey, tradesLoading]);


  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  
  const filteredTrades = tradesList.filter((trade) =>
    trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const dateRange = date;

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };
  
  const stopLossTriggeredTrades = tradesList.filter(trade => {
    const data = stockData[trade.stockSymbol];
    return data && data.currentPrice && data.currentPrice < trade.stopLoss;
  });

  const handleDownloadExcel = () => {
    const formatDate = (timestamp: any) => {
      if (!timestamp || !timestamp.toDate) {
        return "N/A";
      }
      return format(timestamp.toDate(), "PP");
    };

    // Stop Loss Report Data
    const stopLossData = stopLossTriggeredTrades.map(trade => ({
      "Date Added": formatDate(trade.dateTime),
      "Stock": trade.stockSymbol,
      "Entry Price": trade.entryPrice,
      "Stop Loss": trade.stopLoss,
      "Target Price 1": trade.targetPrice1,
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
      "Target Price 1": trade.targetPrice1,
      "Target Price 2": trade.targetPrice2 || "-",
      "Target Price 3": trade.targetPrice3 || "-",
      "Positional Target": trade.positionalTargetPrice || "-",
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

  const handleGetFinancials = async (trade: StockRecord) => {
    setSelectedStockForInsight(trade);
    setIsInsightsDialogOpen(true);

    const symbol = trade.stockSymbol;

    // Use cached result if available
    if (financials[symbol]?.data) {
      return;
    }

    setFinancials(prev => ({ ...prev, [symbol]: { loading: true, data: null, error: null } }));

    try {
      const response = await fetch(`/api/yahoo-finance?symbol=${symbol}&financials=true`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch data.");
      }
      const result = await response.json();
      setFinancials(prev => ({ ...prev, [symbol]: { loading: false, data: result, error: null } }));
    } catch (error: any) {
      console.error("Failed to get financials", error);
      setFinancials(prev => ({ ...prev, [symbol]: { loading: false, data: null, error: error.message || "Could not fetch financials." } }));
    }
  };

  const handleAskAssistant = async (query: string) => {
    setIsAssistantLoading(true);
    setAiAssistantResponse(null);
    setIsAssistantDialogOpen(true);

    const watchlistData = tradesList.map(trade => {
        const risk = { riskLevel: 'Unknown' };
        const currentData = stockData[trade.stockSymbol];
        
        const plainTrade = {
            id: trade.id,
            stockSymbol: trade.stockSymbol,
            entryPrice: trade.entryPrice,
            stopLoss: trade.stopLoss,
            targetPrice1: trade.targetPrice1,
            targetPrice2: trade.targetPrice2,
            targetPrice3: trade.targetPrice3,
            positionalTargetPrice: trade.positionalTargetPrice,
            dateTime: trade.dateTime?.toDate().toISOString() || null, 
        };

        return {
            ...plainTrade,
            riskLevel: risk?.riskLevel || 'Unknown',
            currentPrice: currentData?.currentPrice || null
        }
    });

    try {
        const response = await queryWatchlist({ query, watchlist: watchlistData });
        setAiAssistantResponse(response);
    } catch (error) {
        console.error("AI Assistant error:", error);
        setAiAssistantResponse({ answer: "Sorry, I encountered an error while processing your request." });
    } finally {
        setIsAssistantLoading(false);
    }
  };

  const currentFinancials = selectedStockForInsight ? financials[selectedStockForInsight.stockSymbol] : null;
  
  const tradingViewUrl = useMemo(() => {
    if (!selectedStockForInsight) return "";
    const symbol = selectedStockForInsight.stockSymbol;
    return `https://www.tradingview.com/chart/?symbol=NSE:${symbol}`;
  }, [selectedStockForInsight]);


  return (
    <main className="min-h-screen bg-background animate-fade-in">
      <div className="container mx-auto p-4 pt-8 md:p-8">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-4 -mt-8 px-4 pt-8 mb-10 flex items-center justify-between animate-fade-in-down pb-4 border-b">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider">
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

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="font-headline">Filters & Actions</CardTitle>
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
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-headline">
                        <Bot className="text-primary" />
                        AI Assistant
                    </CardTitle>
                    <CardDescription>Ask questions about your watchlist in plain English.</CardDescription>
                </CardHeader>
                <CardContent>
                    <AiAssistant onAsk={handleAskAssistant} isLoading={isAssistantLoading} />
                </CardContent>
            </Card>

            <Collapsible open={isJournalOpen} onOpenChange={setIsJournalOpen} asChild>
              <Card>
                  <CollapsibleTrigger asChild>
                    <div className="flex cursor-pointer items-center justify-between p-6">
                      <div className="flex flex-col space-y-1.5">
                        <CardTitle className="flex items-center gap-2 font-headline">
                          <BookOpen className="text-primary" />
                          Trading Journal
                        </CardTitle>
                        <CardDescription>
                          Your central place for all trading thoughts, strategies, and reflections. Saved automatically.
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" className="w-9 p-0">
                        <ChevronsUpDown className="h-4 w-4" />
                        <span className="sr-only">Toggle</span>
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <TradingJournal />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Watchlist</CardTitle>
                    <CardDescription>
                        Displaying all stock records for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ReportsTable 
                      trades={filteredTrades} 
                      stockData={stockData} 
                      isLoading={isLoading || tradesLoading}
                      onGetFinancials={handleGetFinancials}
                    />
                </CardContent>
            </Card>
        </div>

        {/* Dialog for individual stock financials */}
        <Dialog open={isInsightsDialogOpen} onOpenChange={setIsInsightsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-headline">
                <Sparkles className="text-primary" />
                Financials for {selectedStockForInsight?.stockSymbol}
              </DialogTitle>
              <DialogDescription>
                Key financial metrics from Yahoo Finance.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {currentFinancials?.loading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {currentFinancials?.error && <p className="text-destructive">{currentFinancials.error}</p>}
              {currentFinancials?.data && (
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span>Current Price:</span> <span className="font-mono text-primary"><AnimatedCounter value={currentFinancials.data.currentPrice} /></span></li>
                  <li className="flex justify-between"><span>4-Week High:</span> <span className="font-mono text-success"><AnimatedCounter value={currentFinancials.data.fourWeekHigh} /></span></li>
                  <li className="flex justify-between"><span>4-Week Low:</span> <span className="font-mono text-destructive"><AnimatedCounter value={currentFinancials.data.fourWeekLow} /></span></li>
                </ul>
              )}
            </div>
             <DialogFooter>
                <Button asChild variant="outline" className="w-full">
                    <Link href={tradingViewUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View on TradingView
                    </Link>
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for AI Assistant */}
        <Dialog open={isAssistantDialogOpen} onOpenChange={setIsAssistantDialogOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-headline">
                        <Bot className="text-primary" />
                        AI Assistant Response
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    {isAssistantLoading && <p>Thinking...</p>}
                    {aiAssistantResponse?.answer && <p className="text-sm text-foreground">{aiAssistantResponse.answer}</p>}
                </div>
            </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
