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
import type { Trade } from "@/app/types/trade";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";

const stockSymbols = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "HINDUNILVR", 
  "ICICIBANK", "KOTAKBANK", "SBIN", "BAJFINANCE", "BHARTIARTL",
  "ASIANPAINT", "HCLTECH", "MARUTI", "LT", "WIPRO"
].map(symbol => ({ value: symbol, label: symbol }));


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
      entryPrice: "" as any,
      stopLoss: "" as any,
      targetPrice: "" as any,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onAddTrade(values);
    form.reset();
     toast({
      title: "Stock Added",
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
              <FormItem className="flex flex-col">
                <FormLabel>Stock Symbol</FormLabel>
                <Combobox
                  options={stockSymbols}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select a stock..."
                  searchPlaceholder="Search for a stock..."
                  notFoundMessage="No stock found."
                />
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
            Add Stock Record
          </Button>
        </form>
      </Form>
    </div>
  );
}
