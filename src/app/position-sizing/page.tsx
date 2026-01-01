
"use client";

import { useState, useEffect, useMemo } from "react";
import type { StockRecord } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import AppLayout from "@/components/AppLayout";
import { Scaling, Settings, Search } from "lucide-react";
import PositionSizingTable from "@/components/PositionSizingTable";
import RiskSettingsDialog from "@/components/RiskSettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type UserSettings = {
  id: string;
  riskPercentage?: number;
  capital?: number;
  maxCapitalPercentagePerTrade?: number;
};

export default function PositionSizingPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [stockData, setStockData] = useState<StockData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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
  
  const riskPercentage = userSettings?.riskPercentage ?? 1; // Default to 1%
  const capital = userSettings?.capital ?? 0;
  const maxCapitalPercentagePerTrade = userSettings?.maxCapitalPercentagePerTrade ?? 12;


  // Fetch current prices for all unique stocks
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    
    if (tradesList.length > 0) {
      setIsLoading(true);
      const uniqueSymbols = [...new Set(tradesList.map(t => t.stockSymbol))];
      const fetches = uniqueSymbols.map(symbol =>
        fetch(`/api/yahoo-finance?symbol=${symbol}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&to=${new Date().toISOString()}`, { signal })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
          })
          .then(data => ({ symbol, data }))
          .catch(err => {
            if (err.name !== 'AbortError') {
              console.error(`Failed to fetch data for ${symbol}`, err);
              return { symbol, error: true };
            }
          })
      );

      Promise.all(fetches).then(results => {
        const newStockData: StockData = {};
        results.forEach(result => {
          if (result && !('error' in result)) {
            newStockData[result.symbol] = {
              currentPrice: result.data.currentPrice,
              high: result.data.high,
              low: result.data.low,
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

    return () => controller.abort();
  }, [tradesList, tradesLoading]);
  
  const filteredTrades = useMemo(() => {
    if (!searchTerm) return tradesList;
    return tradesList.filter(trade =>
      trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tradesList, searchTerm]);

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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by stock symbol..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
          </header>

          <PositionSizingTable
            trades={filteredTrades}
            stockData={stockData}
            isLoading={isLoading || tradesLoading}
            riskPercentage={riskPercentage}
          />

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
