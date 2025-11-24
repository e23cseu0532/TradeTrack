
"use client";

import { useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { StockRecord } from '@/app/types/trade';

type StockObject3DProps = {
  position: [number, number, number];
  stock: StockRecord;
  currentPrice?: number;
  dayChange: number;
};

export default function StockObject3D({ position, stock, currentPrice, dayChange }: StockObject3DProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  // Animate rotation
  useFrame((state, delta) => {
    meshRef.current.rotation.y += delta * 0.1;
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

  const boxHeight = useMemo(() => {
     // Normalize the entry price to a reasonable height, e.g., 1 unit per 100 price points.
    const baseHeight = Math.max(1, (stock.entryPrice / 100));
    // Add a small hover effect
    return baseHeight + (hovered ? 0.5 : 0);
  }, [stock.entryPrice, hovered]);
  

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        scale={[1, boxHeight, 1]}
        onClick={() => setActive(!active)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[2, 1, 2]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={hovered ? 0.75 : 0.25}
          metalness={0.6}
          roughness={0.2}
          toneMapped={false}
          transparent
          opacity={hovered ? 1.0 : 0.85}
        />
      </mesh>

      {/* Symbol Text above the object */}
      <Text
        position={[0, boxHeight / 2 + 1.2, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {stock.stockSymbol}
      </Text>

      {/* HTML tooltip on hover */}
      {hovered && (
        <Html position={[0, boxHeight / 2 + 2, 0]}>
          <div className="bg-background/80 text-foreground border border-border p-2 rounded-lg shadow-lg text-xs w-48 backdrop-blur-sm">
            <h3 className="font-bold text-primary">{stock.stockSymbol}</h3>
            <p>Entry: <span className="font-mono">{stock.entryPrice.toFixed(2)}</span></p>
            <p>Current: <span className="font-mono">{currentPrice ? currentPrice.toFixed(2) : 'N/A'}</span></p>
            <p>Change: <span className={`font-mono ${dayChange > 0 ? 'text-success' : 'text-destructive'}`}>{dayChange.toFixed(2)}%</span></p>
          </div>
        </Html>
      )}
    </group>
  );
}
