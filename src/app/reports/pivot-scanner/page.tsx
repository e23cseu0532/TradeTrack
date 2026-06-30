
"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    RefreshCw, 
    Search, 
    ShieldAlert, 
    Layers, 
    Calendar, 
    Target, 
    Zap, 
    ChevronRight, 
    Upload, 
    Database, 
    Filter,
    Activity,
    Trash2,
    RotateCcw,
    Plus,
    Terminal
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fnoStocks } from "@/lib/fno-stocks";
import { NIFTY_50, NIFTY_NEXT_50, MIDCAP_SELECT, MIDCAP_150_CORE } from "@/lib/indices";
import AnimatedCounter from "@/components/AnimatedCounter";
import { cn } from "@/lib/utils";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, deleteDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { StockRecord } from "@/app/types/trade";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

type ScannerTimeframe = 'daily' | 'weekly' | 'monthly';

interface MarketIndex {
    id: string;
    name: string;
    symbols: string[];
    isSystem: boolean;
}

interface PivotMatrixStock {
  symbol: string;
  name: string;
  currentPrice: number;
  lowerLevel: { label: string; value: number };
  upperLevel: { label: string; value: number };
  zone: string;
}

interface ScanCache {
    [key: string]: {
        data: PivotMatrixStock[];
        timestamp: number;
    }
}

const CACHE_EXPIRY = 180000; // 180 seconds (3 mins)

const SYSTEM_DEFAULTS: { [key: string]: { name: string, symbols: string[] } } = {
    fno: { name: "FNO List", symbols: fnoStocks.map(s => s.symbol) },
    nifty50: { name: "Nifty 50", symbols: NIFTY_50 },
    niftynext50: { name: "Nifty Next 50", symbols: NIFTY_NEXT_50 },
    midcapselect: { name: "Midcap Select", symbols: MIDCAP_SELECT },
    midcap150: { name: "Midcap 150", symbols: MIDCAP_150_CORE },
};

