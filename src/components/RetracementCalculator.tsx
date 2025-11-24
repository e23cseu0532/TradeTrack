
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type RetracementLevel = {
    percentage: string;
    level: number;
};

export default function RetracementCalculator() {
    const [startPrice, setStartPrice] = useState("");
    const [endPrice, setEndPrice] = useState("");
    const [levels, setLevels] = useState<RetracementLevel[]>([]);
    const { toast } = useToast();

    const handleCalculate = () => {
        const start = parseFloat(startPrice);
        const end = parseFloat(endPrice);

        if (isNaN(start) || isNaN(end)) {
            toast({ variant: "destructive", title: "Error", description: "Please enter valid start and end prices." });
            return;
        }

        const diff = end - start;
        const standardLevels = [0, 23.6, 38.2, 50.0, 61.8, 78.6, 100];
        const calculatedLevels = standardLevels.map(p => ({
            percentage: `${p.toFixed(1)}%`,
            level: start + diff * (p / 100),
        }));

        setLevels(calculatedLevels);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="startPrice">Start Price</label>
                    <Input
                        id="startPrice"
                        type="number"
                        placeholder="e.g., 100.00"
                        value={startPrice}
                        onChange={(e) => setStartPrice(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="endPrice">End Price</label>
                    <Input
                        id="endPrice"
                        type="number"
                        placeholder="e.g., 150.00"
                        value={endPrice}
                        onChange={(e) => setEndPrice(e.target.value)}
                    />
                </div>
            </div>
            <Button onClick={handleCalculate} className="w-full">
                Calculate Retracement
            </Button>

            {levels.length > 0 && (
                <div className="w-full overflow-hidden rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Percentage</TableHead>
                                <TableHead className="text-right">Level</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {levels.map((level, index) => (
                                <TableRow key={index}>
                                    <TableCell>{level.percentage}</TableCell>
                                    <TableCell className="text-right font-mono">{level.level.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
