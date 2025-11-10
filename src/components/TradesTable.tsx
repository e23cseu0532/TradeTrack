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
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "./ui/skeleton";

type TradesTableProps = {
  trades: StockRecord[];
  onDeleteTrade: (tradeId: string) => void;
  isLoading: boolean;
};

export default function TradesTable({ trades, onDeleteTrade, isLoading }: TradesTableProps) {
  if (isLoading) {
    return (
      <div className="w-full overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Date & Time</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Entry Price</TableHead>
              <TableHead className="text-right">Stop Loss</TableHead>
              <TableHead className="text-right">Target 1</TableHead>
              <TableHead className="text-right">Target 2</TableHead>
              <TableHead className="text-right">Target 3</TableHead>
              <TableHead className="text-right">Positional</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell className="text-center"><Skeleton className="h-8 w-8 mx-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
        <p className="text-muted-foreground">
          No stocks recorded yet. Add one to get started!
        </p>
      </div>
    );
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };
  
  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) {
      return "Invalid date";
    }
    return timestamp.toDate().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table>
        <TableCaption>A list of your recent tracked stocks.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Date & Time</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Target 1</TableHead>
            <TableHead className="text-right">Target 2</TableHead>
            <TableHead className="text-right">Target 3</TableHead>
            <TableHead className="text-right">Positional</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id} className="transition-colors hover:bg-muted/50">
              <TableCell className="font-medium">{formatDate(trade.dateTime)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{trade.stockSymbol}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(trade.entryPrice)}</TableCell>
              <TableCell className="text-right font-mono text-destructive">{formatCurrency(trade.stopLoss)}</TableCell>
              <TableCell className="text-right font-mono text-primary font-semibold">{formatCurrency(trade.targetPrice1)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.targetPrice2)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.targetPrice3)}</TableCell>
              <TableCell className="text-right font-mono text-primary">{formatCurrency(trade.positionalTargetPrice)}</TableCell>
              <TableCell className="text-center">
                 <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">Delete trade</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this stock record.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDeleteTrade(trade.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
