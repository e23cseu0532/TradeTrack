
"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser, useFirestore, useMemoFirebase, useDoc, useCollection } from "@/firebase";
import { doc, setDoc, collection, updateDoc } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Save, Book, FileText, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StockRecord } from "@/app/types/trade";
import { cn } from "@/lib/utils";

type JournalEntry = {
  id: string;
  content: string;
};

export default function TradingJournal() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [localGeneralContent, setLocalGeneralContent] = useState<string>("");
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
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

  // 2. STOCK SPECIFIC JOURNAL LOGIC
  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);

  const { data: trades, isLoading: isTradesLoading } = useCollection<StockRecord>(stockRecordsCollection);

  const sortedTrades = useMemo(() => {
    if (!trades) return [];
    return [...trades].sort((a, b) => 
      (b.dateTime?.toDate()?.getTime() || 0) - (a.dateTime?.toDate()?.getTime() || 0)
    );
  }, [trades]);

  const selectedTrade = useMemo(() => {
    if (!selectedTradeId || !trades) return null;
    return trades.find(t => t.id === selectedTradeId);
  }, [selectedTradeId, trades]);

  useEffect(() => {
    if (selectedTrade) {
      setLocalTradeNote(selectedTrade.notes || "");
    } else {
      setLocalTradeNote("");
    }
  }, [selectedTrade]);

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

  const handleSaveTradeNote = async () => {
    if (!user || !firestore || !selectedTradeId) return;
    setIsSaving(true);
    try {
      const tradeRef = doc(firestore, `users/${user.uid}/stockRecords`, selectedTradeId);
      await updateDoc(tradeRef, { notes: localTradeNote });
      toast({ title: "Trade Note Saved", description: `Updated note for ${selectedTrade?.stockSymbol}.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Save Failed", description: "Could not update trade note." });
    } finally {
      setIsSaving(false);
    }
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
          Trade Notes
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
            Select Active Entry
            <ChevronRight className="h-3 w-3" />
          </label>
          <Select value={selectedTradeId || ""} onValueChange={setSelectedTradeId}>
            <SelectTrigger className="bg-muted/20 border-primary/10">
              <SelectValue placeholder="Select a trade to view its notes..." />
            </SelectTrigger>
            <SelectContent>
              {sortedTrades.map(trade => (
                <SelectItem key={trade.id} value={trade.id}>
                  {trade.stockSymbol} Entry at ₹{trade.entryPrice} ({trade.dateTime?.toDate().toLocaleDateString()})
                </SelectItem>
              ))}
              {sortedTrades.length === 0 && <p className="p-2 text-xs text-muted-foreground">No active trades found.</p>}
            </SelectContent>
          </Select>
        </div>

        {selectedTradeId ? (
          <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
            <Textarea
              placeholder={`My thoughts on ${selectedTrade?.stockSymbol} trade...`}
              className="h-32 text-sm resize-none bg-muted/20 border-primary/10"
              value={localTradeNote}
              onChange={(e) => setLocalTradeNote(e.target.value)}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={handleSaveTradeNote} disabled={isSaving} className="font-bold">
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Update Note"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/5 opacity-50">
            <p className="text-xs text-muted-foreground italic">Select a trade from the menu above to start journaling.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
