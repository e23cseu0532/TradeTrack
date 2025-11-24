
"use client";

import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Cylinder } from '@react-three/drei';
import type { Mesh } from 'three';

function Coin() {
  const meshRef = useRef<Mesh>(null!);

  // Rotate the coin on each frame
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5; // Adjust rotation speed here
      meshRef.current.rotation.x = Math.PI / 2; // Keep it upright
    }
  });

  return (
    <Cylinder ref={meshRef} args={[1, 1, 0.1, 64]}>
      <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
    </Cylinder>
  );
}

export default function Coin3D() {
  return (
    <div className="h-10 w-10">
        <Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
            <Suspense fallback={null}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={1.5} />
                <directionalLight position={[-10, -10, -5]} intensity={0.5} />
                <Coin />
            </Suspense>
        </Canvas>
    </div>
  );
}
