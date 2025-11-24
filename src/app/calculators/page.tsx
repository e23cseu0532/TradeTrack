"use client";

import { Calculator } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GannSquareCalculator from "@/components/GannSquareCalculator";
import RetracementCalculator from "@/components/RetracementCalculator";
import AppLayout from "@/components/AppLayout";

export default function CalculatorsPage() {
  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3 justify-center md:justify-start">
                <Calculator className="h-10 w-10" />
                Financial Calculators
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Tools for technical analysis and trading.
              </p>
            </div>
          </header>

          <Tabs defaultValue="gann" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="gann">Square of Nine</TabsTrigger>
              <TabsTrigger value="retracement">Retracement</TabsTrigger>
            </TabsList>
            <TabsContent value="gann">
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline">Gann Square of Nine</CardTitle>
                  <CardDescription>
                    Find key support and resistance levels based on a stock's
                    price.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GannSquareCalculator />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="retracement">
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline">Retracement Calculator</CardTitle>
                  <CardDescription>
                    Calculate key 1/3, 1/2, and 2/3 retracement levels between two price points.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RetracementCalculator />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </AppLayout>
  );
}
