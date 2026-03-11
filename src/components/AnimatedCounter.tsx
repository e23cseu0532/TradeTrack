
"use client";

import { useEffect, useState } from 'react';

type AnimatedCounterProps = {
  value?: number | null;
  precision?: number;
};

const AnimatedCounter = ({ value, precision = 2 }: AnimatedCounterProps) => {
  const [currentValue, setCurrentValue] = useState(value || 0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || value === null || value === undefined) return;

    const startValue = currentValue;
    const endValue = value;
    const duration = 500; // ms
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      
      const newDisplayValue = startValue + (endValue - startValue) * progress;
      setCurrentValue(newDisplayValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);

  }, [value, isMounted]);

  if (value === null || value === undefined) {
    return <span>N/A</span>;
  }

  // Use suppressHydrationWarning to handle the initial client-side jump
  return (
    <span suppressHydrationWarning>
      {isMounted ? currentValue.toFixed(precision) : value.toFixed(precision)}
    </span>
  );
};

export default AnimatedCounter;
