import { Text, type TextProps, type TextStyle } from 'react-native';
import { useColors } from '@/store/useThemeStore';
import { makeType } from '@/constants/theme';

export type TextVariant =
  | 'hero' | 'title' | 'heading' | 'subheading' | 'body' | 'bodySemiBold'
  | 'label' | 'caption' | 'overline' | 'score' | 'scoreBig';

type Tone = 'default' | 'muted' | 'accent' | 'loss' | 'halve' | 'onAccent';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Override the variant's color with a semantic tone. */
  tone?: Tone;
  /** Direct color override (wins over tone). */
  color?: string;
  center?: boolean;
}

// The single text primitive. Pulls font family + metrics from the type ramp and
// color from the active palette, so screens never hand-set fontFamily/color.
export function AppText({ variant = 'body', tone, color, center, style, ...rest }: AppTextProps) {
  const c = useColors();
  const t = makeType(c);
  const base = t[variant] as TextStyle;

  const toneColor =
    tone === 'muted' ? c.muted :
    tone === 'accent' ? c.accent :
    tone === 'loss' ? c.loss :
    tone === 'halve' ? c.halve :
    tone === 'onAccent' ? c.onAccent :
    undefined;

  return (
    <Text
      style={[base, center && { textAlign: 'center' }, toneColor != null && { color: toneColor }, color != null && { color }, style]}
      {...rest}
    />
  );
}
