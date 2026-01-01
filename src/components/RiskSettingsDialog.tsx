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
import type { UserSettings } from "@/app/position-sizing/page";

type RiskSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  settingsDocRef: DocumentReference | null;
  userSettings: UserSettings | null;
};

export default function RiskSettingsDialog({
  isOpen,
  onOpenChange,
  settingsDocRef,
  userSettings
}: RiskSettingsDialogProps) {
  const [riskPercentage, setRiskPercentage] = useState(1);
  const [capital, setCapital] = useState(0);
  const [maxCapitalPercentagePerTrade, setMaxCapitalPercentagePerTrade] = useState(12);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // To prevent hydration errors, we only set the state from props
    // after the component has mounted on the client.
    if (isOpen && userSettings) {
        setRiskPercentage(userSettings.riskPercentage ?? 1);
        setCapital(userSettings.capital ?? 0);
        setMaxCapitalPercentagePerTrade(userSettings.maxCapitalPercentagePerTrade ?? 12);
    } else if (isOpen) {
        // If there are no settings, reset to default when dialog opens
        setRiskPercentage(1);
        setCapital(0);
        setMaxCapitalPercentagePerTrade(12);
    }
  }, [userSettings, isOpen]);

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
      const newSettings = { 
        riskPercentage: Number(riskPercentage),
        capital: Number(capital),
        maxCapitalPercentagePerTrade: Number(maxCapitalPercentagePerTrade)
      };

      await setDoc(settingsDocRef, newSettings, { merge: true });
      toast({
        title: "Settings Saved",
        description: `Your risk management settings have been updated.`,
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
            Risk Management
          </DialogTitle>
          <DialogDescription>
            Define your capital and risk tolerance for trade calculations.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid items-center gap-2">
            <Label htmlFor="capital">Total Capital</Label>
            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                <Input
                    id="capital"
                    type="number"
                    value={capital}
                    onChange={(e) => setCapital(Number(e.target.value))}
                    className="pl-7"
                />
            </div>
          </div>
          <div className="grid items-center gap-2">
            <Label htmlFor="risk-percentage">% Loss Per Trade</Label>
            <div className="relative">
                <Input
                    id="risk-percentage"
                    type="number"
                    value={riskPercentage}
                    onChange={(e) => setRiskPercentage(Number(e.target.value))}
                    className="pr-8"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">%</span>
            </div>
          </div>
          <div className="grid items-center gap-2">
            <Label htmlFor="max-capital-percentage">Max % Capital Per Trade</Label>
            <div className="relative">
                <Input
                    id="max-capital-percentage"
                    type="number"
                    value={maxCapitalPercentagePerTrade}
                    onChange={(e) => setMaxCapitalPercentagePerTrade(Number(e.target.value))}
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
