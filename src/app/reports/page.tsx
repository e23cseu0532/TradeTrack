"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { Search, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import ReportsTable from "@/components/ReportsTable";
import type { Trade } from "@/app/types/trade";


export default function ReportsPage() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [searchTerm, setSearchTerm] = useState("");
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


  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  
  const filteredTrades = trades.filter((trade) =>
    trade.stockSymbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary">
              Stock Reports
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Analyze your stock performance over a selected period.
            </p>
          </div>
           <Link href="/" passHref>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </header>

        <Card className="shadow-lg mb-8">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Select a date range and search for specific stocks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col md:flex-row gap-4">
              <DatePickerWithRange date={date} setDate={setDate} />
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

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Report Details</CardTitle>
             <CardDescription>
              Displaying stock records for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReportsTable trades={filteredTrades} dateRange={date}/>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
