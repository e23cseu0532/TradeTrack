

"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Billboard } from '@react-three/drei';
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from 'firebase/firestore';
import * as THREE from 'three';

import type { StockRecord } from '@/app/types/trade';
import type { StockData } from '@/app/types/stock';

import StockObject3D from '@/components/StockObject3D';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { EffectComposer, Bloom } from '@react-three/postprocessing';


const defaultCameraPosition = new THREE.Vector3(0, 5, 40);
const defaultCameraTarget = new THREE.Vector3(0, 0, 0);

const CameraController = ({ targetPosition, controlsRef }: { targetPosition: THREE.Vector3 | null, controlsRef: any }) => {
  useFrame((state) => {
    if (!controlsRef.current) return;

    if (targetPosition) {
      // If there's a target, smoothly move the camera towards it
      const idealOffset = new THREE.Vector3(0, 0, 10);
      const idealPosition = targetPosition.clone().add(idealOffset);

      state.camera.position.lerp(idealPosition, 0.05);
      controlsRef.current.target.lerp(targetPosition, 0.05);
    } else {
        // When no stock is focused, smoothly move back to the default overview position if not already there.
        // This check prevents the controller from fighting user input.
        const isAtDefaultPosition = state.camera.position.distanceTo(defaultCameraPosition) < 0.1;
        const isTargetAtDefault = controlsRef.current.target.distanceTo(defaultCameraTarget) < 0.1;

        if (!isAtDefaultPosition || !isTargetAtDefault) {
            state.camera.position.lerp(defaultCameraPosition, 0.05);
            controlsRef.current.target.lerp(defaultCameraTarget, 0.05);
        }
    }
  });
  return null;
};


export default function PortfolioExplorerPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [stockData, setStockData] = useState<StockData>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);
  const [focusedStock, setFocusedStock] = useState<{id: string, position: THREE.Vector3} | null>(null);

  const controlsRef = useRef();

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
    const positions = new Map<string, THREE.Vector3>();
    const count = tradesList.length;
    if (count === 0) return positions;
    
    const phi = Math.PI * (3. - Math.sqrt(5.)); // golden angle in radians
    const baseRadius = 15; // Controls the base size of the galaxy

    for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
        const radiusAtY = Math.sqrt(1 - y * y); // radius at y

        const theta = phi * i; // golden angle increment

        // Scale the sphere radius based on the number of stocks
        const sphereRadius = baseRadius + count * 0.5;

        const x = Math.cos(theta) * radiusAtY * sphereRadius;
        const z = Math.sin(theta) * radiusAtY * sphereRadius;
        const yPos = y * sphereRadius * 0.5; // Make the galaxy flatter
        
        positions.set(tradesList[i].id, new THREE.Vector3(x, yPos, z));
    }
    return positions;
  }, [tradesList]);

  const handleStockClick = (tradeId: string, position: THREE.Vector3) => {
    setFocusedStock({ id: tradeId, position: position });
  };
  
  const handleCanvasClick = (event: any) => {
      // Check if the click is on the background (not a planet)
      if (event.target === event.currentTarget) {
          setFocusedStock(null);
      }
  };

  return (
    <AppLayout>
      <main className="h-screen w-full relative" onClick={handleCanvasClick}>
        <header className="absolute top-0 left-0 z-10 p-4 md:p-8 w-full pointer-events-none">
            <h1 className="text-4xl font-headline font-bold text-primary uppercase tracking-wider">
              Portfolio Galaxy
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">
              An immersive 3D visualization of your stock watchlist. Click a planet to focus.
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

        <Canvas camera={{ position: defaultCameraPosition, fov: 75 }} onCreated={({ gl }) => gl.setClearColor('#000000')}>
          <Suspense fallback={null}>
            <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade />
            <ambientLight intensity={0.2} />
            <directionalLight
              position={[10, 20, 5]}
              intensity={1.0}
            />
            
            <group>
              {!isLoading && tradesList.map((trade) => {
                const data = stockData[trade.stockSymbol];
                const dailyChange = data?.currentPrice ? ((data.currentPrice - trade.entryPrice) / trade.entryPrice) * 100 : 0;
                const position = stockPositions.get(trade.id) || new THREE.Vector3(0,0,0);
                
                return (
                  <StockObject3D
                    key={trade.id}
                    position={[position.x, position.y, position.z]}
                    stock={trade}
                    currentPrice={data?.currentPrice}
                    dayChange={dailyChange}
                    onClick={() => handleStockClick(trade.id, position)}
                    onUnfocus={() => setFocusedStock(null)}
                    isFocused={focusedStock?.id === trade.id}
                  />
                );
              })}
            </group>

            <OrbitControls
              ref={controlsRef as any}
              enablePan={false}
              enableZoom={true}
              minDistance={5}
              maxDistance={100}
            />
            
            <CameraController targetPosition={focusedStock?.position || null} controlsRef={controlsRef} />

            <EffectComposer>
              <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} height={300} />
            </EffectComposer>

            {tradesList.length === 0 && !isLoading && (
              <Billboard>
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
              </Billboard>
            )}
          </Suspense>
        </Canvas>
      </main>
    </AppLayout>
  );
}
