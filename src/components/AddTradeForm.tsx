"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { Clock, PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Trade } from "@/app/types/trade";
import { useToast } from "@/hooks/use-toast";

const stockSymbols = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "HINDUNILVR", 
  "ICICIBANK", "KOTAKBANK", "SBIN", "BAJFINANCE", "BHARTIARTL",
  "ASIANPAINT", "HCLTECH", "MARUTI", "LT", "WIPRO"
];

const formSchema = z.object({
  stockSymbol: z.string().min(1, { message: "Please select a stock symbol." }),
  entryPrice: z.coerce.number().positive({ message: "Entry price must be a positive number." }),
  stopLoss: z.coerce.number().positive({ message: "Stop loss must be a positive number." }),
  targetPrice: z.coerce.number().positive({ message: "Target price must be a positive number." }),
});

type AddTradeFormProps = {
  onAddTrade: (trade: Omit<Trade, "id" | "dateTime">) => void;
};

export default function AddTradeForm({ onAddTrade }: AddTradeFormProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stockSymbol: "",
      entryPrice: undefined,
      stopLoss: undefined,
      targetPrice: undefined,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onAddTrade(values);
    form.reset();
    toast({
      title: "Trade Added",
      description: `${values.stockSymbol} has been added to your records.`,
    });
  }

  return (
    <div>
      <div className="mb-6 rounded-md border bg-muted/50 p-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {currentTime ? (
            <span>{format(currentTime, "PPP p")}</span>
          ) : (
            <span>Loading time...</span>
          )}
        </div>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="stockSymbol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stock Symbol</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a stock" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {stockSymbols.map((symbol) => (
                      <SelectItem key={symbol} value={symbol}>
                        {symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="entryPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Price</FormLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stopLoss"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stop Loss</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="targetPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Price</FormLabel>
                 <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} className="pl-7"/>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" size="lg">
            <PlusCircle />
            Add Trade Record
          </Button>
        </form>
      </Form>
    </div>
  );
}
