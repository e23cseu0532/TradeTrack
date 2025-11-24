"use client";

import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Text } from '@react-three/drei';
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from 'firebase/firestore';

import type { StockRecord } from '@/app/types/trade';
import type { StockData } from '@/app/types/stock';

import StockObject3D from '@/components/StockObject3D';
import { Loader2 } from 'lucide-react';

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

  return (
    <main className="h-screen w-full relative">
       <header className="absolute top-0 left-0 z-10 p-4 md:p-8 w-full bg-gradient-to-b from-background to-transparent">
          <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider">
            Portfolio Explorer
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            A 3D visualization of your stock watchlist. Pan, zoom, and rotate to explore.
          </p>
        </header>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading 3D Portfolio...</p>
          </div>
        </div>
      )}

      <Canvas camera={{ position: [0, 5, 25], fov: 60 }}>
        <Suspense fallback={null}>
          <Environment preset="city" />
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[10, 20, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          
          <group position={[-(tradesList.length / 2) * 3, 0, 0]}>
            {tradesList.map((trade, index) => {
              const data = stockData[trade.stockSymbol];
              const dailyChange = data?.currentPrice ? ((data.currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;
              
              return (
                <StockObject3D
                  key={trade.id}
                  position={[index * 3, 0, 0]}
                  stock={trade}
                  currentPrice={data?.currentPrice}
                  dayChange={dailyChange}
                />
              );
            })}
          </group>

           <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
          </mesh>

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            minDistance={5}
            maxDistance={50}
            maxPolarAngle={Math.PI / 2 - 0.1}
          />

           {tradesList.length === 0 && !isLoading && (
              <Text
                position={[0, 2, 0]}
                fontSize={1}
                color="white"
                anchorX="center"
                anchorY="middle"
              >
                No stocks in your watchlist to explore.
              </Text>
           )}
        </Suspense>
      </Canvas>
    </main>
  );
}
