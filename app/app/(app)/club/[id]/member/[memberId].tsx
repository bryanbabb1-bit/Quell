import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { Avatar } from '@/components/ui';
import { formatHandicap } from '@/lib/format';
import type { ClubMemberDetail, MemberStatus } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';

// A single member, seen the way a club should see one: engagement, not win/loss.
// Reached by tapping a name in Club Control (most-active or lapsing lists).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthYear(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m] = ymd.split('-');
  return `${MONTHS[Number(m) - 1] ?? '?'} ${y}`;
}
function sinceLabel(days: number | null): string {
  if (days == null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export default function ClubMemberScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<ClubMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !memberId) return;
    try {
      setError(null);
      setData(await api.getClubMember(id, memberId));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this member.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, id, memberId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={['bottom']}><Text style={styles.note}>Loading…</Text></SafeAreaView>;
  }
  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={36} color={colors.muted} />
          <Text style={styles.note}>{error ?? 'Member not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sm = statusMeta(data.status, colors);
  const maxTrend = Math.max(1, ...data.trend.map((t) => t.matches));
  const mo = momentumMeta(data.momentum, colors);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.gold} />}
      >
        {/* Identity */}
        <View style={styles.headerRow}>
          <Avatar name={data.name} size={56} photoUrl={data.photo_url} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{data.name}</Text>
            <Text style={styles.sub}>
              {data.handicap != null ? `${formatHandicap(data.handicap)} index` : 'No index'} · first played here {monthYear(data.member_since)}
            </Text>
          </View>
          <View style={[styles.statusChip, { borderColor: sm.color }]}>
            <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>

        {/* The read — what a GM should do about this member */}
        <View style={[styles.headline, { borderColor: sm.color }]}>
          <Ionicons name={sm.icon} size={16} color={sm.color} />
          <Text style={styles.headlineText}>{data.headline}</Text>
        </View>

        {data.looking_now && (
          <View style={styles.lookingRow}>
            <Ionicons name="golf" size={14} color={colors.live} />
            <Text style={styles.lookingText}>Looking for a game here right now</Text>
          </View>
        )}

        {/* Activity */}
        <Text style={styles.sectionRule}>Activity</Text>
        <View style={styles.statRow}>
          <View style={styles.statCell}><Text style={styles.statNum}>{data.total_matches}</Text><Text style={styles.statLabel}>matches here</Text></View>
          <View style={styles.statCell}><Text style={styles.statNum}>{data.matches_30d}</Text><Text style={styles.statLabel}>last 30 days</Text></View>
          <View style={styles.statCell}><Text style={styles.statNum}>{data.per_week.toFixed(1)}</Text><Text style={styles.statLabel}>per week</Text></View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeadRow}>
            <Text style={styles.panelTitle}>Last 8 weeks</Text>
            <View style={[styles.momChip, { backgroundColor: mo.bg }]}>
              <Ionicons name={mo.icon} size={12} color={mo.color} />
              <Text style={[styles.momText, { color: mo.color }]}>{mo.label}</Text>
            </View>
          </View>
          <View style={styles.trendRow}>
            {data.trend.map((t, i) => (
              <View key={i} style={styles.trendCol}>
                <View style={styles.trendBarTrack}>
                  {t.matches > 0 && <View style={[styles.trendBarFill, { height: `${Math.round((t.matches / maxTrend) * 100)}%` }]} />}
                </View>
                <Text style={[styles.trendNum, t.matches === 0 && { color: colors.text }]}>{t.matches}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>Last played {sinceLabel(data.days_since)}.</Text>
        </View>

        {/* Connections — the social value the club is really buying */}
        <Text style={styles.sectionRule}>Connections</Text>
        <View style={styles.panel}>
          <Text style={styles.metBig}>
            <Text style={styles.metNum}>{data.partners_count}</Text> {data.partners_count === 1 ? 'member met here' : 'members met here'}
          </Text>
          {data.top_partners.length > 0 ? (
            <>
              <Text style={styles.partnersLabel}>Plays most with</Text>
              {data.top_partners.map((p) => (
                <View key={p.user_id} style={styles.personRow}>
                  <Avatar name={p.name} size={28} photoUrl={p.photo_url} />
                  <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.personMeta}>{p.matches} {p.matches === 1 ? 'match' : 'matches'}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.hint}>No matches at the club yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function statusMeta(s: MemberStatus, c: Palette): { label: string; color: string; icon: any } {
  switch (s) {
    case 'new': return { label: 'NEW HERE', color: c.gold, icon: 'sparkles-outline' };
    case 'active': return { label: 'ACTIVE', color: c.win, icon: 'checkmark-circle-outline' };
    case 'cooling': return { label: 'COOLING', color: c.muted, icon: 'time-outline' };
    case 'lapsed': return { label: 'LAPSED', color: c.loss, icon: 'alert-circle-outline' };
  }
}
function momentumMeta(m: 'rising' | 'steady' | 'cooling', c: Palette): { label: string; color: string; icon: any; bg: string } {
  if (m === 'rising') return { label: 'Heating up', color: c.win, icon: 'trending-up', bg: c.surfaceRaised };
  if (m === 'cooling') return { label: 'Slowing', color: c.loss, icon: 'trending-down', bg: c.surfaceRaised };
  return { label: 'Steady', color: c.muted, icon: 'remove', bg: c.surfaceRaised };
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    note: { ...typography.caption, color: c.muted, textAlign: 'center' },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    name: { ...typography.title, color: c.text },
    sub: { ...typography.caption, color: c.muted, marginTop: 2 },
    statusChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    statusText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8 },
    headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: c.surface, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
    headlineText: { ...typography.body, color: c.text, flex: 1 },
    lookingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lookingText: { ...typography.caption, color: c.live, fontFamily: fonts.bodySemi },
    sectionRule: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 1, color: c.gold, marginTop: spacing.sm },
    statRow: { flexDirection: 'row', gap: spacing.md },
    statCell: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: 2, alignItems: 'center' },
    statNum: { ...typography.title, fontSize: 24, color: c.text, fontVariant: ['tabular-nums'] },
    statLabel: { ...typography.caption, fontSize: 11, color: c.muted, textAlign: 'center' },
    panel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    panelHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    panelTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: c.text },
    momChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    momText: { fontFamily: fonts.bodySemi, fontSize: 11 },
    trendRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80, gap: 4 },
    trendCol: { flex: 1, alignItems: 'center', gap: 4 },
    trendBarTrack: { width: '70%', height: 60, justifyContent: 'flex-end', backgroundColor: c.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
    trendBarFill: { width: '100%', backgroundColor: c.gold, borderRadius: 3, minHeight: 2 },
    trendNum: { ...typography.caption, fontSize: 10, color: c.muted },
    hint: { ...typography.caption, color: c.muted, fontStyle: 'italic' },
    metBig: { ...typography.body, color: c.text },
    metNum: { fontFamily: fonts.bodyBold, fontSize: 20, color: c.gold },
    partnersLabel: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: c.muted, marginTop: spacing.xs },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    personName: { flex: 1, ...typography.body },
    personMeta: { ...typography.caption, color: c.muted },
  });
}
