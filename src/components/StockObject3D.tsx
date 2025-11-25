
"use client";

import { useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Html, Torus, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { StockRecord } from '@/app/types/trade';

type StockObject3DProps = {
  position: [number, number, number];
  stock: StockRecord;
  currentPrice?: number;
  dayChange: number;
  onClick: () => void;
  onUnfocus: () => void;
  isFocused: boolean;
};

export default function StockObject3D({ position, stock, currentPrice, dayChange, onClick, onUnfocus, isFocused }: StockObject3DProps) {
  const meshRef = useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);

  // Animate rotation
  useFrame((state, delta) => {
    if (meshRef.current) {
        meshRef.current.rotation.y += delta * 0.1;
        meshRef.current.rotation.x += delta * 0.05;
    }
  });

  // Determine color and emissive properties based on performance
  const { color, emissive } = useMemo(() => {
    if (dayChange > 0) {
      return { color: new THREE.Color('#22c55e'), emissive: new THREE.Color('#16a34a') }; // Green
    } else if (dayChange < 0) {
      return { color: new THREE.Color('#ef4444'), emissive: new THREE.Color('#dc2626') }; // Red
    }
    return { color: new THREE.Color('#64748b'), emissive: new THREE.Color('#475569') }; // Gray
  }, [dayChange]);

  const sphereRadius = useMemo(() => {
    // Normalize the current price to a reasonable radius. Default to entry price if current not available.
    const price = currentPrice || stock.entryPrice;
    // Use a logarithmic scale to prevent extreme size differences
    const baseRadius = Math.max(0.5, Math.log(price / 50 + 1));
    return baseRadius + (hovered || isFocused ? 0.2 : 0);
  }, [currentPrice, stock.entryPrice, hovered, isFocused]);
  
  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null) return "N/A";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };


  return (
    <group ref={meshRef} position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[sphereRadius, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={hovered || isFocused ? 1.5 : 0.5}
          metalness={0.8}
          roughness={0.1}
          toneMapped={false}
        />
        <pointLight color={color} intensity={hovered || isFocused ? 3 : 1} distance={sphereRadius * 3} />
      </mesh>

       {/* Planetary Rings */}
        <Torus args={[sphereRadius + 0.5, 0.05, 8, 64]} rotation={[Math.PI / 2, 0.3, 0]}>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.2} roughness={0.9} />
        </Torus>
        <Torus args={[sphereRadius + 0.7, 0.03, 8, 64]} rotation={[Math.PI / 2, 0.3, 0]}>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.1} roughness={0.9} />
        </Torus>


      {/* Symbol Text with Billboard to always face camera */}
      {!isFocused && (
        <Billboard>
            <Text
            position={[0, sphereRadius + 1, 0]}
            fontSize={0.4}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineColor="#000000"
            outlineWidth={0.01}
            >
            {stock.stockSymbol}
            </Text>
        </Billboard>
      )}

      {/* Simple Info Panel on Hover (non-focused) */}
      {hovered && !isFocused && (
         <Html position={[0, sphereRadius + 1.5, 0]} center>
            <div className="bg-black/80 text-white border border-primary/50 p-3 rounded-lg shadow-lg w-48 backdrop-blur-sm pointer-events-none text-xs space-y-1">
                <h3 className="font-bold text-sm text-primary">{stock.stockSymbol}</h3>
                <div className="grid grid-cols-2 gap-x-2">
                    <p className="text-muted-foreground">Current:</p>
                    <p className="font-mono text-right">{formatCurrency(currentPrice)}</p>
                    <p className="text-muted-foreground">Entry:</p>
                    <p className="font-mono text-right">{formatCurrency(stock.entryPrice)}</p>
                    <p className="text-muted-foreground">Change:</p>
                    <p className={`font-mono text-right ${dayChange >= 0 ? 'text-success' : 'text-destructive'}`}>{dayChange.toFixed(2)}%</p>
                </div>
            </div>
         </Html>
      )}


      {/* Detailed Info Panel on Focus */}
      {isFocused && (
        <Html position={[sphereRadius + 1, 0, 0]} center>
          <div className="bg-black/80 text-white border border-primary/50 p-4 rounded-lg shadow-lg w-64 backdrop-blur-sm pointer-events-none text-sm space-y-2">
            <h3 className="font-bold text-lg text-primary">{stock.stockSymbol}</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <p className="text-muted-foreground">Current Price:</p>
                <p className="font-mono text-right">{formatCurrency(currentPrice)}</p>

                <p className="text-muted-foreground">Entry Price:</p>
                <p className="font-mono text-right">{formatCurrency(stock.entryPrice)}</p>
                
                <p className="text-muted-foreground">Stop Loss:</p>
                <p className="font-mono text-destructive text-right">{formatCurrency(stock.stopLoss)}</p>

                <p className="text-muted-foreground">Target 1:</p>
                <p className="font-mono text-success text-right">{formatCurrency(stock.targetPrice1)}</p>

                {stock.targetPrice2 && (
                    <>
                        <p className="text-muted-foreground">Target 2:</p>
                        <p className="font-mono text-success/80 text-right">{formatCurrency(stock.targetPrice2)}</p>
                    </>
                )}

                {stock.targetPrice3 && (
                    <>
                        <p className="text-muted-foreground">Target 3:</p>
                        <p className="font-mono text-success/80 text-right">{formatCurrency(stock.targetPrice3)}</p>
                    </>
                )}
                 {stock.positionalTargetPrice && (
                    <>
                        <p className="text-muted-foreground">Positional:</p>
                        <p className="font-mono text-success/80 text-right">{formatCurrency(stock.positionalTargetPrice)}</p>
                    </>
                )}
            </div>
             <p 
                className="text-xs text-center pt-2 text-muted-foreground cursor-pointer pointer-events-auto"
                onClick={(e) => { e.stopPropagation(); onUnfocus(); }}
             >
                Click to exit focus.
             </p>
          </div>
        </Html>
      )}
    </group>
  );
}

