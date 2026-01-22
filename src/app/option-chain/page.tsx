
"use client";

import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfToday } from "date-fns";
import { useFirestore } from "@/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import OptionChainTable from "@/components/OptionChainTable";
import { OptionChainSnapshot, OptionDataPoint, DailyOptionData } from "@/app/types/option-chain";
import { Loader2, Activity } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";

const timeIntervals = [
  "09:15", "09:45", "10:15", "10:45", "11:15", "11:45",
  "12:15", "12:45", "13:15", "13:45", "14:15", "14:45", "15:15", "15:30"
];

function getNearestInterval() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let closest = "09:15";
    let minDiff = Infinity;

    for (const interval of timeIntervals) {
        const [h, m] = interval.split(':').map(Number);
        const intervalMinutes = h * 60 + m;
        const diff = Math.abs(nowMinutes - intervalMinutes);
        if (diff < minDiff) {
            minDiff = diff;
            closest = interval;
        }
    }
    return closest;
}

export default function OptionChainPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string>(getNearestInterval());
  const [snapshot, setSnapshot] = useState<OptionChainSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const firestore = useFirestore();

  const fetchData = async (date: Date, time: string) => {
    setIsLoading(true);
    setError(null);
    if (!firestore) {
      setError("Firestore is not available.");
      setIsLoading(false);
      return;
    }
    
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const intervalKey = time.replace(':', '');
      const docRef = doc(firestore, "optionChainData", dateStr);

      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as DailyOptionData;
        if (data.intervals && data.intervals[intervalKey]) {
          const cachedSnapshot = data.intervals[intervalKey];
          setSnapshot(cachedSnapshot);
          setLastUpdated(cachedSnapshot.timestamp.toDate());
          setIsLoading(false);
          return;
        }
      }

      const res = await fetch(`/api/nse-data?date=${dateStr}&time=${time}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch option chain data.");
      }
      const nseData = await res.json();

      const newSnapshot: OptionChainSnapshot = {
        ...nseData,
        timestamp: Timestamp.now(),
      };
      setSnapshot(newSnapshot);
      setLastUpdated(newSnapshot.timestamp.toDate());
      
      await setDoc(docRef, {
          intervals: {
              [intervalKey]: newSnapshot
          }
      }, { merge: true });

    } catch (err: any) {
      setError(err.message);
      setSnapshot(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDate && selectedTime && firestore) {
      fetchData(selectedDate, selectedTime);
    }
  }, [selectedDate, selectedTime, firestore]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const latestInterval = getNearestInterval();
      setSelectedDate(startOfToday());
      setSelectedTime(latestInterval);
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(intervalId);
  }, []);

  const { calls, puts, atmStrike } = useMemo(() => {
    if (!snapshot || !snapshot.calls || !snapshot.puts) {
      return { calls: [], puts: [], atmStrike: null };
    }

    const underlying = snapshot.underlyingValue;
    const allStrikes = [...new Set(snapshot.calls.map(c => c.strikePrice))].sort((a, b) => a - b);
    
    if (allStrikes.length === 0) {
      return { calls: [], puts: [], atmStrike: null };
    }
    
    const closestStrike = allStrikes.reduce((prev, curr) => 
      Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev
    );

    const atmIndex = allStrikes.findIndex(s => s === closestStrike);
    if (atmIndex === -1) {
       return { calls: [], puts: [], atmStrike: null };
    }

    const startIndex = Math.max(0, atmIndex - 4);
    const endIndex = Math.min(allStrikes.length, atmIndex + 5);
    const visibleStrikes = allStrikes.slice(startIndex, endIndex);

    const filterAndMap = (data: OptionDataPoint[]) => {
      return visibleStrikes.map(strike => {
        return data.find(d => d.strikePrice === strike) || { strikePrice: strike, ltp: 0, iv: 0, oiChange: 0, oi: 0 };
      }).sort((a,b) => a.strikePrice - b.strikePrice);
    };

    return {
      calls: filterAndMap(snapshot.calls),
      puts: filterAndMap(snapshot.puts),
      atmStrike: closestStrike,
    };
  }, [snapshot]);

  return (
    <AppLayout>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto p-0">
          <header className="mb-10 animate-fade-in-down">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider flex items-center gap-3 justify-center md:justify-start">
                <Activity className="h-10 w-10" />
                NIFTY Option Chain
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">
                Near real-time options data, updated every 30 minutes.
              </p>
            </div>
          </header>

          <Card className="mb-8">
             <CardHeader>
                <CardTitle className="font-headline">Data Snapshot</CardTitle>
                <CardDescription>Select the date and time for the option chain data you want to view.</CardDescription>
             </CardHeader>
             <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex justify-center">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date > new Date() || date < subDays(new Date(), 1)}
                        className="rounded-md border"
                    />
                </div>

                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold mb-2">Time Interval</h4>
                        <Select value={selectedTime} onValueChange={setSelectedTime}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a time" />
                            </SelectTrigger>
                            <SelectContent>
                                {timeIntervals.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    {lastUpdated && (
                        <p className="text-sm text-muted-foreground text-center md:text-left">
                            Last updated: {format(lastUpdated, "PPpp")}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-center">
                    <div className="text-center p-6 border rounded-lg bg-muted/30 w-full">
                        <h4 className="font-semibold text-muted-foreground">NIFTY Underlying Value</h4>
                        <div className="font-mono text-4xl font-bold text-primary">
                            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto"/> : <AnimatedCounter value={snapshot?.underlyingValue || 0} precision={2}/>}
                        </div>
                    </div>
                </div>

             </CardContent>
          </Card>
          
          {error && <p className="text-destructive text-center">{error}</p>}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <OptionChainTable title="Calls" data={calls} isLoading={isLoading} atmStrike={atmStrike} />
              <OptionChainTable title="Puts" data={puts} isLoading={isLoading} atmStrike={atmStrike} />
          </div>

        </div>
      </main>
    </AppLayout>
  );
}

