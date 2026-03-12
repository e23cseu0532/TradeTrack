"use client";

import { useEffect, useState } from 'react';

type AnimatedCounterProps = {
  value?: number | null;
  precision?: number;
};

const AnimatedCounter = ({ value, precision = 2 }: AnimatedCounterProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || 0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || value === null || value === undefined) return;

    const startValue = currentValue;
    const endValue = value;
    const duration = 400; // Fast animation for market data
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const val = startValue + (endValue - startValue) * progress;
      setCurrentValue(val);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [value, isMounted]);

  if (!isMounted) {
    return <span suppressHydrationWarning>--</span>;
  }

  if (value === null || value === undefined) {
    return <span>N/A</span>;
  }

  return (
    <span suppressHydrationWarning className="tabular-nums">
      {currentValue.toFixed(precision)}
    </span>
  );
};

export default AnimatedCounter;
