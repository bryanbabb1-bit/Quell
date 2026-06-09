import { View, StyleSheet } from 'react-native';
import { AppText } from './AppText';

// Deterministic avatar: initials on a color picked by hashing the name, so the
// same player always gets the same hue. Dark text reads on every bright hue.
const AVATAR_COLORS = ['#36E27D', '#7C83FF', '#FF9A5A', '#2DD4D4', '#FFD166', '#FF5A5F', '#5EC2FF', '#C98BFF'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const label = (name ?? '?').trim() || '?';
  const initials =
    label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const bg = AVATAR_COLORS[hash(label) % AVATAR_COLORS.length];
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <AppText variant="bodySemiBold" color="#0B0E13" style={{ fontSize: size * 0.4, lineHeight: size * 0.46 }}>
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
