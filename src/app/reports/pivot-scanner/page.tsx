"use client";

export const dynamic = 'force-dynamic';

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
    Terminal,
    ArrowUpDown,
    Check,
    ListFilter,
    X,
    PlusCircle
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fnoStocks } from "@/lib/fno-stocks";
import { NIFTY_50, NIFTY_NEXT_50, MIDCAP_SELECT, MIDCAP_150_CORE } from "@/lib/indices";
import AnimatedCounter from "@/components/AnimatedCounter";
import { cn } from "@/lib/utils";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, deleteDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { StockRecord } from "@/app/types/trade";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { stockList } from "@/lib/stock-list";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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
  allLevels: Record<string, number>;
}

interface ScanCache {
    [key: string]: {
        data: PivotMatrixStock[];
        timestamp: number;
    }
}

const CACHE_EXPIRY = 180000;
const PIVOT_LEVELS = ['S5', 'S4', 'S3', 'S2', 'S1', 'Pivot', 'R1', 'R2', 'R3', 'R4', 'R5'];

const SYSTEM_DEFAULTS: { [key: string]: { name: string, symbols: string[] } } = {
    fno: { name: "FNO List", symbols: fnoStocks.map(s => s.symbol) },
    nifty50: { name: "Nifty 50", symbols: NIFTY_50 },
    niftynext50: { name: "Nifty Next 50", symbols: NIFTY_NEXT_50 },
    midcapselect: { name: "Midcap Select", symbols: MIDCAP_SELECT },
    midcap150: { name: "Midcap 150", symbols: MIDCAP_150_CORE },
};

const calculateMatrix = (symbol: string, name: string, h: number, l: number, current: number, prevClose: number): PivotMatrixStock => {
    const range = h - l;
    const p = (h + l + prevClose) / 3;
    const pc = prevClose || current;
    
    const levelsMap: Record<string, number> = {
        'S5': pc - (range * 1.1),
        'S4': pc - (range * 1.1 / 2),
        'S3': pc - (range * 1.1 / 4),
        'S2': pc - (range * 1.1 / 6),
        'S1': pc - (range * 1.1 / 12),
        'Pivot': p,
        'R1': pc + (range * 1.1 / 12),
        'R2': pc + (range * 1.1 / 6),
        'R3': pc + (range * 1.1 / 4),
        'R4': pc + (range * 1.1 / 2),
        'R5': pc + (range * 1.1),
    };

    const sortedLevels = Object.entries(levelsMap)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.value - b.value);

    let lower = sortedLevels[0] || { label: '---', value: 0 };
    let upper = sortedLevels[sortedLevels.length - 1] || { label: '---', value: 0 };

    for (let i = 0; i < sortedLevels.length - 1; i++) {
        if (current >= sortedLevels[i].value && current <= sortedLevels[i + 1].value) {
            lower = sortedLevels[i];
            upper = sortedLevels[i + 1];
            break;
        }
    }

    return {
        symbol,
        name,
        currentPrice: current,
        lowerLevel: lower,
        upperLevel: upper,
        zone: `${lower.label} - ${upper.label}`,
        allLevels: levelsMap
    };
};

