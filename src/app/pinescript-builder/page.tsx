
"use client";

import { useState, useEffect, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Code2, 
  Copy, 
  Save, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Info, 
  Zap, 
  ShieldAlert, 
  Clock, 
  CheckCircle2,
  TrendingUp,
  Settings2,
  ChevronRight
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// --- Types ---

type RuleRow = {
  id: string;
  metricA: string;
  operator: string;
  targetType: 'Value' | 'Metric';
  targetValue: number;
  targetMetric: string;
  conjunction: 'AND' | 'OR';
};

type StrategyState = {
  name: string;
  initialCapital: number;
  sizingType: string;
  sizingValue: number;
  direction: 'Long Only' | 'Short Only' | 'Both';
  commission: number;
  slippage: number;
  baseStrategy: 'SMA Crossover' | 'RSI Reversion' | 'MACD Trend' | 'Custom Rule Engine';
  // SMA Template
  smaFast: number;
  smaSlow: number;
  // RSI Template
  rsiLength: number;
  rsiOverbought: number;
  rsiOversold: number;
  // MACD Template
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  // Custom Rules
  rules: RuleRow[];
  // Risk
  stopLoss: number;
  takeProfit: number;
  trailingEnabled: boolean;
  trailingActivation: number;
  trailingOffset: number;
  // Time
  startDate: string;
  endDate: string;
  intradayOnly: boolean;
  startTime: string;
  squareOffTime: string;
};

// --- Defaults ---

const DEFAULT_STATE: StrategyState = {
  name: "TradeTrack_Alpha",
  initialCapital: 100000,
  sizingType: "strategy.percent_of_equity",
  sizingValue: 100,
  direction: "Both",
  commission: 0.1,
  slippage: 1,
  baseStrategy: "SMA Crossover",
  smaFast: 9,
  smaSlow: 21,
  rsiLength: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  rules: [
    { id: '1', metricA: 'close', operator: '>', targetType: 'Metric', targetValue: 0, targetMetric: 'SMA', conjunction: 'AND' }
  ],
  stopLoss: 2.0,
  takeProfit: 5.0,
  trailingEnabled: false,
  trailingActivation: 1.0,
  trailingOffset: 0.5,
  startDate: "2023-01-01",
  endDate: format(new Date(), "yyyy-MM-dd"),
  intradayOnly: false,
  startTime: "09:15",
  squareOffTime: "15:15",
};

export default function PineScriptBuilderPage() {
  const [state, setState] = useState<StrategyState>(DEFAULT_STATE);
  const [savedStrategies, setSavedStrategies] = useState<StrategyState[]>([]);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  // Load from local storage
  useEffect(() => {
    const stored = localStorage.getItem('tt_pinescript_strategies');
    if (stored) setSavedStrategies(JSON.parse(stored));
  }, []);

  const updateState = (updates: Partial<StrategyState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const handleSave = () => {
    const updated = [...savedStrategies.filter(s => s.name !== state.name), state];
    setSavedStrategies(updated);
    localStorage.setItem('tt_pinescript_strategies', JSON.stringify(updated));
    toast({ title: "Strategy Saved", description: `${state.name} has been stored locally.` });
  };

  const handleLoad = (strat: StrategyState) => {
    setState(strat);
    setIsLoadModalOpen(false);
    toast({ title: "Strategy Loaded", description: `${strat.name} is now active.` });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    toast({ title: "Code Copied", description: "Pine Script V5 copied to clipboard." });
  };

  // --- Code Generation Logic ---

  const generatedCode = useMemo(() => {
    const { 
      name, initialCapital, sizingType, sizingValue, direction, commission, slippage,
      baseStrategy, smaFast, smaSlow, rsiLength, rsiOverbought, rsiOversold,
      macdFast, macdSlow, macdSignal, rules,
      stopLoss, takeProfit, trailingEnabled, trailingActivation, trailingOffset,
      startDate, endDate, intradayOnly, startTime, squareOffTime
    } = state;

    let code = `//@version=5\nstrategy("${name}", overlay=true, initial_capital=${initialCapital}, default_qty_type=${sizingType}, default_qty_value=${sizingValue}, commission_type=strategy.commission.percent, commission_value=${commission}, slippage=${slippage})\n\n`;

    // 1. Direction Filtering
    if (direction === 'Long Only') code += `// Trade Direction: Long Only\n`;
    if (direction === 'Short Only') code += `// Trade Direction: Short Only\n`;

    // 2. Indicators & Logic
    code += `// --- Indicators ---\n`;
    if (baseStrategy === "SMA Crossover" || (baseStrategy === "Custom Rule Engine" && rules.some(r => r.metricA === 'SMA' || r.targetMetric === 'SMA'))) {
      code += `fast_sma = ta.sma(close, ${smaFast})\nslow_sma = ta.sma(close, ${smaSlow})\n`;
    }
    if (baseStrategy === "RSI Reversion" || (baseStrategy === "Custom Rule Engine" && rules.some(r => r.metricA === 'RSI' || r.targetMetric === 'RSI'))) {
      code += `rsi = ta.rsi(close, ${rsiLength})\n`;
    }
    if (baseStrategy === "MACD Trend") {
      code += `[macdLine, signalLine, _] = ta.macd(close, ${macdFast}, ${macdSlow}, ${macdSignal})\n`;
    }
    if (baseStrategy === "Custom Rule Engine" && rules.some(r => r.metricA === 'VWAP' || r.targetMetric === 'VWAP')) {
      code += `vwap_val = ta.vwap(close)\n`;
    }

    code += `\n// --- Entry Conditions ---\n`;
    
    const timeFilter = `time >= timestamp("${startDate}") and time <= timestamp("${endDate}")` + 
      (intradayOnly ? ` and time(timeframe.period, "${startTime.replace(':', '')}-${squareOffTime.replace(':', '')}")` : '');

    let entryCondition = "";
    let shortCondition = "";

    if (baseStrategy === "SMA Crossover") {
      entryCondition = "ta.crossover(fast_sma, slow_sma)";
      shortCondition = "ta.crossunder(fast_sma, slow_sma)";
    } else if (baseStrategy === "RSI Reversion") {
      entryCondition = `ta.crossunder(rsi, ${rsiOversold})`;
      shortCondition = `ta.crossover(rsi, ${rsiOverbought})`;
    } else if (baseStrategy === "MACD Trend") {
      entryCondition = "ta.crossover(macdLine, signalLine)";
      shortCondition = "ta.crossunder(macdLine, signalLine)";
    } else if (baseStrategy === "Custom Rule Engine") {
      const parseMetric = (m: string) => {
        if (m === 'RSI') return 'rsi';
        if (m === 'SMA') return 'fast_sma';
        if (m === 'VWAP') return 'vwap_val';
        return m;
      };

      entryCondition = rules.map((r, idx) => {
        const a = parseMetric(r.metricA);
        const b = r.targetType === 'Value' ? r.targetValue : parseMetric(r.targetMetric);
        let op = r.operator;
        let ruleSegment = "";
        
        if (op === 'crosses above') {
          ruleSegment = `ta.crossover(${a}, ${b})`;
        } else if (op === 'crosses below') {
          ruleSegment = `ta.crossunder(${a}, ${b})`;
        } else {
          ruleSegment = `(${a} ${op} ${b})`;
        }
        
        const conj = idx < rules.length - 1 ? ` ${r.conjunction.toLowerCase()} ` : "";
        return `${ruleSegment}${conj}`;
      }).join("");
      
      shortCondition = "false";
    }

    code += `long_entry = (${entryCondition}) and ${timeFilter}\n`;
    code += `short_entry = (${shortCondition}) and ${timeFilter}\n\n`;

    // 3. Execution
    code += `// --- Execution ---\n`;
    if (direction !== "Short Only") {
      code += `if long_entry\n    strategy.entry("Long", strategy.long)\n`;
    }
    if (direction !== "Long Only") {
      code += `if short_entry\n    strategy.entry("Short", strategy.short)\n`;
    }

    // 4. Exit Logic (SL/TP)
    code += `\n// --- Risk Management ---\n`;
    const sl_price = `close * (1 - ${stopLoss}/100)`;
    const tp_price = `close * (1 + ${takeProfit}/100)`;
    
    code += `strategy.exit("Exit Long", "Long", stop=strategy.position_avg_price * (1 - ${stopLoss}/100), limit=strategy.position_avg_price * (1 + ${takeProfit}/100)`;
    
    if (trailingEnabled) {
      code += `, trail_points=strategy.position_avg_price * ${trailingActivation}/100 / syminfo.mintick, trail_offset=strategy.position_avg_price * ${trailingOffset}/100 / syminfo.mintick`;
    }
    code += `)\n`;

    code += `strategy.exit("Exit Short", "Short", stop=strategy.position_avg_price * (1 + ${stopLoss}/100), limit=strategy.position_avg_price * (1 - ${takeProfit}/100)`;
    code += `)\n`;

    if (intradayOnly) {
      code += `\n// Intraday Square Off\nif time(timeframe.period, "${squareOffTime.replace(':', '')}-0000")\n    strategy.close_all(comment="Intraday Close")\n`;
    }

    return code;
  }, [state]);

  // --- Handlers for Rule Rows ---

  const addRuleRow = () => {
    updateState({ rules: [...state.rules, { id: Math.random().toString(), metricA: 'close', operator: '>', targetType: 'Value', targetValue: 0, targetMetric: 'SMA', conjunction: 'AND' }] });
  };

  const updateRuleRow = (id: string, updates: Partial<RuleRow>) => {
    updateState({ rules: state.rules.map(r => r.id === id ? { ...r, ...updates } : r) });
  };

  const removeRuleRow = (id: string) => {
    if (state.rules.length > 1) {
      updateState({ rules: state.rules.filter(r => r.id !== id) });
    }
  };

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full h-full">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-down">
          <div>
            <h1 className="text-4xl font-headline font-black text-primary uppercase tracking-tight flex items-center gap-3">
              <Code2 className="h-10 w-10 text-primary" />
              Pine Script Builder
            </h1>
            <p className="text-muted-foreground font-medium">Generate TradingView V5 Strategies without writing code.</p>
          </div>
          
          <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-xl border">
              <Button variant="outline" size="sm" onClick={() => setIsLoadModalOpen(true)}>
                <FolderOpen className="mr-2 h-4 w-4" /> Load
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" /> Save Strategy
              </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
          {/* LEFT: CONTROLS PANEL */}
          <div className="space-y-8 h-full max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            
            {/* BLOCK 1: CORE */}
            <Card className="border-2 border-primary/10 shadow-lg">
              <CardHeader className="bg-muted/30 border-b py-4">
                <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Strategy Foundation
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Strategy Name</Label>
                  <Input value={state.name} onChange={(e) => updateState({ name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Initial Capital (₹)</Label>
                  <Input type="number" value={state.initialCapital} onChange={(e) => updateState({ initialCapital: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Order Sizing Type</Label>
                  <Select value={state.sizingType} onValueChange={(val) => updateState({ sizingType: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strategy.percent_of_equity">Percent of Equity</SelectItem>
                      <SelectItem value="strategy.fixed">Fixed (Lots/Contracts)</SelectItem>
                      <SelectItem value="strategy.cash">Cash (INR Amount)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Order Size Value</Label>
                  <Input type="number" value={state.sizingValue} onChange={(e) => updateState({ sizingValue: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Trade Direction</Label>
                  <Select value={state.direction} onValueChange={(val: any) => updateState({ direction: val })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Both">Both (Long & Short)</SelectItem>
                      <SelectItem value="Long Only">Long Only</SelectItem>
                      <SelectItem value="Short Only">Short Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Comm %</Label>
                        <Input type="number" step="0.01" value={state.commission} onChange={(e) => updateState({ commission: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                        <Label>Slippage</Label>
                        <Input type="number" value={state.slippage} onChange={(e) => updateState({ slippage: Number(e.target.value) })} />
                    </div>
                </div>
              </CardContent>
            </Card>

            {/* BLOCK 2: ENTRY LOGIC */}
            <Card className="border-2 border-primary/10 shadow-lg relative overflow-hidden">
              <CardHeader className="bg-muted/30 border-b py-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Entry & Logic
                </CardTitle>
                <div className="flex items-center gap-2">
                   <Select value={state.baseStrategy} onValueChange={(val: any) => updateState({ baseStrategy: val })}>
                        <SelectTrigger className="w-[180px] h-8 text-xs font-bold uppercase">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="SMA Crossover">SMA Crossover</SelectItem>
                            <SelectItem value="RSI Reversion">RSI Reversion</SelectItem>
                            <SelectItem value="MACD Trend">MACD Trend</SelectItem>
                            <SelectItem value="Custom Rule Engine">Custom Rule Engine</SelectItem>
                        </SelectContent>
                    </Select>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Info className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">
                                    {state.baseStrategy === 'SMA Crossover' && "Trend Following: Buys when short-term momentum overtakes long-term momentum."}
                                    {state.baseStrategy === 'RSI Reversion' && "Mean Reversion: Buys the dip when an asset is considered oversold."}
                                    {state.baseStrategy === 'MACD Trend' && "Momentum: Identifies early trend changes and acceleration."}
                                    {state.baseStrategy === 'Custom Rule Engine' && "Advanced: Build your own entry conditions from scratch."}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                
                {state.baseStrategy === 'SMA Crossover' && (
                    <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <Label>Fast SMA Length</Label>
                            <Input type="number" value={state.smaFast} onChange={(e) => updateState({ smaFast: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Slow SMA Length</Label>
                            <Input type="number" value={state.smaSlow} onChange={(e) => updateState({ smaSlow: Number(e.target.value) })} />
                        </div>
                    </div>
                )}

                {state.baseStrategy === 'RSI Reversion' && (
                    <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <Label>Length</Label>
                            <Input type="number" value={state.rsiLength} onChange={(e) => updateState({ rsiLength: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Overbought</Label>
                            <Input type="number" value={state.rsiOverbought} onChange={(e) => updateState({ rsiOverbought: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Oversold</Label>
                            <Input type="number" value={state.rsiOversold} onChange={(e) => updateState({ rsiOversold: Number(e.target.value) })} />
                        </div>
                    </div>
                )}

                {state.baseStrategy === 'MACD Trend' && (
                    <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-2">
                            <Label>Fast</Label>
                            <Input type="number" value={state.macdFast} onChange={(e) => updateState({ macdFast: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Slow</Label>
                            <Input type="number" value={state.macdSlow} onChange={(e) => updateState({ macdSlow: Number(e.target.value) })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Signal</Label>
                            <Input type="number" value={state.macdSignal} onChange={(e) => updateState({ macdSignal: Number(e.target.value) })} />
                        </div>
                    </div>
                )}

                {state.baseStrategy === 'Custom Rule Engine' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                        {state.rules.map((rule, idx) => (
                            <div key={rule.id} className="space-y-3 p-4 rounded-xl border-2 border-dashed relative">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute -top-3 -right-3 h-8 w-8 bg-background border rounded-full hover:text-destructive"
                                    onClick={() => removeRuleRow(rule.id)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                    <div className="md:col-span-3">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Metric A</Label>
                                        <Select value={rule.metricA} onValueChange={(val) => updateRuleRow(rule.id, { metricA: val })}>
                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="close">close</SelectItem>
                                                <SelectItem value="open">open</SelectItem>
                                                <SelectItem value="high">high</SelectItem>
                                                <SelectItem value="low">low</SelectItem>
                                                <SelectItem value="RSI">RSI</SelectItem>
                                                <SelectItem value="SMA">SMA</SelectItem>
                                                <SelectItem value="VWAP">VWAP</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="md:col-span-3">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Operator</Label>
                                        <Select value={rule.operator} onValueChange={(val) => updateRuleRow(rule.id, { operator: val })}>
                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value=">">{'>'}</SelectItem>
                                                <SelectItem value="<">{'<'}</SelectItem>
                                                <SelectItem value="==">{'=='}</SelectItem>
                                                <SelectItem value="crosses above">crosses above</SelectItem>
                                                <SelectItem value="crosses below">crosses below</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Type</Label>
                                        <Tabs value={rule.targetType} onValueChange={(val: any) => updateRuleRow(rule.id, { targetType: val })} className="w-full">
                                            <TabsList className="grid grid-cols-2 h-9">
                                                <TabsTrigger value="Value" className="text-[9px]">VAL</TabsTrigger>
                                                <TabsTrigger value="Metric" className="text-[9px]">MET</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>
                                    <div className="md:col-span-4">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Target</Label>
                                        {rule.targetType === 'Value' ? (
                                            <Input type="number" step="0.01" className="h-9" value={rule.targetValue} onChange={(e) => updateRuleRow(rule.id, { targetValue: Number(e.target.value) })} />
                                        ) : (
                                            <Select value={rule.targetMetric} onValueChange={(val) => updateRuleRow(rule.id, { targetMetric: val })}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="close">close</SelectItem>
                                                    <SelectItem value="open">open</SelectItem>
                                                    <SelectItem value="high">high</SelectItem>
                                                    <SelectItem value="low">low</SelectItem>
                                                    <SelectItem value="RSI">RSI</SelectItem>
                                                    <SelectItem value="SMA">SMA</SelectItem>
                                                    <SelectItem value="VWAP">VWAP</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                                {idx < state.rules.length - 1 && (
                                    <div className="flex justify-center -mb-7 relative z-10 pt-2">
                                        <Select value={rule.conjunction} onValueChange={(val: any) => updateRuleRow(rule.id, { conjunction: val })}>
                                            <SelectTrigger className="w-20 h-7 text-[10px] font-black uppercase bg-primary text-primary-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AND">AND</SelectItem>
                                                <SelectItem value="OR">OR</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        ))}
                        <Button variant="outline" className="w-full h-10 border-dashed" onClick={addRuleRow}>
                            <Plus className="mr-2 h-4 w-4" /> Add Logic Condition
                        </Button>
                    </div>
                )}
              </CardContent>
            </Card>

            {/* BLOCK 3: RISK */}
            <Card className="border-2 border-primary/10 shadow-lg">
              <CardHeader className="bg-muted/30 border-b py-4">
                <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Risk Protections
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>Stop Loss (%)</Label>
                    <Input type="number" step="0.1" value={state.stopLoss} onChange={(e) => updateState({ stopLoss: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                    <Label>Take Profit (%)</Label>
                    <Input type="number" step="0.1" value={state.takeProfit} onChange={(e) => updateState({ takeProfit: Number(e.target.value) })} />
                </div>
                <div className="col-span-full border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="flex flex-col gap-1">
                            <span>Trailing Stop-Loss</span>
                            <span className="text-[10px] text-muted-foreground font-normal">Locks in profits as price moves in your favor.</span>
                        </Label>
                        <Switch checked={state.trailingEnabled} onCheckedChange={(val) => updateState({ trailingEnabled: val })} />
                    </div>
                    {state.trailingEnabled && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right-4">
                             <div className="space-y-2">
                                <Label className="text-xs">Activation %</Label>
                                <Input type="number" step="0.1" value={state.trailingActivation} onChange={(e) => updateState({ trailingActivation: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Trail Offset %</Label>
                                <Input type="number" step="0.1" value={state.trailingOffset} onChange={(e) => updateState({ trailingOffset: Number(e.target.value) })} />
                            </div>
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* BLOCK 4: TIME */}
            <Card className="border-2 border-primary/10 shadow-lg">
              <CardHeader className="bg-muted/30 border-b py-4">
                <CardTitle className="text-sm uppercase tracking-widest font-black flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Time Constraints
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={state.startDate} onChange={(e) => updateState({ startDate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>End Date</Label>
                        <Input type="date" value={state.endDate} onChange={(e) => updateState({ endDate: e.target.value })} />
                    </div>
                </div>
                <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="flex flex-col gap-1">
                            <span>Intraday Only</span>
                            <span className="text-[10px] text-muted-foreground font-normal">Automatically squares off all positions at market close.</span>
                        </Label>
                        <Switch checked={state.intradayOnly} onCheckedChange={(val) => updateState({ intradayOnly: val })} />
                    </div>
                    {state.intradayOnly && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right-4">
                             <div className="space-y-2">
                                <Label className="text-xs">Entry Start Time</Label>
                                <Input type="time" value={state.startTime} onChange={(e) => updateState({ startTime: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Square Off Time</Label>
                                <Input type="time" value={state.squareOffTime} onChange={(e) => updateState({ squareOffTime: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* RIGHT: CODE OUTPUT PANEL */}
          <div className="sticky top-8">
            <Card className="border-2 border-primary/20 shadow-2xl bg-[#1e1e1e] text-emerald-400 overflow-hidden min-h-[80vh] flex flex-col">
              <CardHeader className="bg-black/40 border-b border-white/5 py-4 flex flex-row items-center justify-between">
                 <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 mr-4">
                        <div className="w-3 h-3 rounded-full bg-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                    </div>
                    <CardTitle className="text-xs font-mono uppercase tracking-widest text-white/60">
                        {state.name}.pine
                    </CardTitle>
                 </div>
                 <Button variant="secondary" size="sm" className="h-8 text-xs font-bold gap-2" onClick={handleCopy}>
                    <Copy className="h-3 w-3" />
                    Copy Code
                 </Button>
              </CardHeader>
              <CardContent className="p-0 flex-grow relative">
                 <pre className="p-6 font-mono text-[13px] leading-relaxed overflow-auto max-h-[calc(80vh-60px)] custom-scrollbar">
                    <code>{generatedCode}</code>
                 </pre>
                 <div className="absolute bottom-4 right-4 opacity-30 pointer-events-none">
                    <CheckCircle2 className="h-24 w-24 text-emerald-500" />
                 </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* LOAD STRATEGY DIALOG (Simplied Modal via UI) */}
        {isLoadModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
                <Card className="w-full max-w-md shadow-2xl border-2 border-primary/10">
                    <CardHeader>
                        <CardTitle className="font-headline">Saved Strategies</CardTitle>
                        <CardDescription>Select a strategy to load into the builder.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {savedStrategies.length > 0 ? (
                            savedStrategies.map(s => (
                                <Button 
                                    key={s.name} 
                                    variant="outline" 
                                    className="w-full justify-between group h-12"
                                    onClick={() => handleLoad(s)}
                                >
                                    <span className="font-bold">{s.name}</span>
                                    <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Button>
                            ))
                        ) : (
                            <p className="text-center py-8 text-muted-foreground italic text-sm">No saved strategies found.</p>
                        )}
                    </CardContent>
                    <div className="p-6 pt-0 flex justify-end">
                        <Button variant="ghost" onClick={() => setIsLoadModalOpen(false)}>Cancel</Button>
                    </div>
                </Card>
            </div>
        )}
      </main>
    </AppLayout>
  );
}
