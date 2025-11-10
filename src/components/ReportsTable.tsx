"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StockRecord } from "@/app/types/trade";
import type { StockData } from "@/app/types/stock";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AssessStockRiskOutput } from "@/ai/flows/assess-stock-risk-flow";

type AiStateType<T> = { 
  [symbol: string]: { loading: boolean; data: T | null; error: string | null } 
};

type ReportsTableProps = {
  trades: StockRecord[];
  stockData: StockData;
  isLoading: boolean;
  aiRiskAssessments: AiStateType<AssessStockRiskOutput>;
  onGetInsights: (trade: StockRecord) => void;
};


export default function ReportsTable({ trades, stockData, isLoading, aiRiskAssessments, onGetInsights }: ReportsTableProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const renderCellContent = (symbol: string, field: 'currentPrice' | 'high' | 'low') => {
    const data = stockData[symbol];
    if (isLoading && !data) {
      return <Skeleton className="h-4 w-20" />;
    }
    if (data?.error) {
      return <span className="text-destructive text-xs">Failed to load</span>;
    }
    return formatCurrency(data?.[field]);
  }

  const renderRiskBadge = (symbol: string) => {
    const assessment = aiRiskAssessments[symbol];

    if (assessment?.loading) {
      return <Skeleton className="h-6 w-20" />;
    }
    
    if (assessment?.error || !assessment?.data || assessment.data.riskLevel === 'Unknown') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary">Unknown</Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{assessment?.error || assessment?.data?.explanation || "Could not assess risk."}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    const { riskLevel, explanation } = assessment.data;

    const badgeVariant: "default" | "destructive" | "secondary" = 
      riskLevel === 'High' ? 'destructive' :
      riskLevel === 'Medium' ? 'default' : 'secondary';
    
    const Icon = 
      riskLevel === 'High' ? ShieldAlert :
      riskLevel === 'Medium' ? Shield : ShieldCheck;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant={badgeVariant} className={cn(
              "transition-all duration-300",
              riskLevel === 'Medium' && 'bg-amber-500 hover:bg-amber-600 text-white'
            )}>
              <Icon className="mr-1 h-3 w-3" />
              {riskLevel}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{explanation}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  if (trades.length === 0 && !isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks to display for the selected period. Add some stocks to see a report.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableCaption>A list of your stock reports.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead>Risk Level</TableHead>
            <TableHead className="text-right">Current Price</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Target 1</TableHead>
            <TableHead className="text-right">Period High</TableHead>
            <TableHead className="text-right">Period Low</TableHead>
            <TableHead className="text-center">News Summary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && trades.length === 0 && (
             [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24"/></TableCell>
                    <TableCell><Skeleton className="h-6 w-20"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 ml-auto"/></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-8 w-8 mx-auto" /></TableCell>
                </TableRow>
             ))
          )}
          {(!isLoading || trades.length > 0) && trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell>
                <Badge variant="secondary">{trade.stockSymbol}</Badge>
              </TableCell>
               <TableCell>
                {renderRiskBadge(trade.stockSymbol)}
              </TableCell>
              <TableCell className="text-right font-mono">{renderCellContent(trade.stockSymbol, 'currentPrice')}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{formatCurrency(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono text-primary font-semibold">{formatCurrency(trade.targetPrice1)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{renderCellContent(trade.stockSymbol, 'high')}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{renderCellContent(trade.stockSymbol, 'low')}</TableCell>
              <TableCell className="text-center">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onGetInsights(trade)}>
                        <Sparkles className="h-4 w-4 text-primary" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Get AI News Summary</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
