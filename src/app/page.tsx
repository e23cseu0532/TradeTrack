"use client";

import { useState, useEffect } from "react";
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
import { Coins, BarChart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function Home() {
  const [trades, setTrades] = useState<Trade[]>([]);

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

  const handleAddTrade = (newTradeData: Omit<Trade, "id" | "dateTime">) => {
    const newTrade: Trade = {
      ...newTradeData,
      id: crypto.randomUUID(),
      dateTime: new Date(),
    };
    const updatedTrades = [newTrade, ...trades];
    setTrades(updatedTrades);
    localStorage.setItem("trades", JSON.stringify(updatedTrades));
  };

  const handleDeleteTrade = (tradeId: string) => {
    const updatedTrades = trades.filter((trade) => trade.id !== tradeId);
    setTrades(updatedTrades);
    localStorage.setItem("trades", JSON.stringify(updatedTrades));
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 text-center">
          <div className="inline-flex items-center gap-3">
             <Coins className="h-10 w-10 text-primary" />
            <h1 className="text-5xl font-headline font-bold text-primary">
              StockTracker
            </h1>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">
            Your personal dashboard for tracking stocks.
          </p>
        </header>

        <div className="flex justify-end mb-4">
          <Link
            href="/reports"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <BarChart className="mr-2 h-4 w-4" />
            View Reports
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Add New Stock</CardTitle>
                <CardDescription>
                  Enter the details of a stock to track.
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
                <CardTitle className="text-2xl">Stock Records</CardTitle>
                 <CardDescription>
                  A history of all your tracked stocks.
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
