"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setDoc, DocumentReference } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { Save, Settings } from "lucide-react";

type RiskSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  currentRiskPercentage: number;
  settingsDocRef: DocumentReference | null;
};

export default function RiskSettingsDialog({
  isOpen,
  onOpenChange,
  currentRiskPercentage,
  settingsDocRef,
}: RiskSettingsDialogProps) {
  const [risk, setRisk] = useState(currentRiskPercentage);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRisk(currentRiskPercentage);
  }, [currentRiskPercentage, isOpen]);

  const handleSave = async () => {
    if (!settingsDocRef) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User not authenticated. Cannot save settings.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(settingsDocRef, { riskPercentage: Number(risk) }, { merge: true });
      toast({
        title: "Settings Saved",
        description: `Your risk per trade has been set to ${risk}%.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Could not save your settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-headline">
            <Settings className="text-primary"/>
            Risk Settings
          </DialogTitle>
          <DialogDescription>
            Define your risk tolerance. This will be used to calculate position sizes.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid items-center gap-2">
            <Label htmlFor="risk-percentage">% Loss Per Trade</Label>
            <div className="relative">
                <Input
                    id="risk-percentage"
                    type="number"
                    value={risk}
                    onChange={(e) => setRisk(Number(e.target.value))}
                    className="pr-8"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
