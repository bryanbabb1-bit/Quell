import { Children } from 'react';
import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { durations, easings, STAGGER_STEP } from '@/constants/motion';

// A section that "arrives" — FadeInUp (or FadeIn) with a stagger delay by index,
// so a screen's sections cascade in on mount instead of popping. Reduce-motion →
// renders plainly. Wrap each top-level section in <Reveal index={i}>.
export function Reveal({
  index = 0, delay = 0, type = 'up', children, style, ...rest
}: {
  index?: number;
  delay?: number;
  type?: 'up' | 'fade';
  children: ReactNode;
} & ViewProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <Animated.View style={style} {...rest}>{children}</Animated.View>;
  }
  const d = delay + index * STAGGER_STEP;
  const entering = (type === 'fade' ? FadeIn : FadeInUp)
    .duration(durations.base)
    .delay(d)
    .easing(easings.enter);
  return <Animated.View entering={entering} style={style} {...rest}>{children}</Animated.View>;
}

// Convenience: wrap a list of children, auto-assigning the stagger index.
export function Stagger({
  children, startDelay = 0, type = 'up',
}: {
  children: ReactNode;
  startDelay?: number;
  type?: 'up' | 'fade';
}) {
  return (
    <>
      {Children.toArray(children).map((c, i) => (
        <Reveal key={i} index={i} delay={startDelay} type={type}>{c}</Reveal>
      ))}
    </>
  );
}
