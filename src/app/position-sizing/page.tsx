
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { StockRecord } from "@/app/types/trade";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import AppLayout from "@/components/AppLayout";
import { Scaling, Settings, X, Wallet, ShieldAlert, BadgeCheck, ArrowRightLeft } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";


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


  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8">
        <div className="container mx-auto p-0 max-w-7xl">
          <header className="mb-10 animate-fade-in-down flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-5xl font-headline font-black text-primary uppercase tracking-tighter flex items-center gap-4">
                <Scaling className="h-12 w-12" />
                Sizing Terminal
              </h1>
              <p className="text-muted-foreground font-medium text-lg">
                Calculates tradeable units based on risk tolerance.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-primary/5">
                  <div className="text-center px-4 border-r">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> Capital
                      </p>
                      <p className="text-lg font-mono font-black text-primary">₹<AnimatedCounter value={capital} /></p>
                  </div>
                  <div className="text-center px-4 border-r">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> Risk
                      </p>
                      <p className="text-lg font-mono font-black text-destructive">{riskPercentage}%</p>
                  </div>
                  <div className="text-center px-4">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                        <BadgeCheck className="h-3 w-3" /> Max Risk
                      </p>
                      <p className="text-lg font-mono font-black text-primary">₹<AnimatedCounter value={maxRiskPerTrade} /></p>
                  </div>
               </div>
               <Button variant="outline" size="lg" className="h-14 px-6 font-bold" onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="mr-2" />
                  Configure Risk
                </Button>
            </div>
          </header>

          <div className="flex items-center gap-3 mb-8 bg-card border-2 p-2 rounded-2xl shadow-sm max-w-xl">
              <div className="flex-1">
                <Combobox
                  options={uniqueStockOptions}
                  value={selectedSymbol || ""}
                  onChange={handleSymbolSelect}
                  placeholder="Type to search your watchlist..."
                  searchPlaceholder="Search stocks..."
                />
              </div>
              {selectedSymbol && (
                  <Button variant="ghost" size="icon" onClick={clearSelection} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                      <X className="h-5 w-5" />
                  </Button>
              )}
          </div>

          {selectedSymbol ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start animate-fade-in">
              {/* LEFT COLUMN: TABLE AND LEVELS */}
              <div className="xl:col-span-8 space-y-8">
                <PositionSizingTable
                  trades={selectedStockTrades}
                  stockSymbol={selectedSymbol}
                  currentPrice={currentPrice}
                  isLoading={isLoading}
                  selectedTradeId={selectedTradeId}
                  onTradeSelect={setSelectedTradeId}
                />
                
                {selectedTrade && (
                  <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <QuickLevelsCalculator trade={selectedTrade} currentPrice={currentPrice} />
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: CALCULATION RESULTS */}
              <div className="xl:col-span-4 space-y-6 sticky top-8">
                {selectedTrade ? (
                  <Card className="border-2 border-primary/20 shadow-2xl overflow-hidden">
                      <div className="bg-primary p-4 text-primary-foreground flex justify-between items-center">
                          <h3 className="font-black uppercase tracking-widest text-sm">Calculation Summary</h3>
                          <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30">
                            {selectedSymbol}
                          </Badge>
                      </div>
                      <CardContent className="p-8 space-y-8 bg-primary/5">
                          <div className="text-center space-y-2">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantity to Trade</h4>
                              <div className="font-mono text-7xl font-black text-primary tracking-tighter">
                                  <AnimatedCounter value={quantityToTradeCurrent} precision={0} />
                              </div>
                              <p className="text-xs text-muted-foreground font-medium">Units based on current price</p>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                              <CalculationResult 
                                label="Current Market Price" 
                                value={currentPrice || 0} 
                                prefix="₹" 
                              />
                              <CalculationResult 
                                label="Risk per Share" 
                                value={perShareRiskCurrent} 
                                prefix="₹" 
                                variant={perShareRiskCurrent > 0 ? 'destructive' : 'neutral'}
                              />
                              <CalculationResult 
                                label="Total Position Value" 
                                value={positionValueCurrent} 
                                prefix="₹" 
                              />
                              
                              <div className="mt-4 pt-6 border-t border-dashed">
                                  <div className="flex items-center justify-between mb-2">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Capital Allocation</span>
                                      <span className="text-xs font-bold text-primary">{capitalAllocatedPercentageCurrent.toFixed(2)}%</span>
                                  </div>
                                  <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full transition-all duration-1000 ${capitalAllocatedPercentageCurrent > maxCapitalPercentage ? 'bg-destructive' : 'bg-success'}`}
                                        style={{ width: `${Math.min(capitalAllocatedPercentageCurrent, 100)}%` }}
                                      />
                                  </div>
                                  <p className="text-[9px] text-muted-foreground mt-2 italic">
                                      {capitalAllocatedPercentageCurrent > maxCapitalPercentage 
                                        ? `⚠️ Exceeds your ${maxCapitalPercentage}% limit` 
                                        : `✅ Within your ${maxCapitalPercentage}% risk limit`}
                                  </p>
                              </div>
                          </div>
                      </CardContent>
                  </Card>
                ) : (
                  <Card className="h-[400px] flex items-center justify-center border-dashed border-2 bg-muted/5">
                      <div className="text-center space-y-2 opacity-50">
                        <ArrowRightLeft className="h-10 w-10 mx-auto text-primary" />
                        <p className="text-sm font-bold uppercase tracking-widest">Select a trade record<br/>to calculate size</p>
                      </div>
                  </Card>
                )}
              </div>
            </div>
          ) : (
             <div className="flex h-96 flex-col items-center justify-center rounded-2xl border-4 border-dashed border-muted bg-muted/5 p-12 text-center">
                <Scaling className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-2xl font-headline font-bold text-muted-foreground">Terminal Idle</h3>
                <p className="text-muted-foreground max-w-xs mt-2">
                    Search and select a stock from your watchlist to begin professional risk assessment.
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
}

function CalculationResult({ label, value, prefix = "", variant = 'neutral' }: { label: string, value: number, prefix?: string, variant?: 'neutral' | 'destructive' | 'success' }) {
    return (
        <div className="flex items-center justify-between p-4 rounded-xl border bg-background shadow-sm group hover:border-primary/30 transition-colors">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
            <span className={`font-mono text-sm font-bold ${variant === 'destructive' ? 'text-destructive' : variant === 'success' ? 'text-success' : 'text-primary'}`}>
                {prefix}<AnimatedCounter value={value} />
            </span>
        </div>
    )
}
