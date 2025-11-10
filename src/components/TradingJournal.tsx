"use client";

import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  const debouncedContent = useDebounce(localContent, 1500); // 1.5-second debounce delay

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

  // This effect listens for changes in the debounced content and saves to Firestore
  useEffect(() => {
    // Condition 1: Don't save if there's no reference to the document yet.
    if (!journalDocRef || isJournalLoading) {
      return;
    }

    // Condition 2: Don't save if the debounced content is the same as the initial data from Firestore.
    // This prevents saving right after the component loads.
    if (debouncedContent === journalData?.content) {
      return;
    }

    // Do not save if the component has just loaded and the content is empty
    if (!journalData && debouncedContent === "") {
        return;
    }

    const saveJournal = async () => {
      setIsSaving(true);
      try {
        await setDoc(journalDocRef, { content: debouncedContent ?? "" }, { merge: true });
        toast({
            title: "Journal Saved",
            description: "Your notes have been automatically saved.",
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

    saveJournal();
  }, [debouncedContent, journalDocRef, journalData, isJournalLoading]);

  if (isJournalLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="relative">
      <Textarea
        placeholder="Write down your trading thoughts, plans, or reflections..."
        className="h-48 text-base resize-none"
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
      />
      {isSaving && (
        <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
    </div>
  );
}
