
"use client";

import { useState, useEffect, useMemo } from "react";
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
import { BookOpen, ChevronsUpDown, History, LayoutGrid, Clock, ArrowRight, PlusCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUser, useFirestore, useCollection, useAuth, useMemoFirebase } from "@/firebase";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { initiateAnonymousSignIn } from "@/firebase/non-blocking-login";
import { addDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import TradingJournal from "@/components/TradingJournal";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { format } from "date-fns";

export default function Home() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const auth = useAuth();
  const [isJournalOpen, setIsJournalOpen] = useState(true);

  useEffect(() => {
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
    
    const tradeDataForFirestore: { [key: string]: any } = { ...newTradeData };
    Object.keys(tradeDataForFirestore).forEach(key => {
      if (tradeDataForFirestore[key] === undefined) {
        delete tradeDataForFirestore[key];
      }
    });
    
    const newTrade = {
      ...tradeDataForFirestore,
      dateTime: serverTimestamp(),
    };

    addDocumentNonBlocking(stockRecordsCollection, newTrade);
  };

  const handleDeleteTrade = (tradeId: string) => {
    if (!user || !firestore) return;
    const tradeDocRef = doc(firestore, `users/${user.uid}/stockRecords`, tradeId);
    deleteDocumentNonBlocking(tradeDocRef);
  };

  const sortedTrades = useMemo(() => {
    if (!trades) return [];
    return [...trades].sort((a, b) => 
      (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
    );
  }, [trades]);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* HEADER */}
        <header className="animate-fade-in-down">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tighter">
                Trade Central
              </h1>
              <p className="text-sm text-muted-foreground font-medium">
                Real-time stock entry and portfolio management.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-muted/30 px-4 py-2 rounded-full border">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold tabular-nums">
                    {format(new Date(), "eeee, MMM do")}
                </span>
            </div>
          </div>
        </header>

        {/* HORIZONTAL ADD PANEL */}
        <Card className="border-2 border-primary/10 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <LayoutGrid className="h-24 w-24" />
          </div>
          <CardHeader className="bg-muted/30 border-b pb-4">
             <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-primary" />
                Quick Stock Entry
             </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <AddTradeForm onAddTrade={handleAddTrade} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: JOURNAL */}
          <div className="lg:col-span-4 space-y-6">
             <Card className="shadow-lg border-primary/5">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                     <CardTitle className="flex items-center gap-2 text-lg font-headline">
                        <BookOpen className="text-primary h-5 w-5" />
                        Trading Journal
                      </CardTitle>
                      <Button variant="ghost" size="icon" onClick={() => setIsJournalOpen(!isJournalOpen)}>
                          <ChevronsUpDown className="h-4 w-4" />
                      </Button>
                  </div>
                </CardHeader>
                <Collapsible open={isJournalOpen}>
                  <CollapsibleContent className="animate-accordion-down">
                    <CardContent>
                      <TradingJournal />
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
             </Card>
          </div>

          {/* RIGHT: RECENT ACTIVITY SLIDER */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    Recent Activity
                </h3>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="link" className="text-xs font-bold gap-1 group">
                            View All History
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="sm:max-w-4xl overflow-y-auto">
                        <SheetHeader className="mb-6">
                            <SheetTitle className="text-2xl font-headline flex items-center gap-2">
                                <History className="text-primary" />
                                Full Trade History
                            </SheetTitle>
                            <SheetDescription>
                                Manage and review every stock record in your portfolio.
                            </SheetDescription>
                        </SheetHeader>
                        <TradesTable trades={trades || []} onDeleteTrade={handleDeleteTrade} isLoading={tradesLoading || isUserLoading} />
                    </SheetContent>
                </Sheet>
            </div>

            {sortedTrades.length > 0 ? (
                <div className="px-10">
                     <Carousel className="w-full">
                        <CarouselContent className="-ml-4">
                            {sortedTrades.slice(0, 8).map((trade) => (
                                <CarouselItem key={trade.id} className="pl-4 basis-full md:basis-1/2 lg:basis-1/3">
                                    <Card className="hover:border-primary/50 transition-all cursor-pointer group bg-card/50 backdrop-blur-sm">
                                        <CardContent className="p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="secondary" className="font-bold tracking-tight">
                                                    {trade.stockSymbol}
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {trade.dateTime ? format(trade.dateTime.toDate(), "dd MMM") : "--"}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <p className="text-muted-foreground font-medium">Entry</p>
                                                    <p className="font-bold font-mono">₹{trade.entryPrice}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-muted-foreground font-medium">Target</p>
                                                    <p className="font-bold font-mono text-success">₹{trade.targetPrice1}</p>
                                                </div>
                                            </div>
                                            <div className="pt-2 border-t flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <p className="text-[10px] text-destructive font-black uppercase">SL: ₹{trade.stopLoss}</p>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] uppercase font-bold" asChild>
                                                    <a href={`/reports/${trade.stockSymbol}`}>Details</a>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <CarouselPrevious />
                        <CarouselNext />
                    </Carousel>
                </div>
            ) : (
                <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/10">
                    <p className="text-muted-foreground text-sm font-medium">No recent trades found.</p>
                </div>
            )}
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
