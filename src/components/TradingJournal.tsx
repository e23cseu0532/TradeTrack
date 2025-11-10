"use client";

import { useState, useEffect } from "react";
import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type JournalEntry = {
  id: string;
  content: string;
};

export default function TradingJournal() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [localContent, setLocalContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Define a stable document reference for the user's journal
  const journalDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    // We use a fixed ID 'main' since each user has only one journal
    return doc(firestore, `users/${user.uid}/journal/main`);
  }, [user, firestore]);

  const { data: journalData, isLoading: isJournalLoading } = useDoc<JournalEntry>(journalDocRef);

  // When journal data is loaded from Firestore, update the local state
  useEffect(() => {
    if (journalData) {
      setLocalContent(journalData.content);
    }
  }, [journalData]);

  const handleSave = async () => {
    if (!journalDocRef) return;

    setIsSaving(true);
    try {
      await setDoc(journalDocRef, { content: localContent }, { merge: true });
      toast({
        title: "Journal Saved",
        description: "Your notes have been successfully saved.",
      });
    } catch (error) {
      console.error("Failed to save journal:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not save your notes. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isJournalLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="relative space-y-4">
      <Textarea
        placeholder="Write down your trading thoughts, plans, or reflections..."
        className="h-48 text-base resize-none"
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Journal
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
