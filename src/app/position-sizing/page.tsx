
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { StockRecord } from "@/app/types/trade";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import AppLayout from "@/components/AppLayout";
import { Scaling, Settings, X } from "lucide-react";
import PositionSizingTable from "@/components/PositionSizingTable";
import RiskSettingsDialog from "@/components/RiskSettingsDialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AnimatedCounter from "@/components/AnimatedCounter";
import QuickLevelsCalculator from "@/components/QuickLevelsCalculator";


export type UserSettings = {
  id: string;
  riskPercentage?: number;
  capital?: number;
  maxCapitalPercentagePerTrade?: number;
};

export default function PositionSizingPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  // Fetch all stock records for the user
  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  const { data: trades, isLoading: tradesLoading } = useCollection<StockRecord>(stockRecordsCollection);
  const tradesList = trades || [];

  // Fetch user's risk settings
  const settingsDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, `users/${user.uid}/settings/main`);
  }, [user, firestore]);
  const { data: userSettings } = useDoc<UserSettings>(settingsDocRef);
  
  const riskPercentage = userSettings?.riskPercentage ?? 1;
  const capital = userSettings?.capital ?? 0;
  const maxCapitalPercentage = userSettings?.maxCapitalPercentagePerTrade ?? 12;


  // Check for symbol in URL on initial load
  useEffect(() => {
    const symbolFromParams = searchParams.get('symbol');
    if (symbolFromParams && symbolFromParams !== selectedSymbol) {
      setSelectedSymbol(symbolFromParams);
      setSelectedTradeId(null); // Reset selected trade when symbol changes
    }
  }, [searchParams, selectedSymbol]);

  // Fetch current price when a symbol is selected
  useEffect(() => {
    if (!selectedSymbol) {
      setCurrentPrice(null);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const fetchPrice = async () => {
      setIsPriceLoading(true);
      try {
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const to = new Date().toISOString();
        const response = await fetch(`/api/yahoo-finance?symbol=${selectedSymbol}&from=${from}&to=${to}`, { signal });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }

        setCurrentPrice(data.currentPrice);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error(`Failed to fetch price for ${selectedSymbol}`, error);
          setCurrentPrice(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsPriceLoading(false);
        }
      }
    };
    
    fetchPrice();

    return () => {
      controller.abort();
    };
  }, [selectedSymbol]);


  // Handle symbol selection from combobox
  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    router.push(`/position-sizing?symbol=${symbol}`, { scroll: false });
  };
  
  // Clear selection
  const clearSelection = () => {
      setSelectedSymbol(null);
      setCurrentPrice(null);
      setSelectedTradeId(null);
      router.push('/position-sizing', { scroll: false });
  };

  const uniqueStockOptions = useMemo(() => {
    if (!tradesList) return [];
    const uniqueSymbols = [...new Set(tradesList.map(trade => trade.stockSymbol))];
    return uniqueSymbols.map(symbol => ({ value: symbol, label: symbol }));
  }, [tradesList]);

  const selectedStockTrades = useMemo(() => {
    if (!selectedSymbol || !tradesList) return [];
    return tradesList.filter(trade => trade.stockSymbol === selectedSymbol);
  }, [tradesList, selectedSymbol]);
  
  const isLoading = tradesLoading || (selectedSymbol ? isPriceLoading : false);

  const selectedTrade = useMemo(() => {
    if (!selectedTradeId) return null;
    return selectedStockTrades.find(trade => trade.id === selectedTradeId);
  }, [selectedTradeId, selectedStockTrades]);


  // Shared calculation
  const maxRiskPerTrade = capital * (riskPercentage / 100);
  
  // Calculations based on CURRENT PRICE
  const perShareRiskCurrent = (currentPrice && selectedTrade) ? currentPrice - selectedTrade.stopLoss : 0;
  const quantityToTradeCurrent = perShareRiskCurrent > 0 ? maxRiskPerTrade / perShareRiskCurrent : 0;
  const positionValueCurrent = quantityToTradeCurrent * (currentPrice ?? 0);
  const capitalAllocatedPercentageCurrent = capital > 0 ? (positionValueCurrent / capital) * 100 : 0;


  const CalculationDisplay = ({ title, value, subtext }: { title: string, value: number, subtext: string }) => (
    <div className="rounded-lg border bg-muted/30 p-4">
      <h4 className="font-semibold text-muted-foreground">{title}</h4>
      <p className="font-mono text-2xl font-bold text-primary">
        <AnimatedCounter value={value} precision={2} />
      </p>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </div>
  );

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="text-center md:text-left">
                <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3">
                  <Scaling className="h-10 w-10" />
                  Position Sizing
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                  Calculate tradeable quantity based on your risk tolerance.
                </p>
              </div>
              <div className="flex items-center gap-2">
                 <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
                    <Settings className="mr-2" />
                    Risk Management
                  </Button>
              </div>
            </div>
             <div className="relative mt-6 max-w-sm">
                <div className="flex items-center gap-2">
                    <Combobox
                      options={uniqueStockOptions}
                      value={selectedSymbol || ""}
                      onChange={handleSymbolSelect}
                      placeholder="Select a stock to view..."
                      searchPlaceholder="Search watchlist..."
                      notFoundMessage="No stocks in watchlist."
                    />
                    {selectedSymbol && (
                        <Button variant="ghost" size="icon" onClick={clearSelection}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
              </div>
          </header>

          {selectedSymbol ? (
            <div className="space-y-8">
              <PositionSizingTable
                trades={selectedStockTrades}
                stockSymbol={selectedSymbol}
                currentPrice={currentPrice}
                isLoading={isLoading}
                selectedTradeId={selectedTradeId}
                onTradeSelect={setSelectedTradeId}
              />
              {selectedTrade && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card>
                    <CardHeader>
                        <CardTitle className="font-headline">Quantity Calculation</CardTitle>
                        <CardDescription>
                        Based on current price and your risk settings (Max Risk per Trade: ₹{maxRiskPerTrade.toFixed(2)}).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <CalculationDisplay
                            title="Current Price"
                            value={currentPrice ?? 0}
                            subtext={`Real-time price for ${selectedSymbol}`}
                        />
                        <CalculationDisplay
                            title="Per-Share Risk"
                            value={perShareRiskCurrent}
                            subtext={`(Current Price - Stop Loss)`}
                        />
                        <div className="rounded-lg border bg-primary/10 p-6 text-center">
                            <h4 className="font-semibold text-primary/80 uppercase tracking-wider">Quantity to Trade</h4>
                            <p className="font-mono text-5xl font-extrabold text-primary">
                                <AnimatedCounter value={quantityToTradeCurrent} precision={2} />
                            </p>
                        </div>
                        <CalculationDisplay
                            title="Position Value"
                            value={positionValueCurrent}
                            subtext={`(Quantity × Current Price)`}
                        />
                        <div className={`rounded-lg border p-4 ${capitalAllocatedPercentageCurrent > maxCapitalPercentage ? 'bg-destructive/10' : 'bg-success/10'}`}>
                            <h4 className={`font-semibold ${capitalAllocatedPercentageCurrent > maxCapitalPercentage ? 'text-destructive' : 'text-success'}`}>
                            Capital Allocated for this Trade
                            </h4>
                            <p className={`font-mono text-2xl font-bold ${capitalAllocatedPercentageCurrent > maxCapitalPercentage ? 'text-destructive' : 'text-success'}`}>
                            <AnimatedCounter value={capitalAllocatedPercentageCurrent} precision={2} />%
                            </p>
                            <p className="text-xs text-muted-foreground">
                            (Max recommended: {maxCapitalPercentage}%)
                            </p>
                        </div>
                    </CardContent>
                    </Card>
                    <div>
                        <QuickLevelsCalculator trade={selectedTrade} />
                    </div>
                </div>
              )}
            </div>
          ) : (
             <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
                <p className="text-muted-foreground">
                    Select a stock from the search bar above to begin.
                </p>
            </div>
          )}

          <RiskSettingsDialog
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            settingsDocRef={settingsDocRef}
            userSettings={userSettings}
          />
        </div>
      </main>
    </AppLayout>
  );
