"use client";

import { useState, useEffect, Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from 'firebase/firestore';
import * as THREE from 'three';

import type { StockRecord } from '@/app/types/trade';
import type { StockData } from '@/app/types/stock';

import StockObject3D from '@/components/StockObject3D';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';

export default function PortfolioExplorerPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [stockData, setStockData] = useState<StockData>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);

  const stockRecordsCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/stockRecords`);
  }, [user, firestore]);
  
  const { data: trades, isLoading: tradesLoading } = useCollection<StockRecord>(stockRecordsCollection);
  const tradesList = trades || [];

  useEffect(() => {
    if (tradesList.length > 0) {
      setIsLoadingPrices(true);
      const uniqueSymbols = [...new Set(tradesList.map(t => t.stockSymbol))];
      const fetches = uniqueSymbols.map(symbol =>
        fetch(`/api/yahoo-finance?symbol=${symbol}&from=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&to=${new Date().toISOString()}`)
          .then(res => res.json())
          .then(data => ({ symbol, data }))
          .catch(err => {
            console.error(`Failed to fetch data for ${symbol}`, err);
            return { symbol, error: true };
          })
      );

      Promise.all(fetches).then(results => {
        const newStockData: StockData = {};
        results.forEach(result => {
          if (result && !result.error) {
            newStockData[result.symbol] = {
              currentPrice: result.data?.currentPrice,
              high: result.data?.high,
              low: result.data?.low,
              loading: false,
              error: false,
            };
          } else {
             newStockData[result.symbol] = { loading: false, error: true };
          }
        });
        setStockData(newStockData);
        setIsLoadingPrices(false);
      });
    } else if (!tradesLoading) {
      setIsLoadingPrices(false);
    }
  }, [tradesList, tradesLoading]);

  const isLoading = tradesLoading || isUserLoading || isLoadingPrices;

  // Distribute stocks in a sphere for a galaxy-like layout
  const stockPositions = useMemo(() => {
    const positions = [];
    const count = tradesList.length;
    const phi = Math.PI * (3. - Math.sqrt(5.)); // golden angle in radians

    for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
        const radius = Math.sqrt(1 - y * y); // radius at y

        const theta = phi * i; // golden angle increment

        const x = Math.cos(theta) * radius * count * 1.5;
        const z = Math.sin(theta) * radius * count * 1.5;
        
        positions.push(new THREE.Vector3(x, y * 5, z));
    }
    return positions;
  }, [tradesList.length]);

  return (
    <AppLayout>
      <main className="h-screen w-full relative">
        <header className="absolute top-0 left-0 z-10 p-4 md:p-8 w-full bg-gradient-to-b from-background/80 to-transparent">
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider">
              Portfolio Galaxy
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              An immersive 3D visualization of your stock watchlist.
            </p>
          </header>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading Portfolio Galaxy...</p>
            </div>
          </div>
        )}

        <Canvas camera={{ position: [0, 5, 40], fov: 75 }} onCreated={({ gl }) => gl.setClearColor('#000000')}>
          <Suspense fallback={null}>
            <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade />
            <ambientLight intensity={0.2} />
            <directionalLight
              position={[10, 20, 5]}
              intensity={1.0}
            />
            
            <group>
              {!isLoading && tradesList.map((trade, index) => {
                const data = stockData[trade.stockSymbol];
                const dailyChange = data?.currentPrice ? ((data.currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;
                
                return (
                  <StockObject3D
                    key={trade.id}
                    position={stockPositions[index] ? [stockPositions[index].x, stockPositions[index].y, stockPositions[index].z] : [0,0,0]}
                    stock={trade}
                    currentPrice={data?.currentPrice}
                    dayChange={dailyChange}
                  />
                );
              })}
            </group>

            <OrbitControls
              enablePan={true}
              enableZoom={true}
              minDistance={5}
              maxDistance={100}
            />

            {tradesList.length === 0 && !isLoading && (
                <Text
                  position={[0, 0, 0]}
                  fontSize={1.5}
                  color="white"
                  anchorX="center"
                  anchorY="middle"
                  outlineColor="#000000"
                  outlineWidth={0.02}
                >
                  Your galaxy is empty. Add stocks to begin exploring.
                </Text>
            )}
          </Suspense>
        </Canvas>
      </main>
    </AppLayout>
  );
}
