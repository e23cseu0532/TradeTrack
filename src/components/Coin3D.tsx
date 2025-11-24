
'use client';

import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Cylinder, OrbitControls } from '@react-three/drei';
import type { Mesh } from 'three';

function Coin() {
  const meshRef = useRef<Mesh>(null!);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5; // Slower rotation
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
    <Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 5, 5]} intensity={2} />
      <Suspense fallback={null}>
        <Coin />
      </Suspense>
    </Canvas>
  );
}