export default function PivotScannerPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [timeframe, setTimeframe] = useState<ScannerTimeframe>('monthly');
  const [activeTab, setActiveTab] = useState("watchlist");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [customInput, setCustomInput] = useState("");
  
  const [results, setResults] = useState<PivotMatrixStock[]>([]);
  const cacheRef = useRef<ScanCache>({});

  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  const { data: trades } = useCollection<StockRecord>(stockRecordsCollection);

  const watchlistSymbols = useMemo(() => {
    if (!trades) return [];
    return Array.from(new Set(trades.map(t => t.stockSymbol)));
  }, [trades]);

  const marketIndicesCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/marketIndices`);
  }, [user, firestore]);
  const { data: userIndices } = useCollection<MarketIndex>(marketIndicesCollection);

  const allAvailableIndices = useMemo(() => {
    const list: MarketIndex[] = [];
    
    Object.keys(SYSTEM_DEFAULTS).forEach(id => {
        const override = userIndices?.find(ui => ui.id === id);
        list.push({
            id,
            name: SYSTEM_DEFAULTS[id].name,
            symbols: override?.symbols || SYSTEM_DEFAULTS[id].symbols,
            isSystem: true
        });
    });

    userIndices?.forEach(ui => {
        if (!SYSTEM_DEFAULTS[ui.id]) {
            list.push({ ...ui, isSystem: false });
        }
    });

    return list;
  }, [userIndices]);

  const calculateMatrix = (symbol: string, name: string, h: number, l: number, c: number, current: number, prevClose: number) => {
    const range = h - l;
    const p = (h + l + prevClose) / 3;
    
    const levels = [
        { label: 'S5', value: prevClose - (range * 1.1) },
        { label: 'S4', value: prevClose - (range * 1.1 / 2) },
        { label: 'S3', value: prevClose - (range * 1.1 / 4) },
        { label: 'S2', value: prevClose - (range * 1.1 / 6) },
        { label: 'S1', value: prevClose - (range * 1.1 / 12) },
        { label: 'Pivot', value: p },
        { label: 'R1', value: prevClose + (range * 1.1 / 12) },
        { label: 'R2', value: prevClose + (range * 1.1 / 6) },
        { label: 'R3', value: prevClose + (range * 1.1 / 4) },
        { label: 'R4', value: prevClose + (range * 1.1 / 2) },
        { label: 'R5', value: prevClose + (range * 1.1) },
    ].sort((a, b) => a.value - b.value);

    let lower = levels[0];
    let upper = levels[levels.length - 1];

    for (let i = 0; i < levels.length - 1; i++) {
        if (current >= levels[i].value && current <= levels[i + 1].value) {
            lower = levels[i];
            upper = levels[i + 1];
            break;
        }
    }

    if (current > levels[levels.length - 1].value) {
        lower = levels[levels.length - 1];
        upper = { label: 'SKY', value: levels[levels.length - 1].value * 1.1 };
    }
    if (current < levels[0].value) {
        lower = { label: 'FLOOR', value: levels[0].value * 0.9 };
        upper = levels[0];
    }

    return {
        symbol,
        name,
        currentPrice: current,
        lowerLevel: lower,
        upperLevel: upper,
        zone: `${lower.label} - ${upper.label}`
    };
  };

  const getTargetSymbols = useCallback(() => {
    if (activeTab === 'watchlist') return watchlistSymbols;
    if (activeTab === 'custom') return customInput.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    
    const index = allAvailableIndices.find(idx => idx.id === activeTab);
    return index?.symbols || [];
  }, [activeTab, watchlistSymbols, allAvailableIndices, customInput]);

  const runScanner = useCallback(async (force = false) => {
    const symbols = getTargetSymbols();
    if (symbols.length === 0) {
        setResults([]);
        return;
    }

    const cacheKey = `${activeTab}_${timeframe}`;
    const cached = cacheRef.current[cacheKey];

    if (!force && cached && (Date.now() - cached.timestamp < CACHE_EXPIRY)) {
        setResults(cached.data);
        return;
    }

    setIsScanning(true);
    setProgress(0);
    setResults([]);

    const total = symbols.length;
    const batchSize = 4;
    const scanData: PivotMatrixStock[] = [];

    for (let i = 0; i < total; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(async (symbol) => {
            try {
                const res = await fetch(`/api/yahoo-finance?symbol=${symbol}&timeframe=${timeframe}`);
                const data = await res.json();
                if (data && data.currentPrice) {
                    return calculateMatrix(symbol, symbol, data.high, data.low, data.currentPrice, data.currentPrice, data.previousClose);
                }
            } catch (e) { return null; }
            return null;
        });

        const batchResults = await Promise.all(promises);
        batchResults.forEach(r => { if (r) scanData.push(r); });
        
        setResults([...scanData]);
        setProgress(Math.round(((i + batch.length) / total) * 100));
        await new Promise(r => setTimeout(r, 200));
    }

    cacheRef.current[cacheKey] = {
        data: scanData,
        timestamp: Date.now()
    };

    setIsScanning(false);
  }, [activeTab, timeframe, getTargetSymbols]);

  useEffect(() => {
    runScanner();
  }, [activeTab, timeframe, runScanner]);

  const handleSyncCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !firestore) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const symbols: string[] = [];
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const symbolIdx = headers.indexOf('symbol');

        if (symbolIdx === -1) {
            toast({ variant: "destructive", title: "Invalid CSV", description: "Could not find a 'Symbol' column." });
            return;
        }

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const sym = cols[symbolIdx]?.trim();
            if (sym && sym !== "") symbols.push(sym);
        }

        if (symbols.length > 0) {
            const indexId = activeTab;
            const indexName = allAvailableIndices.find(idx => idx.id === indexId)?.name || indexId;
            
            const indexRef = doc(firestore, `users/${user.uid}/marketIndices`, indexId);
            await setDoc(indexRef, {
                id: indexId,
                name: indexName,
                symbols: symbols,
                isSystem: !!SYSTEM_DEFAULTS[indexId],
                updatedAt: serverTimestamp()
            }, { merge: true });

            toast({ title: "Sync Successful", description: `Updated ${indexName} with ${symbols.length} symbols. Saved to profile.` });
            runScanner(true);
        }
    };
    reader.readAsText(file);
  };

  const saveCustomAsIndex = async () => {
      const symbols = getTargetSymbols();
      if (symbols.length === 0 || !user || !firestore) return;

      const name = prompt("Enter a name for this custom index:");
      if (!name) return;

      const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const indexRef = doc(firestore, `users/${user.uid}/marketIndices`, id);
      
      await setDoc(indexRef, {
          id,
          name,
          symbols,
          isSystem: false,
          createdAt: serverTimestamp()
      });

      toast({ title: "Index Created", description: `${name} has been added to your persistent scanner.` });
      setActiveTab(id);
  };

  const filteredResults = results.filter(s => s.symbol.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-down">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl border border-primary/20">
                <Layers className="h-8 w-8 text-primary" />
            </div>
            <div>
                <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tight">
                Pivot Matrix Scanner
                </h1>
                <p className="text-muted-foreground font-medium flex items-center gap-2">
                    <Activity className="h-3 w-3 text-success" />
                    Multi-Index Breakout Terminal
                </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 bg-card p-2 rounded-2xl border shadow-sm">
             <div className="flex items-center gap-2 px-3 border-r pr-4">
                <span className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> TV Context
                </span>
                <Select value={timeframe} onValueChange={(val: ScannerTimeframe) => setTimeframe(val)}>
                    <SelectTrigger className="w-56 h-9 font-bold uppercase text-[10px] border-primary/20 bg-background shadow-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="monthly">Monthly (Daily Charts)</SelectItem>
                        <SelectItem value="weekly">Weekly (Hourly Charts)</SelectItem>
                        <SelectItem value="daily">Daily (5m Charts)</SelectItem>
                    </SelectContent>
                </Select>
             </div>
             <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search results..." 
                    className="pl-9 h-9 text-xs bg-muted/20" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                />
             </div>
             <Button 
                variant="outline"
                size="sm"
                onClick={() => runScanner(true)} 
                disabled={isScanning}
                className="h-9 px-4 font-bold border-2"
             >
                <RefreshCw className={cn("mr-2 h-4 w-4", isScanning && "animate-spin")} />
                Force Refresh
             </Button>
          </div>
        </header>

        {isScanning && (
            <Card className="border-primary/20 bg-primary/5 shadow-inner">
                <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-primary">
                        <span className="flex items-center gap-2">
                            <Zap className="h-3 w-3 animate-pulse" />
                            Analyzing Market Grid...
                        </span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                </CardContent>
            </Card>
        )}

        {/* WATCHLIST MATRIX */}
        <Card className="border-2 border-primary/10 shadow-xl overflow-hidden bg-card/50 backdrop-blur-md">
            <CardHeader className="bg-primary/5 border-b py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm font-black uppercase tracking-widest">Watchlist Matrix</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-black uppercase bg-background border-primary/20">
                        {watchlistSymbols.length} Assets
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {activeTab === 'watchlist' ? (
                    <MatrixTable data={filteredResults} isLoading={isScanning && results.length === 0} />
                ) : (
                    <div className="p-12 text-center text-muted-foreground opacity-50">
                        <p className="text-xs font-bold uppercase cursor-pointer hover:text-primary transition-colors" onClick={() => setActiveTab('watchlist')}>
                            Switch to Watchlist Tab to view synced assets.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>

        {/* MARKET TABS */}
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
                        <TabsList className="bg-muted/30 p-1 h-11 border-2 flex-wrap h-auto">
                            <TabsTrigger value="watchlist" className="px-5 font-bold uppercase text-[10px]">Watchlist</TabsTrigger>
                            {allAvailableIndices.map(idx => (
                                <TabsTrigger key={idx.id} value={idx.id} className="px-5 font-bold uppercase text-[10px]">
                                    {idx.name}
                                </TabsTrigger>
                            ))}
                            <TabsTrigger value="custom" className="px-5 font-bold uppercase text-[10px]"><Filter className="mr-2 h-3 w-3" />Custom</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <IndexManagementTerminal 
                        indices={allAvailableIndices} 
                        user={user} 
                        firestore={firestore} 
                    />
                </div>

                {activeTab !== 'watchlist' && activeTab !== 'custom' && (
                    <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                            <div className="flex items-center gap-2 px-4 h-9 rounded-lg border-2 border-dashed hover:border-primary transition-colors text-[10px] font-black uppercase text-muted-foreground">
                                <Upload className="h-3 w-3" />
                                Sync {activeTab.toUpperCase()} CSV
                            </div>
                            <input type="file" className="hidden" accept=".csv" onChange={handleSyncCSV} />
                        </label>
                    </div>
                )}
            </div>

            <Card className="border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                <CardHeader className="bg-muted/30 border-b py-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            Market Scanner: {activeTab.toUpperCase()}
                        </CardTitle>
                        <Badge variant="secondary" className="text-[10px] font-black uppercase">
                            {results.length} Scanned
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {activeTab === 'custom' && (
                        <div className="p-6 border-b space-y-4 bg-muted/5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground">Ad-Hoc Symbols (RELIANCE, JSL, ZOMATO)</label>
                            <div className="flex gap-4">
                                <Textarea 
                                    className="flex-1 min-h-[80px] bg-background font-mono text-sm" 
                                    placeholder="Enter symbols separated by commas..."
                                    value={customInput}
                                    onChange={(e) => setCustomInput(e.target.value)}
                                />
                                <div className="flex flex-col gap-2">
                                    <Button onClick={() => runScanner(true)} className="h-full px-8 font-black uppercase tracking-tighter">
                                        Analyze List
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-[10px] font-bold uppercase" onClick={saveCustomAsIndex} disabled={!customInput}>
                                        Save as New Index
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    <MatrixTable data={filteredResults} isLoading={isScanning && results.length === 0} />
                </CardContent>
            </Card>
        </div>
      </main>
    </AppLayout>
  );
}

function IndexManagementTerminal({ indices, user, firestore }: { indices: MarketIndex[], user: any, firestore: any }) {
    const [newName, setNewName] = useState("");
    const [newSymbols, setNewSymbols] = useState("");

    const handleCreate = async () => {
        if (!newName || !newSymbols || !user) return;
        const id = newName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const symbols = newSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        
        await setDoc(doc(firestore, `users/${user.uid}/marketIndices`, id), {
            id, name: newName, symbols, isSystem: false, createdAt: serverTimestamp()
        });
        setNewName("");
        setNewSymbols("");
        toast({ title: "Index Created", description: `Added ${newName} to your profile.` });
    };

    const handleDelete = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(firestore, `users/${user.uid}/marketIndices`, id));
        toast({ title: "Index Deleted", description: "The list has been removed." });
    };

    const handleReset = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(firestore, `users/${user.uid}/marketIndices`, id));
        toast({ title: "Reset Complete", description: "Reverted to system default list." });
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl border-2 hover:bg-primary/5 text-primary">
                    <Database className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl bg-black text-emerald-400 border-emerald-900/50 font-mono">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-tighter">
                        <Terminal className="h-5 w-5" />
                        Index Management Terminal
                    </DialogTitle>
                    <DialogDescription className="text-emerald-800 text-xs">
                        Configure persistent scanning targets and system overrides.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {indices.map(idx => (
                            <div key={idx.id} className="flex items-center justify-between p-3 rounded bg-emerald-950/20 border border-emerald-900/30 group">
                                <div className="flex items-center gap-3">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <div>
                                        <p className="text-xs font-bold uppercase text-emerald-300">{idx.name}</p>
                                        <p className="text-[10px] text-emerald-700">{idx.symbols.length} Assets · {idx.isSystem ? 'System Context' : 'User Defined'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {idx.isSystem ? (
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-emerald-600 hover:text-emerald-400" onClick={() => handleReset(idx.id)}>
                                            <RotateCcw className="mr-1 h-3 w-3" /> Reset
                                        </Button>
                                    ) : (
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-rose-800 hover:text-rose-500" onClick={() => handleDelete(idx.id)}>
                                            <Trash2 className="mr-1 h-3 w-3" /> Purge
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-emerald-900/30 pt-6 space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-emerald-700">Initialize New Index</h4>
                        <div className="grid grid-cols-1 gap-4">
                            <Input 
                                placeholder="Index Name (e.g. My Breakout List)" 
                                className="bg-emerald-950/30 border-emerald-900/50 text-emerald-400 placeholder:text-emerald-900"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                            <Textarea 
                                placeholder="SYMBOLS, SEPARATED, BY, COMMAS" 
                                className="bg-emerald-950/30 border-emerald-900/50 text-emerald-400 placeholder:text-emerald-900 h-24 text-[10px]"
                                value={newSymbols}
                                onChange={(e) => setNewSymbols(e.target.value)}
                            />
                            <Button onClick={handleCreate} disabled={!newName || !newSymbols} className="bg-emerald-600 hover:bg-emerald-500 text-black font-black uppercase tracking-widest">
                                <Plus className="mr-2 h-4 w-4" /> Commit to Profile
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function MatrixTable({ data, isLoading }: { data: PivotMatrixStock[], isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-80 gap-4">
                <RefreshCw className="h-10 w-10 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter animate-pulse">Initializing Market Matrix...</p>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-80 text-muted-foreground opacity-50">
                <ShieldAlert className="h-10 w-10 mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">No Matrix Data Found</p>
                <p className="text-[10px] mt-2">Try refreshing or verifying your stock symbols.</p>
            </div>
        );
    }

    return (
        <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-20 border-b">
                    <TableRow className="h-12">
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Lower Support Anchor</TableHead>
                        <TableHead className="text-[10px] font-black uppercase px-8">Asset Matrix Position</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Upper Resistance Anchor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((stock) => {
                        const distToLow = Math.abs(stock.currentPrice - (stock.lowerLevel.value || 1)) / (stock.lowerLevel.value || 1);
                        const distToHigh = Math.abs(stock.currentPrice - (stock.upperLevel.value || 1)) / (stock.upperLevel.value || 1);
                        const nearLow = distToLow < 0.003;
                        const nearHigh = distToHigh < 0.003;

                        return (
                            <TableRow key={stock.symbol} className="h-16 hover:bg-primary/5 transition-all group border-b last:border-0">
                                <TableCell className="text-center bg-muted/10">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[10px] font-black uppercase", nearLow ? "text-primary animate-pulse" : "text-muted-foreground/60")}>
                                            {stock.lowerLevel.label}
                                        </span>
                                        <span className={cn("font-mono text-xs font-bold", nearLow ? "text-primary scale-105" : "text-muted-foreground/80")}>
                                            ₹{stock.lowerLevel.value.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>

                                <TableCell className="px-8">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <Link href={`/reports/${stock.symbol}`} className="flex items-center gap-3 group/sym">
                                                <div className={cn(
                                                    "h-2 w-2 rounded-full",
                                                    nearLow ? "bg-destructive animate-ping" : nearHigh ? "bg-success animate-ping" : "bg-primary/20"
                                                )} />
                                                <span className="font-mono text-base font-black tracking-tighter group-hover/sym:text-primary transition-colors border-b-2 border-transparent group-hover/sym:border-primary/40">
                                                    {stock.symbol}
                                                </span>
                                            </Link>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase truncate max-w-[150px] mt-0.5">
                                                Spotlight Asset
                                            </span>
                                        </div>
                                        <div className="text-right flex items-center gap-6">
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm font-black text-primary">
                                                    ₹<AnimatedCounter value={stock.currentPrice} />
                                                </span>
                                                <div className="flex items-center justify-end gap-1 mt-1">
                                                    <div className="h-1 w-24 bg-muted rounded-full overflow-hidden relative">
                                                        <div 
                                                            className={cn(
                                                                "h-full transition-all duration-700",
                                                                nearLow ? "bg-destructive" : nearHigh ? "bg-success" : "bg-primary/40"
                                                            )} 
                                                            style={{ width: `${Math.min(100, Math.max(0, ((stock.currentPrice - stock.lowerLevel.value) / ((stock.upperLevel.value - stock.lowerLevel.value) || 1)) * 100))}%` }} 
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-full bg-muted/30 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white">
                                                <Link href={`/reports/${stock.symbol}`}>
                                                    <ChevronRight className="h-5 w-5" />
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </TableCell>

                                <TableCell className="text-center bg-muted/10">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[10px] font-black uppercase", nearHigh ? "text-primary animate-pulse" : "text-muted-foreground/60")}>
                                            {stock.upperLevel.label}
                                        </span>
                                        <span className={cn("font-mono text-xs font-bold", nearHigh ? "text-primary scale-105" : "text-muted-foreground/80")}>
                                            ₹{stock.upperLevel.value.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
