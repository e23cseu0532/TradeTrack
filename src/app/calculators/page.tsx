
"use client";

import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function CalculatorsPage() {
  return (
    <main className="min-h-screen bg-background animate-fade-in">
      <div className="container mx-auto p-4 py-8 md:p-8">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm -mx-4 -mt-8 px-4 pt-8 mb-10 flex items-center justify-between animate-fade-in-down pb-4 border-b">
          <div>
            <h1 className="text-4xl font-headline font-bold text-primary flex items-center gap-3">
              <Calculator className="h-10 w-10" />
              Financial Calculators
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Tools for technical analysis and trading.
            </p>
          </div>
          <Link href="/" passHref>
            <Button
              variant="outline"
              className="transition-transform duration-300 ease-in-out hover:scale-105"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </header>

        <Tabs defaultValue="gann" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="gann">Square of Nine</TabsTrigger>
            <TabsTrigger value="retracement">Retracement</TabsTrigger>
          </TabsList>
          <TabsContent value="gann">
            <Card className="transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
              <CardHeader>
                <CardTitle>Gann Square of Nine</CardTitle>
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
            <Card className="transition-all duration-300 ease-in-out hover:shadow-xl hover:-translate-y-1">
              <CardHeader>
                <CardTitle>Retracement Calculator</CardTitle>
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
  );
}
