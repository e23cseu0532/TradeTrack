
'use client';

import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Cylinder, OrbitControls } from '@react-three/drei';
import type { Mesh } from 'three';

function Coin() {
  const meshRef = useRef<Mesh>(null!);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <Cylinder args={[1, 1, 0.2, 64]} ref={meshRef} rotation-x={Math.PI / 2}>
      <meshStandardMaterial color="gold" metalness={0.8} roughness={0.2} />
    </Cylinder>
  );
}

export default function Coin3D() {
  return (
    <div style={{ width: '40px', height: '40px' }}>
      <Canvas camera={{ position: [0, 0, 2.5], fov: 50 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <Coin />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
