
"use client";

import { useEffect, useState } from 'react';

type AnimatedCounterProps = {
  value?: number | null;
  precision?: number;
};

const AnimatedCounter = ({ value, precision = 2 }: AnimatedCounterProps) => {
  const [currentValue, setCurrentValue] = useState(value || 0);

  useEffect(() => {
    if (value === null || value === undefined) return;

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

  }, [value]);

  if (value === null || value === undefined) {
    return <span>N/A</span>;
  }

  return <span>{currentValue.toFixed(precision)}</span>;
};

export default AnimatedCounter;
