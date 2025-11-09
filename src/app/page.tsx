"use client";

import { useState } from "react";
import type { Trade } from "@/app/types/trade";
import AddTradeForm from "@/components/AddTradeForm";
import TradesTable from "@/components/TradesTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Coins } from "lucide-react";

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);

  const handleAddTrade = (newTradeData: Omit<Trade, "id" | "dateTime">) => {
    const newTrade: Trade = {
      ...newTradeData,
      id: crypto.randomUUID(),
      dateTime: new Date(),
    };
    setTrades((prevTrades) => [newTrade, ...prevTrades]);
  };

  const handleDeleteTrade = (tradeId: string) => {
    setTrades((prevTrades) => prevTrades.filter((trade) => trade.id !== tradeId));
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 text-center">
          <div className="inline-flex items-center gap-3">
             <Coins className="h-10 w-10 text-primary" />
            <h1 className="text-5xl font-headline font-bold text-primary">
              TradeTrack
            </h1>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">
            Your personal dashboard for tracking stock trades.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Add New Trade</CardTitle>
                <CardDescription>
                  Enter the details of your latest trade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AddTradeForm onAddTrade={handleAddTrade} />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Trade Records</CardTitle>
                 <CardDescription>
                  A history of all your recorded trades.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TradesTable trades={trades} onDeleteTrade={handleDeleteTrade} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
