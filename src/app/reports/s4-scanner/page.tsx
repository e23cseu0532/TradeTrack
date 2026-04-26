
"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Search, ShieldAlert, ExternalLink, ArrowDownCircle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { fnoStocks } from "@/lib/fno-stocks";
import AnimatedCounter from "@/components/AnimatedCounter";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScannedStock {
  name: string;
  symbol: string;
  currentPrice: number;
  s4Level: number;
  high: number;
  low: number;
  pivot: number;
  isTriggered: boolean;
}

export default function S4ScannerPage() {
  const [scannedResults, setScannedResults] = useState<ScannedStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  const calculateS4 = (h: number, l: number, c: number) => {
    const p = (h + l + c) / 3;
    const s3 = l - 2 * (h - p);
    return s3 - (h - l); // Standard Floor Pivot S4 Extension
  };

  const startScan = useCallback(async () => {
    setIsScanning(true);
    setProgress(0);
    setScannedResults([]);
    
    const total = fnoStocks.length;
    const results: ScannedStock[] = [];
    const batchSize = 5;

    for (let i = 0; i < total; i += batchSize) {
      const batch = fnoStocks.slice(i, i + batchSize);
      
      const promises = batch.map(async (stock) => {
        try {
          const res = await fetch(`/api/yahoo-finance?symbol=${stock.symbol}`);
          const data = await res.json();
          
          if (data && data.currentPrice && data.high && data.low) {
            const s4 = calculateS4(data.high, data.low, data.currentPrice);
            const pivot = (data.high + data.low + data.currentPrice) / 3;
            
            return {
              name: stock.name,
              symbol: stock.symbol,
              currentPrice: data.currentPrice,
              s4Level: s4,
              high: data.high,
              low: data.low,
              pivot,
              isTriggered: data.currentPrice <= s4
            };
          }
        } catch (err) {
          console.error(`Failed to scan ${stock.symbol}`, err);
        }
        return null;
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(r => { if(r) results.push(r); });
      
      setProgress(Math.round(((i + batch.length) / total) * 100));
      // Small delay to prevent hitting API rate limits too hard
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setScannedResults(results);
    setIsScanning(false);
    setLastScanTime(new Date());
  }, []);

  const triggeredStocks = scannedResults.filter(s => 
    s.isTriggered && 
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-tight flex items-center gap-3">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              S4 Support Scanner
            </h1>
            <p className="text-muted-foreground">Monitoring 200+ FNO stocks for critical support breakouts.</p>
          </div>
          <div className="flex items-center gap-3">
             {lastScanTime && (
                <span className="text-xs text-muted-foreground hidden sm:block">
                    Last scan: {lastScanTime.toLocaleTimeString()}
                </span>
             )}
             <Button 
                onClick={startScan} 
                disabled={isScanning}
                className={cn("min-w-[140px]", isScanning && "animate-pulse")}
             >
                {isScanning ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {isScanning ? "Scanning..." : "Start Scan"}
             </Button>
          </div>
        </header>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between text-sm font-bold uppercase tracking-wider">
                        <span>Scanning NSE FNO Market...</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 gap-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-headline text-destructive">Triggered Stocks</CardTitle>
                        <CardDescription>
                            Current price is at or below the S4 support level.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filter results..."
                                className="pl-9 h-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">S4 = S3 - (High - Low)</p>
                                    <p className="text-[10px] italic">Deep extension of Standard Floor Pivots.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead>Stock Name</TableHead>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead className="text-right">S4 Level</TableHead>
                                    <TableHead className="text-right">Current Price</TableHead>
                                    <TableHead className="text-right">Difference</TableHead>
                                    <TableHead className="text-center">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {triggeredStocks.length > 0 ? (
                                    triggeredStocks.map((stock) => (
                                        <TableRow key={stock.symbol} className="bg-destructive/5 hover:bg-destructive/10 transition-colors">
                                            <TableCell className="font-semibold">{stock.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="destructive">{stock.symbol}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-destructive">
                                                ₹<AnimatedCounter value={stock.s4Level} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-black">
                                                ₹<AnimatedCounter value={stock.currentPrice} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-destructive">
                                                <div className="flex items-center justify-end gap-1">
                                                    <ArrowDownCircle className="h-3 w-3" />
                                                    {((stock.currentPrice - stock.s4Level) / stock.s4Level * 100).toFixed(2)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button size="sm" variant="outline" asChild className="h-8">
                                                    <Link href={`/reports/${stock.symbol}`}>
                                                        <ExternalLink className="mr-2 h-3 w-3" />
                                                        Details
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                                            {isScanning ? "Scanning the market for opportunities..." : scannedResults.length > 0 ? "No triggered stocks found matching your criteria." : "Start scan to monitor FNO stocks."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {!isScanning && scannedResults.length > 0 && (
                <div className="flex justify-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-destructive" />
                        <span>{triggeredStocks.length} Triggered</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                        <span>{scannedResults.length - triggeredStocks.length} Scanned (Safe)</span>
                    </div>
                </div>
            )}
        </div>
      </main>
    </AppLayout>
  );
}
