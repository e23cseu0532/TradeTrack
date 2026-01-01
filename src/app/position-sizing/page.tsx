
"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { StockRecord } from "@/app/types/trade";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import AppLayout from "@/components/AppLayout";
import { Scaling, Settings, Search, X } from "lucide-react";
import PositionSizingTable from "@/components/PositionSizingTable";
import RiskSettingsDialog from "@/components/RiskSettingsDialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


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

  // Check for symbol in URL on initial load
  useEffect(() => {
    const symbolFromParams = searchParams.get('symbol');
    if (symbolFromParams) {
      setSelectedSymbol(symbolFromParams);
    }
  }, [searchParams]);

  // Handle symbol selection from combobox
  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    router.push(`/position-sizing?symbol=${symbol}`, { scroll: false });
  };
  
  // Clear selection
  const clearSelection = () => {
      setSelectedSymbol(null);
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
            <PositionSizingTable
              trades={selectedStockTrades}
              stockSymbol={selectedSymbol}
              isLoading={tradesLoading}
              riskPercentage={riskPercentage}
            />
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
}
