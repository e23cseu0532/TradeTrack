
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { PlusCircle, Settings2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { StockRecord } from "@/app/types/trade";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { stockList } from "@/lib/stock-list";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const optionalNumber = z.preprocess(
  (val) => (String(val).trim() === '' ? undefined : val),
  z.coerce.number().positive().optional()
);

const formSchema = z.object({
  stockSymbol: z.string().min(1, { message: "Required" }),
  entryPrice: z.coerce.number().positive({ message: "Required" }),
  stopLoss: z.coerce.number().positive({ message: "Required" }),
  targetPrice1: z.coerce.number().positive({ message: "Required" }),
  targetPrice2: optionalNumber,
  targetPrice3: optionalNumber,
  positionalTargetPrice: optionalNumber,
});

type AddTradeFormProps = {
  onAddTrade: (trade: Omit<StockRecord, "id" | "dateTime">) => void;
};

export default function AddTradeForm({ onAddTrade }: AddTradeFormProps) {
  const { toast } = useToast();
  const [isExtraOpen, setIsExtraOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stockSymbol: "",
      entryPrice: "" as any,
      stopLoss: "" as any,
      targetPrice1: "" as any,
      targetPrice2: "" as any,
      targetPrice3: "" as any,
      positionalTargetPrice: "" as any,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    onAddTrade(values);
    form.reset();
    toast({
      title: "Stock Added",
      description: `${values.stockSymbol} successfully recorded.`,
    });
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <FormField
                control={form.control}
                name="stockSymbol"
                render={({ field }) => (
                  <FormItem>
                    <Combobox
                      options={stockList}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Symbol"
                      searchPlaceholder="Search..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="entryPrice"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[10px] font-bold text-muted-foreground">₹</span>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Entry" {...field} className="pl-6 h-10" />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="stopLoss"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[10px] font-bold text-destructive/70">₹</span>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="SL" {...field} className="pl-6 h-10" />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="targetPrice1"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[10px] font-bold text-success/70">₹</span>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Target" {...field} className="pl-6 h-10" />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-3 flex gap-2">
              <Collapsible open={isExtraOpen} onOpenChange={setIsExtraOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
              <Button type="submit" className="w-full h-10 font-bold uppercase tracking-tight">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Trade
              </Button>
            </div>
          </div>

          <Collapsible open={isExtraOpen} onOpenChange={setIsExtraOpen}>
            <CollapsibleContent className="pt-2 animate-accordion-down">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/20">
                <FormField
                  control={form.control}
                  name="targetPrice2"
                  render={({ field }) => (
                    <FormItem>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Target 2</div>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Optional" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetPrice3"
                  render={({ field }) => (
                    <FormItem>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Target 3</div>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Optional" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="positionalTargetPrice"
                  render={({ field }) => (
                    <FormItem>
                      <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Positional</div>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Optional" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </form>
      </Form>
    </div>
  );
}
