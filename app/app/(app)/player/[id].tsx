import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useFavorites } from '@/store/useFavoritesStore';
import { Avatar, Button, ErrorState } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatHandicap } from '@/lib/format';
import { makeType, spacing, radius, type Palette } from '@/constants/theme';
import type { PlayerProfile } from '@/types';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { isFavorite, toggle: toggleFav, load: loadFavs } = useFavorites();
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setErr(null); setP(await api.getPlayer(id)); } catch (e: any) { setErr(e?.message ?? 'Could not load this player.'); }
    api.getBlocks().then((r) => setBlocked(r.blocked.includes(id))).catch(() => {});
  }, [api, id]);
  useEffect(() => { load(); loadFavs(); }, [load, loadFavs]);

  const toggleBlock = () => {
    if (!p) return;
    if (blocked) {
      api.unblockUser(p.user_id).then(() => setBlocked(false)).catch(() => {});
      return;
    }
    Alert.alert(`Block ${p.name.split(' ')[0]}?`, "You won't see each other's matches, and neither of you can challenge the other.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => api.blockUser(p.user_id).then(() => setBlocked(true)).catch(() => {}) },
    ]);
  };

  const report = () => {
    if (!p) return;
    const send = (reason: 'spam' | 'abuse' | 'cheating') =>
      api.reportUser({ reported_id: p.user_id, reason })
        .then(() => Alert.alert('Report sent', "Thanks — we'll take a look."))
        .catch(() => Alert.alert('Could not send', 'Try again in a moment.'));
    Alert.alert(`Report ${p.name.split(' ')[0]}`, 'What happened?', [
      { text: 'Spam', onPress: () => send('spam') },
      { text: 'Abusive behavior', onPress: () => send('abuse') },
      { text: 'Cheating', onPress: () => send('cheating') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (err) {
    return <SafeAreaView style={styles.safe} edges={['bottom']}><ErrorState message={err} onRetry={load} /></SafeAreaView>;
  }
  if (!p) {
    return <SafeAreaView style={styles.safe} edges={['bottom']}><View style={styles.center}><ActivityIndicator color={c.accent} size="large" /></View></SafeAreaView>;
  }

  const starred = isFavorite(p.user_id);
  const h2h = p.head_to_head;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Avatar name={p.name} size={88} photoUrl={p.photo_url} />
          <View style={styles.headerMid}>
            <Text style={styles.name}>{p.name}{p.is_me ? ' (You)' : ''}</Text>
            <Text style={styles.sub}>Index {formatHandicap(p.handicap)}</Text>
            {p.home_course ? (
              <View style={styles.homeRow}>
                <Ionicons name="golf-outline" size={14} color={c.muted} />
                <Text style={styles.sub}>{p.home_course}</Text>
              </View>
            ) : null}
          </View>
          {!p.is_me ? (
            <Pressable hitSlop={10} onPress={() => { haptics.select(); toggleFav(p.user_id, { name: p.name, handicap: p.handicap }); }}>
              <Ionicons name={starred ? 'star' : 'star-outline'} size={26} color={starred ? c.accent : c.muted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.cardTitle}>Record</Text>
          <View style={styles.statRow}>
            <Stat value={p.wins} label="Won" tone="accent" styles={styles} />
            <Stat value={p.losses} label="Lost" tone="loss" styles={styles} />
            <Stat value={p.ties} label="Halved" tone="muted" styles={styles} />
            <Stat value={`${p.win_pct}%`} label="Win rate" tone="text" styles={styles} />
          </View>
          <Text style={styles.note}>{p.played} completed {p.played === 1 ? 'match' : 'matches'}</Text>
        </View>

        {!p.is_me ? (
          <View style={styles.statsCard}>
            <Text style={styles.cardTitle}>Your record vs {p.name.split(' ')[0]}</Text>
            <View style={styles.statRow}>
              <Stat value={h2h.wins} label="Won" tone="accent" styles={styles} />
              <Stat value={h2h.losses} label="Lost" tone="loss" styles={styles} />
              <Stat value={h2h.ties} label="Halved" tone="muted" styles={styles} />
            </View>
            {h2h.wins + h2h.losses + h2h.ties === 0 ? <Text style={styles.note}>You haven't played yet.</Text> : null}
          </View>
        ) : null}

        {!p.is_me ? (
          <Button
            title={blocked ? 'Blocked' : `Challenge ${p.name.split(' ')[0]}`}
            icon="flash"
            disabled={blocked}
            onPress={() => { haptics.light(); router.push(`/(app)/create?opponent_id=${p.user_id}&opponent_name=${encodeURIComponent(p.name)}`); }}
          />
        ) : null}

        {/* Safety actions — required for a UGC app (block + report). */}
        {!p.is_me ? (
          <View style={styles.safetyRow}>
            <TouchableOpacity style={styles.safetyBtn} onPress={toggleBlock} accessibilityRole="button" accessibilityLabel={blocked ? 'Unblock player' : 'Block player'}>
              <Ionicons name={blocked ? 'lock-open-outline' : 'remove-circle-outline'} size={16} color={c.muted} />
              <Text style={styles.safetyText}>{blocked ? 'Unblock' : 'Block'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.safetyBtn} onPress={report} accessibilityRole="button" accessibilityLabel="Report player">
              <Ionicons name="flag-outline" size={16} color={c.muted} />
              <Text style={styles.safetyText}>Report</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, tone, styles }: {
  value: string | number; label: string; tone: 'accent' | 'loss' | 'muted' | 'text'; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, styles[`tone_${tone}` as const]]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    container: { padding: spacing.lg, gap: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    headerMid: { flex: 1, gap: 2 },
    name: { ...t.title, fontSize: 24 },
    sub: { ...t.body, color: c.muted },
    homeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statsCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    cardTitle: { ...t.overline, color: c.muted },
    statRow: { flexDirection: 'row', justifyContent: 'space-between' },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { ...t.scoreBig, fontSize: 30 },
    statLabel: { ...t.overline, color: c.muted, fontSize: 11 },
    tone_accent: { color: c.accent },
    tone_loss: { color: c.loss },
    tone_muted: { color: c.muted },
    tone_text: { color: c.text },
    note: { ...t.caption, color: c.muted },
    safetyRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.sm },
    safetyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    safetyText: { ...t.caption, color: c.muted },
  });
}
