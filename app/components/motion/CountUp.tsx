import { useEffect, useRef, useState } from 'react';
import { Text, type TextProps, type TextStyle, type StyleProp } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { durations } from '@/constants/motion';

// Tick a number up to `target` — pure requestAnimationFrame so numerals climb
// naturally, decoupled from the frame scheduler. Extracted from the reveal
// screen's useCountUp. Honors reduce-motion (jumps straight to the value).
//
//  - default: animates from the PREVIOUS value (continuous updates).
//  - pass `from: 0` to always climb from zero (e.g. a stat on first load).
//  - pass `resetKey` to force a re-count even when the target is unchanged
//    (the reveal counts 0→gross fresh on every hole).
export function useCountUp(
  target: number,
  opts?: { duration?: number; from?: number; resetKey?: unknown }
): number {
  const reduced = useReducedMotion();
  const [n, setN] = useState(() => opts?.from ?? 0);
  const prev = useRef(opts?.from ?? 0);

  useEffect(() => {
    if (reduced) { setN(target); prev.current = target; return; }
    const from = opts?.from ?? prev.current;
    const dur = opts?.duration ?? durations.count;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setN(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced, opts?.resetKey]);

  return n;
}

export function CountUp({
  value, duration, from, resetKey, format, style, ...rest
}: {
  value: number;
  duration?: number;
  from?: number;
  resetKey?: unknown;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
} & Omit<TextProps, 'style'>) {
  const n = useCountUp(value, { duration, from, resetKey });
  return <Text style={style} {...rest}>{format ? format(n) : n}</Text>;
}
