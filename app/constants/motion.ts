import { Easing } from 'react-native-reanimated';

// Motion tokens — one source of truth so the whole app moves with a consistent
// hand. Extracted from the patterns the reveal screen established (FadeInUp
// entrances, count-up numerals, quad-ease arrivals). Keep durations short so
// the app feels alive, not slow.
export const durations = {
  quick: 200,
  base: 320,
  slow: 450,
  dramatic: 900,
  count: 420, // count-up numerals
} as const;

export const easings = {
  enter: Easing.out(Easing.quad),     // content arriving on screen
  standard: Easing.out(Easing.cubic), // general transitions
  linear: Easing.linear,
} as const;

// Delay (ms) between staggered siblings so sections cascade in rather than pop.
export const STAGGER_STEP = 60;

// Press-scale feel (shared by PressableScale + Button).
export const PRESS_SCALE = 0.97;
export const PRESS_IN_MS = 90;
export const PRESS_OUT_MS = 120;
