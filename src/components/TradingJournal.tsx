
"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection } from "@/firebase";
import { doc, setDoc, collection } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Save, Book, FileText, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StockRecord } from "@/app/types/trade";

type JournalEntry = {
  id: string;
  content: string;
};

export default function TradingJournal() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [localGeneralContent, setLocalGeneralContent] = useState<string>("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [localTradeNote, setLocalTradeNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // 1. GENERAL JOURNAL LOGIC
  const journalDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, `users/${user.uid}/journal/main`);
  }, [user, firestore]);

  const { data: journalData, isLoading: isJournalLoading } = useDoc<JournalEntry>(journalDocRef);

  useEffect(() => {
    if (journalData) setLocalGeneralContent(journalData.content);
  }, [journalData]);

  // 2. SYMBOL-BASED JOURNAL LOGIC
  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);

  const { data: trades, isLoading: isTradesLoading } = useCollection<StockRecord>(stockRecordsCollection);

  // Unique symbols for selection
  const uniqueSymbols = useMemo(() => {
    if (!trades) return [];
    return Array.from(new Set(trades.map(t => t.stockSymbol))).sort();
  }, [trades]);

  // Find latest note for selected symbol
  useEffect(() => {
    if (selectedSymbol && trades) {
      const latestEntry = trades
        .filter(t => t.stockSymbol === selectedSymbol)
        .sort((a, b) => (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0))[0];
      
      setLocalTradeNote(latestEntry?.notes || "");
    } else {
      setLocalTradeNote("");
    }
  }, [selectedSymbol, trades]);

  const handleSaveGeneral = async () => {
    if (!journalDocRef) return;
    setIsSaving(true);
    try {
      await setDoc(journalDocRef, { content: localGeneralContent, updatedAt: new Date().toISOString() }, { merge: true });
      toast({ title: "General Journal Saved", description: "Your strategy notes are updated." });
    } catch (error) {
      toast({ variant: "destructive", title: "Save Failed", description: "Could not save notes." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTradeNote = () => {
    if (!user || !firestore || !selectedSymbol || !trades) return;
    setIsSaving(true);
    
    // SYNC: Update all entries for this symbol
    const tradesToUpdate = trades.filter(t => t.stockSymbol === selectedSymbol);
    
    tradesToUpdate.forEach(t => {
        const tradeRef = doc(firestore, `users/${user.uid}/stockRecords`, t.id);
        updateDocumentNonBlocking(tradeRef, { notes: localTradeNote });
    });

    setIsSaving(false);
    toast({ title: "Thesis Synced", description: `Notes for ${selectedSymbol} updated across all entries.` });
  };

  if (isJournalLoading || isTradesLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="general" className="flex items-center gap-2">
          <Book className="h-4 w-4" />
          General Strategy
        </TabsTrigger>
        <TabsTrigger value="watchlist" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Stock Theses
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4 animate-in fade-in-50">
        <Textarea
          placeholder="Daily strategy, market sentiment, or broad plans..."
          className="h-48 text-sm resize-none bg-muted/20 border-primary/10"
          value={localGeneralContent}
          onChange={(e) => setLocalGeneralContent(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSaveGeneral} disabled={isSaving} className="font-bold">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Strategy"}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="watchlist" className="space-y-4 animate-in fade-in-50">
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Select Stock Symbol
            <ChevronRight className="h-3 w-3" />
          </label>
          <Select value={selectedSymbol || ""} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="bg-muted/20 border-primary/10">
              <SelectValue placeholder="Select a stock to view thesis..." />
            </SelectTrigger>
            <SelectContent>
              {uniqueSymbols.map(sym => (
                <SelectItem key={sym} value={sym}>
                  {sym}
                </SelectItem>
              ))}
              {uniqueSymbols.length === 0 && <p className="p-2 text-xs text-muted-foreground">No active trades found.</p>}
            </SelectContent>
          </Select>
        </div>

        {selectedSymbol ? (
          <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
            <Textarea
              placeholder={`Shared thesis for all ${selectedSymbol} entries...`}
              className="h-32 text-sm resize-none bg-muted/20 border-primary/10"
              value={localTradeNote}
              onChange={(e) => setLocalTradeNote(e.target.value)}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={handleSaveTradeNote} disabled={isSaving} className="font-bold">
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save & Sync Symbol"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/5 opacity-50">
            <p className="text-xs text-muted-foreground italic">Select a stock to manage its shared thesis.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
