
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
};

export default function StockObject3D({ position, stock, currentPrice, dayChange, onClick }: StockObject3DProps) {
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
    return baseRadius + (hovered ? 0.2 : 0);
  }, [currentPrice, stock.entryPrice, hovered]);
  

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
          emissiveIntensity={hovered ? 1.5 : 0.5}
          metalness={0.8}
          roughness={0.1}
          toneMapped={false}
        />
        <pointLight color={color} intensity={hovered ? 3 : 1} distance={sphereRadius * 3} />
      </mesh>

       {/* Planetary Rings */}
        <Torus args={[sphereRadius + 0.5, 0.05, 8, 64]} rotation={[Math.PI / 2, 0.3, 0]}>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.2} roughness={0.9} />
        </Torus>
        <Torus args={[sphereRadius + 0.7, 0.03, 8, 64]} rotation={[Math.PI / 2, 0.3, 0]}>
            <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.1} roughness={0.9} />
        </Torus>


      {/* Symbol Text with Billboard to always face camera */}
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

      {/* HTML tooltip on hover */}
      {hovered && (
        <Html position={[0, sphereRadius + 1.5, 0]} center>
          <div className="bg-black/80 text-white border border-primary/50 p-2 rounded-lg shadow-lg text-xs w-48 backdrop-blur-sm pointer-events-none">
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
