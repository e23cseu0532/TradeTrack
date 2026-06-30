"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";
import * as XLSX from "xlsx";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Search, RefreshCw, AlertTriangle, Download, Sparkles, Bot, BookOpen, ChevronsUpDown, ExternalLink, Calendar } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import AiAssistant from "@/components/AiAssistant";
import { queryWatchlist } from "@/ai/flows/query-watchlist-flow";
import type { QueryWatchlistOutput } from "@/ai/flows/query-watchlist-flow";
import TradingJournal from "@/components/TradingJournal";
import AnimatedCounter from "@/components/AnimatedCounter";
import AppLayout from "@/components/AppLayout";
import { deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type FinancialsStateType = { 
  [symbol: string]: { loading: boolean; data: FinancialData | null; error: string | null } 
};

export default function ReportsPage() {
  const { toast } = useToast();
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
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
    if (uniqueSymbols.length > 0) {
        setIsLoading(true);
        const fetches = uniqueSymbols.map((symbol) => {
            return fetch(`/api/yahoo-finance?symbol=${symbol}&timeframe=${timeframe}`, { signal })
                .then(res => {
                    if (!res.ok) {
                       throw new Error(`HTTP error! status: ${res.status}`);
                    }
                    return res.json();
                })
                .then(data => ({ symbol, data }))
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error(`Failed to fetch data for ${symbol}`, err);
                        return { symbol, error: true };
                    }
                    return undefined;
                });
        });

        Promise.all(fetches).then(results => {
            const newStockData: StockData = {};
            results.forEach(result => {
                 if (result && 'data' in result && !result.data.error) {
                    newStockData[result.symbol] = {
                        currentPrice: result.data.currentPrice,
                        high: result.data.high,
                        low: result.data.low,
                        previousClose: result.data.previousClose,
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
  }, [tradesList, timeframe, refreshKey, tradesLoading]);


  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  
  const filteredTrades = tradesList.filter((trade) =>
    trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };
  
  const stopLossTriggeredTrades = tradesList.filter(trade => {
    const data = stockData[trade.stockSymbol];
    return data && data.currentPrice && data.currentPrice < trade.stopLoss;
  });

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const stopLossData = stopLossTriggeredTrades.map(trade => ({
      "Stock": trade.stockSymbol,
      "Current Price": stockData[trade.stockSymbol]?.currentPrice,
      "Stop Loss": trade.stopLoss,
    }));
    const fullReportData = filteredTrades.map(trade => ({
      "Stock": trade.stockSymbol,
      "Entry": trade.entryPrice,
      "Target": trade.targetPrice1,
      "LTP": stockData[trade.stockSymbol]?.currentPrice,
    }));
    XLSX.book_append_sheet(wb, XLSX.utils.json_to_sheet(stopLossData), "Stop-Loss");
    XLSX.book_append_sheet(wb, XLSX.utils.json_to_sheet(fullReportData), "Watchlist");
    XLSX.writeFile(wb, `Stock_Reports.xlsx`);
  };

  const handleGetFinancials = async (trade: StockRecord) => {
    setSelectedStockForInsight(trade);
    setIsInsightsDialogOpen(true);
    const symbol = trade.stockSymbol;
    if (financials[symbol]?.data) return;
    setFinancials(prev => ({ ...prev, [symbol]: { loading: true, data: null, error: null } }));
    try {
      const response = await fetch(`/api/yahoo-finance?symbol=${symbol}&financials=true`);
      const result = await response.json();
      setFinancials(prev => ({ ...prev, [symbol]: { loading: false, data: result, error: null } }));
    } catch (error: any) {
      setFinancials(prev => ({ ...prev, [symbol]: { loading: false, data: null, error: "Fetch error" } }));
    }
  };

  const handleAskAssistant = async (query: string) => {
    setIsAssistantLoading(true);
    setAiAssistantResponse(null);
    setIsAssistantDialogOpen(true);
    const watchlistData = tradesList.map(trade => ({
        ...trade,
        dateTime: trade.dateTime ? trade.dateTime.toDate().toISOString() : null,
        riskLevel: 'Unknown' as const,
        currentPrice: stockData[trade.stockSymbol]?.currentPrice || null
    }));
    try {
        const response = await queryWatchlist({ query, watchlist: watchlistData });
        setAiAssistantResponse(response);
    } catch (error) {
        setAiAssistantResponse({ answer: "Assistant Error." });
    } finally {
        setIsAssistantLoading(false);
    }
  };

  const handleDeleteTrade = (tradeId: string) => {
    if (!user || !firestore) return;
    const tradeDocRef = doc(firestore, `users/${user.uid}/stockRecords`, tradeId);
    deleteDocumentNonBlocking(tradeDocRef);
    toast({ title: "Stock Removed" });
  };

  const currentFinancials = selectedStockForInsight ? financials[selectedStockForInsight.stockSymbol] : null;
  const financialsData = currentFinancials?.data;
  const tradingViewUrl = selectedStockForInsight ? `https://www.tradingview.com/chart/?symbol=NSE:${selectedStockForInsight.stockSymbol}` : "";

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="text-center md:text-left">
                  <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider">
                  My Watchlist
                  </h1>
                  <p className="mt-2 text-lg text-muted-foreground">
                  Analyze your stock performance and technical pivots.
                  </p>
              </div>
              <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-xl border border-primary/10">
                <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Technical Context
                </span>
                <Select value={timeframe} onValueChange={(val: any) => setTimeframe(val)}>
                    <SelectTrigger className="w-52 h-9 font-bold uppercase text-[10px] bg-background">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="monthly">Monthly (Daily Charts)</SelectItem>
                        <SelectItem value="weekly">Weekly (Hourly Charts)</SelectItem>
                        <SelectItem value="daily">Daily (5m Charts)</SelectItem>
                    </SelectContent>
                </Select>
             </div>
          </header>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="font-headline">Filters & Actions</CardTitle>
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
                        </div>
                        <Button variant="ghost" size="sm" className="w-9 p-0">
                          <ChevronsUpDown className="h-4 w-4" />
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
                  </CardHeader>
                  <CardContent>
                      <ReportsTable 
                        trades={filteredTrades} 
                        stockData={stockData} 
                        isLoading={isLoading || tradesLoading}
                        onGetFinancials={handleGetFinancials}
                        onDeleteTrade={handleDeleteTrade}
                      />
                  </CardContent>
              </Card>
          </div>

          <Dialog open={isInsightsDialogOpen} onOpenChange={setIsInsightsDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-headline">
                  <Sparkles className="text-primary" />
                  Market Position for {selectedStockForInsight?.stockSymbol}
                </DialogTitle>
              </DialogHeader>
              <div className="py-4">
                {currentFinancials?.loading && <Skeleton className="h-20 w-full" />}
                {financialsData && (
                  <div className="space-y-6">
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
                        <p className="text-3xl font-mono font-black text-primary">₹<AnimatedCounter value={financialsData.currentPrice} /></p>
                    </div>
                  </div>
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

          <Dialog open={isAssistantDialogOpen} onOpenChange={setIsAssistantDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 font-headline">
                          <Bot className="text-primary" />
                          AI Assistant Response
                      </DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                      {isAssistantLoading && <p>Analyzing Watchlist Context...</p>}
                      {aiAssistantResponse?.answer && <p className="text-sm text-foreground leading-relaxed">{aiAssistantResponse.answer}</p>}
                  </div>
              </DialogContent>
          </Dialog>
        </div>
      </main>
    </AppLayout>
  );
}