export default function PivotScannerPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [timeframe, setTimeframe] = useState<ScannerTimeframe>('daily'); // Default to Daily (5m Charts)
  const [activeTab, setActiveTab] = useState("watchlist");
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [results, setResults] = useState<PivotMatrixStock[]>([]);
  const cacheRef = useRef<ScanCache>({});

  // Filter State
  const [filterMode, setFilterMode] = useState<'none' | 'above' | 'below' | 'between'>('none');
  const [filterLevel1, setFilterLevel1] = useState<string>('Pivot');
  const [filterLevel2, setFilterLevel2] = useState<string>('R1');

  // Ad-Hoc Lookup State
  const [lookupSymbol, setLookupSymbol] = useState("");
  const [lookupResult, setLookupResult] = useState<PivotMatrixStock | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);

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
                    return calculateMatrix(symbol, symbol, data.high, data.low, data.currentPrice, data.previousClose);
                }
            } catch (e) { return null; }
            return null;
        });

        const batchResults = await Promise.all(promises);
        batchResults.forEach(r => { if (r) scanData.push(r); });
        
        setResults([...scanData]);
        setProgress(total > 0 ? Math.round(((i + batch.length) / total) * 100) : 0);
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

  const handleLookup = async (symbol: string) => {
      if (!symbol) return;
      setIsLookupLoading(true);
      setLookupResult(null);
      try {
          const res = await fetch(`/api/yahoo-finance?symbol=${symbol}&timeframe=${timeframe}`);
          const data = await res.json();
          if (data && data.currentPrice) {
              const matrix = calculateMatrix(symbol, symbol, data.high, data.low, data.currentPrice, data.previousClose);
              setLookupResult(matrix);
          } else {
              toast({ variant: "destructive", title: "Data Not Found", description: `Could not fetch technicals for ${symbol}` });
          }
      } catch (e) {
          toast({ variant: "destructive", title: "Error", description: "Failed to connect to technical engine." });
      } finally {
          setIsLookupLoading(false);
      }
  };

  const handleSyncCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !firestore) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        const lines = text.split('\n');
        if (lines.length === 0) return;
        
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

            toast({ title: "Sync Successful", description: `Updated ${indexName} with ${symbols.length} symbols.` });
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
          id, name, symbols, isSystem: false, createdAt: serverTimestamp()
      });
      toast({ title: "Index Created", description: `${name} added to scanner.` });
      setActiveTab(id);
  };

  const filteredResults = useMemo(() => {
    let filtered = results.filter(s => s.symbol && s.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterMode !== 'none') {
        filtered = filtered.filter(item => {
            const val1 = item.allLevels[filterLevel1];
            const val2 = item.allLevels[filterLevel2];
            const price = item.currentPrice;

            if (filterMode === 'above') return price > val1;
            if (filterMode === 'below') return price < val1;
            if (filterMode === 'between') {
                const min = Math.min(val1, val2);
                const max = Math.max(val1, val2);
                return price >= min && price <= max;
            }
            return true;
        });
    }
    return filtered;
  }, [results, searchTerm, filterMode, filterLevel1, filterLevel2]);

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
                <input 
                    placeholder="Search results..." 
                    className="flex h-9 w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-xs pl-9 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
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

                <Card className="border-2 border-primary/10 shadow-xl overflow-hidden bg-card/50 backdrop-blur-md">
                    <CardHeader className="bg-primary/5 border-b py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Target className="h-5 w-5 text-primary" />
                                <CardTitle className="text-sm font-black uppercase tracking-widest">Market Matrix Results</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={filterMode !== 'none' ? 'primary' : 'outline'} size="sm" className="h-8 text-[10px] font-black uppercase">
                                            <Filter className="mr-1 h-3 w-3" />
                                            {filterMode === 'none' ? 'Level Filter' : `Filter: ${filterMode}`}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                        <div className="space-y-4">
                                            <h4 className="font-bold leading-none text-sm uppercase tracking-tight">Technical Level Filter</h4>
                                            <div className="space-y-2">
                                                <Label className="text-[10px] uppercase font-black">Filtering Logic</Label>
                                                <Select value={filterMode} onValueChange={(val: any) => setFilterMode(val)}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Show All</SelectItem>
                                                        <SelectItem value="above">Price Above Level</SelectItem>
                                                        <SelectItem value="below">Price Below Level</SelectItem>
                                                        <SelectItem value="between">Price Between Levels</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {filterMode !== 'none' && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] uppercase font-black">Level {filterMode === 'between' ? 'A' : ''}</Label>
                                                        <Select value={filterLevel1} onValueChange={setFilterLevel1}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {PIVOT_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {filterMode === 'between' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] uppercase font-black">Level B</Label>
                                                            <Select value={filterLevel2} onValueChange={setFilterLevel2}>
                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    {PIVOT_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            <Button variant="ghost" size="sm" className="w-full h-8 text-[10px] font-black uppercase" onClick={() => setFilterMode('none')}>
                                                Reset Filters
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Badge variant="outline" className="text-[10px] font-black uppercase bg-background border-primary/20">
                                    {filteredResults.length} Assets
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <MatrixTable data={filteredResults} isLoading={isScanning && results.length === 0} />
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
                <Card className="border-2 border-primary/10 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Search className="h-16 w-16" />
                    </div>
                    <CardHeader className="bg-muted/30 border-b py-4">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary" />
                            Matrix Quick Lookup
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black text-muted-foreground">Type Stock Symbol</Label>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <Combobox
                                        options={stockList}
                                        value={lookupSymbol}
                                        onChange={handleLookup}
                                        placeholder="RELIANCE, HDFCBANK..."
                                        searchPlaceholder="Search symbol..."
                                    />
                                </div>
                            </div>
                        </div>

                        {isLookupLoading && (
                            <div className="flex flex-col items-center justify-center p-8 gap-3">
                                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                                <p className="text-[10px] font-black uppercase text-muted-foreground">Fetching Technicals...</p>
                            </div>
                        )}

                        {lookupResult && !isLookupLoading && (
                            <div className="p-4 rounded-xl border bg-primary/5 animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="font-black text-lg tracking-tighter">{lookupResult.symbol}</h4>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{timeframe} Matrix</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-xl font-black text-primary">₹{lookupResult.currentPrice.toFixed(2)}</p>
                                        <Badge variant="success" className="text-[9px] uppercase font-black px-1.5 h-4">Live Match</Badge>
                                    </div>
                                </div>
                                <div className="space-y-3 pt-4 border-t border-dashed">
                                    <div className="flex justify-between items-center text-[10px] font-black uppercase text-muted-foreground">
                                        <span>Current Zone</span>
                                        <span className="text-primary">{lookupResult.zone}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="p-2 rounded bg-background border text-center">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">{lookupResult.lowerLevel.label}</p>
                                            <p className="font-mono text-xs font-black">₹{lookupResult.lowerLevel.value.toFixed(1)}</p>
                                        </div>
                                        <div className="p-2 rounded bg-background border text-center">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">{lookupResult.upperLevel.label}</p>
                                            <p className="font-mono text-xs font-black">₹{lookupResult.upperLevel.value.toFixed(1)}</p>
                                        </div>
                                    </div>
                                    <Button asChild variant="outline" className="w-full h-8 text-[10px] font-black uppercase mt-2">
                                        <Link href={`/reports/${lookupResult.symbol}`}>View Detailed Report</Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

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
                </div>

                {activeTab !== 'watchlist' && activeTab !== 'custom' && (
                    <div className="flex items-center gap-2">
                        <label className="cursor-pointer w-full">
                            <div className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border-2 border-dashed hover:border-primary transition-colors text-[10px] font-black uppercase text-muted-foreground bg-card">
                                <Upload className="h-4 w-4" />
                                Sync {activeTab.toUpperCase()} CSV
                            </div>
                            <input type="file" className="hidden" accept=".csv" onChange={handleSyncCSV} />
                        </label>
                    </div>
                )}
                
                {activeTab === 'custom' && (
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="bg-muted/30 border-b py-3">
                            <CardTitle className="text-xs font-black uppercase tracking-widest">Ad-Hoc Index Creation</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <Textarea 
                                className="min-h-[120px] bg-background font-mono text-sm" 
                                placeholder="Enter symbols separated by commas..."
                                value={customInput}
                                onChange={(e) => setCustomInput(e.target.value)}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Button onClick={() => runScanner(true)} className="font-black uppercase text-[10px]">
                                    Analyze
                                </Button>
                                <Button variant="outline" className="text-[10px] font-black uppercase" onClick={saveCustomAsIndex} disabled={!customInput}>
                                    Save Tab
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
      </main>
    </AppLayout>
  );
}

function IndexManagementTerminal({ indices, user, firestore }: { indices: MarketIndex[], user: any, firestore: any }) {
    const [newName, setNewName] = useState("");
    const [newSymbols, setNewSymbols] = useState("");
    const [quickAddSymbol, setQuickAddSymbol] = useState<{ [id: string]: string }>({});

    const handleCreate = async () => {
        if (!newName || !newSymbols || !user || !firestore) return;
        const id = newName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const symbols = newSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        await setDoc(doc(firestore, `users/${user.uid}/marketIndices`, id), {
            id, name: newName, symbols, isSystem: false, createdAt: serverTimestamp()
        });
        setNewName(""); setNewSymbols("");
        toast({ title: "Index Created", description: `Added ${newName} to profile.` });
    };

    const handleDelete = async (id: string) => {
        if (!user || !firestore) return;
        await deleteDoc(doc(firestore, `users/${user.uid}/marketIndices`, id));
        toast({ title: "Index Deleted", description: "Removed list." });
    };

    const handleReset = async (id: string) => {
        if (!user || !firestore) return;
        await deleteDoc(doc(firestore, `users/${user.uid}/marketIndices`, id));
        toast({ title: "Reset Complete", description: "Reverted to default." });
    };

    const handleAddSymbol = async (id: string) => {
        const symbol = quickAddSymbol[id]?.trim().toUpperCase();
        if (!symbol || !user || !firestore) return;
        
        const index = indices.find(idx => idx.id === id);
        if (!index) return;

        const updatedSymbols = Array.from(new Set([...(index.symbols || []), symbol]));
        const indexRef = doc(firestore, `users/${user.uid}/marketIndices`, id);
        
        await setDoc(indexRef, {
            id,
            name: index.name,
            symbols: updatedSymbols,
            isSystem: index.isSystem,
            updatedAt: serverTimestamp()
        }, { merge: true });

        setQuickAddSymbol(prev => ({ ...prev, [id]: "" }));
        toast({ title: "Symbol Added", description: `${symbol} added to ${index.name}.` });
    };

    const handleRemoveSymbol = async (id: string, symbol: string) => {
        if (!user || !firestore) return;
        const index = indices.find(idx => idx.id === id);
        if (!index) return;

        const updatedSymbols = index.symbols.filter(s => s !== symbol);
        const indexRef = doc(firestore, `users/${user.uid}/marketIndices`, id);

        await setDoc(indexRef, {
            id,
            name: index.name,
            symbols: updatedSymbols,
            isSystem: index.isSystem,
            updatedAt: serverTimestamp()
        }, { merge: true });

        toast({ title: "Symbol Removed", description: `${symbol} removed from ${index.name}.` });
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl border-2 hover:bg-primary/5 text-primary">
                    <Database className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl bg-black text-emerald-400 border-emerald-900/50 font-mono">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-tighter">
                        <Terminal className="h-5 w-5" />
                        Index Management Terminal
                    </DialogTitle>
                </DialogHeader>
                <div className="py-6 space-y-6">
                    <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {indices.map(idx => (
                            <div key={idx.id} className="flex flex-col p-4 rounded bg-emerald-950/20 border border-emerald-900/30 group">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <div>
                                            <p className="text-xs font-bold uppercase text-emerald-300">{idx.name}</p>
                                            <p className="text-[10px] text-emerald-700">{idx.symbols?.length || 0} Assets Active</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {idx.isSystem ? (
                                            <Button variant="ghost" size="sm" onClick={() => handleReset(idx.id)} className="h-7 text-[10px] hover:bg-emerald-900/20"><RotateCcw className="mr-1 h-3 w-3" /> Reset</Button>
                                        ) : (
                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(idx.id)} className="h-7 text-[10px] text-rose-800 hover:bg-rose-900/10"><Trash2 className="mr-1 h-3 w-3" /> Purge</Button>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="bg-black/40 border border-emerald-900/10 rounded p-3 space-y-4">
                                    <div className="flex items-center justify-between border-b border-emerald-900/20 pb-2">
                                        <div className="flex items-center gap-2 text-[8px] font-black uppercase text-emerald-800">
                                            <ListFilter className="h-2 w-2" />
                                            Constituent Grid
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input 
                                                className="h-6 w-32 bg-emerald-950/50 border-emerald-900/50 text-[10px] text-emerald-400 placeholder:text-emerald-900" 
                                                placeholder="QUICK ADD SYMBOL"
                                                value={quickAddSymbol[idx.id] || ""}
                                                onChange={(e) => setQuickAddSymbol(prev => ({ ...prev, [idx.id]: e.target.value }))}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol(idx.id)}
                                            />
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600 hover:text-emerald-400" onClick={() => handleAddSymbol(idx.id)}>
                                                <PlusCircle className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <ScrollArea className="w-full">
                                        <div className="flex flex-wrap gap-1.5 pb-2 max-h-[120px]">
                                            {idx.symbols?.map((sym, i) => (
                                                <Badge 
                                                    key={i} 
                                                    variant="outline" 
                                                    className="group/tag border-emerald-900/30 bg-emerald-950/40 text-emerald-500/70 hover:border-emerald-500 hover:text-emerald-400 text-[10px] pr-1 gap-1 h-5"
                                                >
                                                    {sym}
                                                    <button 
                                                        onClick={() => handleRemoveSymbol(idx.id, sym)}
                                                        className="opacity-0 group-hover/tag:opacity-100 hover:text-rose-500 transition-all"
                                                    >
                                                        <X className="h-2.5 w-2.5" />
                                                    </button>
                                                </Badge>
                                            ))}
                                            {(!idx.symbols || idx.symbols.length === 0) && <p className="text-[9px] italic text-emerald-900">No constituents defined.</p>}
                                        </div>
                                        <ScrollBar orientation="horizontal" />
                                    </ScrollArea>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="border-t border-emerald-900/30 pt-6 space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-emerald-700">Initialize Parallel Index</h4>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="grid grid-cols-3 gap-4">
                                <Input 
                                    placeholder="Index Label" 
                                    className="col-span-1 bg-emerald-950/30 border-emerald-900/50 text-emerald-400 placeholder:text-emerald-900"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                                <Input 
                                    placeholder="SYMBOLS (Separated by Commas)" 
                                    className="col-span-2 bg-emerald-950/30 border-emerald-900/50 text-emerald-400 placeholder:text-emerald-900"
                                    value={newSymbols}
                                    onChange={(e) => setNewSymbols(e.target.value)}
                                />
                            </div>
                            <Button onClick={handleCreate} disabled={!newName || !newSymbols} className="bg-emerald-600 text-black font-black uppercase tracking-widest h-11">
                                <Plus className="mr-2 h-4 w-4" /> Finalize List & Commit to Profile
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
                <p className="text-[10px] font-black uppercase text-muted-foreground animate-pulse">Initializing Market Matrix...</p>
            </div>
        );
    }
    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-80 text-muted-foreground opacity-50">
                <ShieldAlert className="h-10 w-10 mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">No Matrix Data Found</p>
            </div>
        );
    }
    return (
        <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-20 border-b">
                    <TableRow className="h-12">
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Lower Anchor</TableHead>
                        <TableHead className="text-[10px] font-black uppercase px-8">Asset Position</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-center w-1/4">Upper Anchor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((stock) => {
                        const lowVal = stock.lowerLevel?.value || 1;
                        const highVal = stock.upperLevel?.value || 1;
                        const curPrice = stock.currentPrice || 0;
                        const range = Math.abs(highVal - lowVal) || 1;
                        const distToLow = Math.abs(curPrice - lowVal) / lowVal;
                        const distToHigh = Math.abs(curPrice - highVal) / highVal;
                        const nearLow = distToLow < 0.003;
                        const nearHigh = distToHigh < 0.003;

                        return (
                            <TableRow key={stock.symbol} className="h-16 hover:bg-primary/5 transition-all group border-b last:border-0">
                                <TableCell className="text-center bg-muted/10">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[10px] font-black uppercase", nearLow ? "text-primary" : "text-muted-foreground/60")}>
                                            {stock.lowerLevel?.label || '---'}
                                        </span>
                                        <span className={cn("font-mono text-xs font-bold", nearLow ? "text-primary" : "text-muted-foreground/80")}>
                                            ₹{(lowVal).toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="px-8">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("h-2 w-2 rounded-full", nearLow ? "bg-destructive animate-ping" : nearHigh ? "bg-success animate-ping" : "bg-primary/20")} />
                                                <span className="font-mono text-base font-black tracking-tighter">
                                                    {stock.symbol}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-6">
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm font-black text-primary">
                                                    ₹<AnimatedCounter value={curPrice} />
                                                </span>
                                                <div className="flex items-center justify-end gap-1 mt-1">
                                                    <div className="h-1 w-24 bg-muted rounded-full overflow-hidden">
                                                        <div 
                                                            className={cn("h-full transition-all duration-700", nearLow ? "bg-destructive" : nearHigh ? "bg-success" : "bg-primary/40")} 
                                                            style={{ width: `${Math.min(100, Math.max(0, ((curPrice - lowVal) / range) * 100))}%` }} 
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" asChild className="h-9 w-9 rounded-full bg-muted/30 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-white">
                                                <Link href={`/reports/${stock.symbol}`}><ChevronRight className="h-5 w-5" /></Link>
                                            </Button>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-center bg-muted/10">
                                    <div className="flex flex-col">
                                        <span className={cn("text-[10px] font-black uppercase", nearHigh ? "text-primary" : "text-muted-foreground/60")}>
                                            {stock.upperLevel?.label || '---'}
                                        </span>
                                        <span className={cn("font-mono text-xs font-bold", nearHigh ? "text-primary" : "text-foreground/80")}>
                                            ₹{(highVal).toFixed(2)}
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
