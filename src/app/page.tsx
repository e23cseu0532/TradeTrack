
"use client";

import { useState, useEffect, Suspense } from "react";
import type { StockRecord } from "@/app/types/trade";
import AddTradeForm from "@/components/AddTradeForm";
import TradesTable from "@/components/TradesTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart, BookOpen, ChevronsUpDown, Calculator } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useAuth, useMemoFirebase } from "@/firebase";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { initiateAnonymousSignIn } from "@/firebase/non-blocking-login";
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import TradingJournal from "@/components/TradingJournal";
import { Button } from "@/components/ui/button";
import Coin3D from "@/components/Coin3D";
import { Skeleton } from "@/components/ui/skeleton";


export default function Home() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
  const [isJournalOpen, setIsJournalOpen] = useState(false);

  useEffect(() => {
    // Automatically sign in the user anonymously if not already logged in
    if (!isUserLoading && !user) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  
  const { data: trades, isLoading: tradesLoading } = useCollection<StockRecord>(stockRecordsCollection);

  const handleAddTrade = (newTradeData: Omit<StockRecord, "id" | "dateTime">) => {
    if (!stockRecordsCollection) return;
    const newTrade = {
      ...newTradeData,
      dateTime: serverTimestamp(), // Use server timestamp for consistency
    };
    addDocumentNonBlocking(stockRecordsCollection, newTrade);
  };

  const handleDeleteTrade = (tradeId: string) => {
    if (!user || !firestore) return;
    const tradeDocRef = doc(firestore, `users/${user.uid}/stockRecords`, tradeId);
    deleteDocumentNonBlocking(tradeDocRef);
  };

  return (
    <main className="min-h-screen bg-background animate-fade-in">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="mb-10 text-center animate-fade-in-down">
          <div className="inline-flex items-center gap-3">
             <Suspense fallback={<Skeleton className="h-10 w-10 rounded-full" />}>
                <Coin3D />
             </Suspense>
            <h1 className="text-5xl font-headline font-bold text-primary">
              StockTracker
            </h1>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">
            Your personal dashboard for tracking stocks.
          </p>
        </header>

        <div className="flex justify-end mb-4 animate-fade-in gap-2">
           <Link
            href="/calculators"
            className={cn(buttonVariants({ variant: "outline" }), "transition-transform duration-300 ease-in-out hover:scale-105")}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculators
          </Link>
           <Link
            href="/reports"
            className={cn(buttonVariants({ variant: "default" }), "transition-transform duration-300 ease-in-out hover:scale-105")}
          >
            <BarChart className="mr-2 h-4 w-4" />
            View Watchlist
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-8">
            <Card className="transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
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

            <Collapsible open={isJournalOpen} onOpenChange={setIsJournalOpen} asChild>
              <Card className="transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
                  <CollapsibleTrigger asChild>
                    <div className="flex cursor-pointer items-center justify-between p-6">
                      <div className="flex flex-col space-y-1.5">
                        <CardTitle className="flex items-center gap-2">
                          <BookOpen className="text-primary" />
                          Trading Journal
                        </CardTitle>
                        <CardDescription>
                          Your central place for all trading thoughts, strategies, and reflections.
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
          </div>

          <div className="lg:col-span-2">
            <Card className="transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
              <CardHeader>
                <CardTitle className="text-2xl">Stock Records</CardTitle>
                 <CardDescription>
                  A history of all your tracked stocks.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TradesTable trades={trades || []} onDeleteTrade={handleDeleteTrade} isLoading={tradesLoading || isUserLoading} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
