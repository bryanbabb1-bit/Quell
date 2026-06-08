import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useUserStore } from '@/store/useUserStore';
import { colors, spacing, radius, typography } from '@/constants/theme';

// Placeholder home / discovery feed. The swipeable match cards + handicap-range
// filtering land in Phase 2 (build-order steps 3–4). For now it confirms the
// auth round-trip: a signed-in user with a server-side /me row.
export default function DiscoveryScreen() {
  const { signOut } = useAuth();
  const user = useUserStore((s) => s.user);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Discovery</Text>
        <TouchableOpacity onPress={() => signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.empty}>No open matches yet.</Text>
        <Text style={styles.hint}>
          Swipeable match cards and handicap-range filtering arrive in Phase 2.
        </Text>

        {user && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Signed in as</Text>
            <Text style={styles.cardValue}>{user.email}</Text>
            <Text style={styles.cardLabel}>Handicap</Text>
            <Text style={styles.cardValue}>{user.handicap ?? '— (set in profile)'}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.title },
  signOut: { ...typography.caption, color: colors.fairway },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  empty: { ...typography.heading, color: colors.muted },
  hint: { ...typography.caption, textAlign: 'center', maxWidth: 280 },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  cardLabel: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { ...typography.bodySemiBold, marginBottom: spacing.sm },
});
