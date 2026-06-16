import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { shareClubInvite, shareIntro, shareClubMonth } from '@/lib/invite';
import type { ClubDashboard, ClubDetail, ClubIntros } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';

// The staff Pulse Dashboard — the ROI artifact a club pays for. Engagement +
// churn data (all derived from matches played at the club), plus the club's
// identity controls (crest, color, pinned note). Server-gated to club_staff;
// this screen also guards client-side, but the endpoint is the real gate.
const COLOR_SWATCHES = ['#1E5B3E', '#0B3D6B', '#7A1F2B', '#3B2A66', '#5A4A1F', '#2B5F75'];

export default function ClubManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const openMember = (userId: string) => { haptics.select(); router.push(`/(app)/club/${id}/member/${userId}`); };

  const [data, setData] = useState<ClubDashboard | null>(null);
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [intros, setIntros] = useState<ClubIntros | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pinned, setPinned] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [d, c, ix] = await Promise.all([
        api.getClubDashboard(id), api.getClub(id), api.getClubIntros(id).catch(() => null),
      ]);
      setData(d);
      setClub(c);
      setIntros(ix);
      setPinned(c.pinned_message ?? '');
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const pickCrest = async () => {
    // Lazy-require: expo-image-picker is native — top-level import would drop
    // this route on a dev client without it (same rule as profile.tsx).
    let ImagePicker: typeof import('expo-image-picker') | null = null;
    try { ImagePicker = require('expo-image-picker'); } catch { ImagePicker = null; }
    if (!ImagePicker?.launchImageLibraryAsync) {
      Alert.alert('Update needed', 'Crest upload activates once you install the latest Foretera build.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Allow photos', 'Enable photo access for Foretera in iOS Settings to set a crest.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets?.[0] || !id) return;
    setUploading(true);
    try {
      const { crest_url } = await api.uploadClubCrest(id, res.assets[0].uri);
      setClub((c) => (c ? { ...c, crest_url } : c));
      haptics.success();
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const setColor = async (color: string) => {
    if (!id) return;
    haptics.select();
    setClub((c) => (c ? { ...c, primary_color: color } : c));
    try { await api.updateClub(id, { primary_color: color }); } catch { /* visual only; reload fixes */ }
  };

  const savePinned = async () => {
    if (!id) return;
    setSavingPin(true);
    try {
      const trimmed = pinned.trim();
      const updated = await api.updateClub(id, { pinned_message: trimmed || null });
      setClub(updated);
      haptics.success();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again.');
    } finally {
      setSavingPin(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe} edges={['bottom']}><Text style={styles.note}>Loading…</Text></SafeAreaView>;
  }
  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.muted} />
          <Text style={styles.note}>{error ?? 'This dashboard is for club staff.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const wkDelta = data.this_week.matches - data.last_week.matches;
  const plDelta = data.this_week.players - data.last_week.players;
  const maxTrend = Math.max(1, ...data.trend.map((t) => t.matches));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.gold} />}
      >
        <Text style={styles.kicker}>Pulse dashboard</Text>
        <Text style={styles.h1}>{club?.name ?? 'Your club'}</Text>

        {/* This week vs last */}
        <View style={styles.statCards}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{data.this_week.matches}</Text>
            <Text style={styles.statLabel}>matches this week</Text>
            <Text
              style={[styles.delta, wkDelta >= 0 ? styles.deltaUp : styles.deltaDown]}
              accessibilityLabel={`${wkDelta >= 0 ? 'Up' : 'Down'} ${Math.abs(wkDelta)} versus last week`}
            >
              {wkDelta >= 0 ? '▲' : '▼'} {Math.abs(wkDelta)} vs last week
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{data.this_week.players}</Text>
            <Text style={styles.statLabel}>golfers played</Text>
            <Text
              style={[styles.delta, plDelta >= 0 ? styles.deltaUp : styles.deltaDown]}
              accessibilityLabel={`${plDelta >= 0 ? 'Up' : 'Down'} ${Math.abs(plDelta)} golfers versus last week`}
            >
              {plDelta >= 0 ? '▲' : '▼'} {Math.abs(plDelta)} vs last week
            </Text>
          </View>
        </View>

        {/* Grow your board — the recruit CTA. Turns the dashboard from a
            read-only report into something a pro can act on: hand a new member
            a branded invite, or send it to anyone who should be on the board. */}
        <View style={styles.recruitPanel}>
          <View style={styles.panelHeadRow}>
            <Ionicons name="megaphone-outline" size={16} color={colors.gold} />
            <Text style={styles.panelTitle}>Grow your board</Text>
          </View>
          <Text style={styles.recruitBody}>
            New member signing up? Share Foretera so they join your board, find games, and meet members.
          </Text>
          <TouchableOpacity
            style={styles.recruitBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share a club invite"
            onPress={() => { haptics.select(); shareClubInvite(club?.name ?? ''); }}
          >
            <Ionicons name="share-outline" size={16} color={colors.onAccent} />
            <Text style={styles.recruitBtnText}>Share club invite</Text>
          </TouchableOpacity>
        </View>

        {/* Share the month — turns the dashboard into marketing the pro can post. */}
        <View style={styles.panel}>
          <View style={styles.panelHeadRow}>
            <Ionicons name="trophy-outline" size={16} color={colors.gold} />
            <Text style={styles.panelTitle}>Your month</Text>
          </View>
          <Text style={styles.demandLine}>
            <Text style={styles.demandNum}>{data.month_matches}</Text> matches · <Text style={styles.demandNum}>{data.active_this_month}</Text> golfers
            {data.new_this_month > 0 ? ` · ${data.new_this_month} new` : ''} this month
          </Text>
          <TouchableOpacity
            style={styles.recruitBtn} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Share your club's month"
            onPress={() => { haptics.select(); shareClubMonth(club?.name ?? '', { matches: data.month_matches, golfers: data.active_this_month, newCount: data.new_this_month }); }}
          >
            <Ionicons name="share-outline" size={16} color={colors.onAccent} />
            <Text style={styles.recruitBtnText}>Share the month</Text>
          </TouchableOpacity>
        </View>

        {/* 8-week trend */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Matches per week · 8 weeks</Text>
          <View style={styles.trendRow}>
            {data.trend.map((t, i) => (
              <View key={i} style={styles.trendCol}>
                <View style={styles.trendBarTrack}>
                  <View style={[styles.trendBarFill, { height: `${Math.round((t.matches / maxTrend) * 100)}%` }]} />
                </View>
                <Text style={[styles.trendNum, t.matches === 0 && { color: colors.text }]}>{t.matches}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Membership flow this month */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>This month</Text>
          <View style={styles.flowRow}>
            <View style={styles.flowCell}><Text style={styles.flowNum}>{data.active_this_month}</Text><Text style={styles.statLabel}>active</Text></View>
            <View style={styles.flowCell}><Text style={[styles.flowNum, { color: colors.win }]}>{data.new_this_month}</Text><Text style={styles.statLabel}>new here</Text></View>
            <View style={styles.flowCell}><Text style={styles.flowNum}>{data.returning_this_month}</Text><Text style={styles.statLabel}>returning</Text></View>
          </View>
        </View>

        {/* Churn watch */}
        {data.churn.count > 0 && (
          <View style={styles.panel}>
            <View style={styles.panelHeadRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.loss} />
              <Text style={styles.panelTitle}>Lapsing — {data.churn.count} quiet 30+ days</Text>
            </View>
            {data.churn.players.slice(0, 6).map((p) => (
              <TouchableOpacity
                key={p.user_id} style={styles.personRow} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Open ${p.name}'s engagement`}
                onPress={() => openMember(p.user_id)}
              >
                <Avatar name={p.name} size={28} photoUrl={p.photo_url} />
                <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.personMeta}>last {p.last_played}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </TouchableOpacity>
            ))}
            <Text style={styles.hint}>Tap a member to see their engagement — then win them back.</Text>
          </View>
        )}

        {/* Most active */}
        {data.most_active.length > 0 && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Most active this month</Text>
            {data.most_active.map((p, i) => (
              <TouchableOpacity
                key={p.user_id} style={styles.personRow} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Open ${p.name}'s engagement`}
                onPress={() => openMember(p.user_id)}
              >
                <Text style={styles.rank}>{i + 1}</Text>
                <Avatar name={p.name} size={28} photoUrl={p.photo_url} />
                <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.personMeta}>{p.matches} matches</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Suggested intros — the club as matchmaker */}
        {intros && intros.suggestions.length > 0 && (
          <View style={styles.panel}>
            <View style={styles.panelHeadRow}>
              <Ionicons name="people-outline" size={16} color={colors.gold} />
              <Text style={styles.panelTitle}>Suggested intros</Text>
            </View>
            <Text style={styles.hint}>Members who’d click but haven’t played. Make the match.</Text>
            {intros.suggestions.map((s, i) => (
              <View key={i} style={styles.introRow}>
                <View style={styles.introFaces}>
                  <Avatar name={s.a.name} size={30} photoUrl={s.a.photo_url} />
                  <View style={styles.introFaceB}><Avatar name={s.b.name} size={30} photoUrl={s.b.photo_url} /></View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.introNames} numberOfLines={1}>{s.a.name} & {s.b.name}</Text>
                  <Text style={styles.introReason} numberOfLines={2}>{s.reason}</Text>
                </View>
                <TouchableOpacity
                  style={styles.introBtn} activeOpacity={0.85} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button" accessibilityLabel={`Suggest ${s.a.name} and ${s.b.name} play`}
                  onPress={() => { haptics.select(); shareIntro(s.a.name, s.b.name, club?.name ?? ''); }}
                >
                  <Ionicons name="paper-plane-outline" size={16} color={colors.onAccent} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Demand — only meaningful for a PROSPECT club courting a claim, not a
            live network club that already has its board. */}
        {club && club.status !== 'network' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Member demand</Text>
            <Text style={styles.demandLine}>
              <Text style={styles.demandNum}>{data.demand.total}</Text> members have asked for this club
              {data.demand.last_30d > 0 ? `  ·  ${data.demand.last_30d} in the last 30 days` : ''}
            </Text>
          </View>
        )}

        {/* ── Club identity ── */}
        <Text style={styles.sectionRule}>Club identity</Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Crest</Text>
          <View style={styles.crestRow}>
            {club?.crest_url ? (
              <Image source={{ uri: club.crest_url }} style={styles.crestPreview} />
            ) : (
              <View style={[styles.crestPreview, styles.crestEmpty]}><Ionicons name="shield-outline" size={26} color={colors.muted} /></View>
            )}
            <TouchableOpacity style={styles.uploadBtn} activeOpacity={0.85} disabled={uploading} accessibilityRole="button" accessibilityLabel={club?.crest_url ? 'Replace club crest' : 'Upload club crest'} onPress={pickCrest}>
              <Ionicons name="cloud-upload-outline" size={16} color={colors.onAccent} />
              <Text style={styles.uploadText}>{uploading ? 'Uploading…' : club?.crest_url ? 'Replace crest' : 'Upload crest'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Club color</Text>
          <View style={styles.swatchRow}>
            {COLOR_SWATCHES.map((s) => (
              <TouchableOpacity
                key={s} accessibilityRole="button" accessibilityLabel="Club color option"
                accessibilityState={{ selected: club?.primary_color === s }}
                style={[styles.swatch, { backgroundColor: s }, club?.primary_color === s && styles.swatchOn]}
                onPress={() => setColor(s)}
              />
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Pinned note</Text>
          <TextInput
            style={styles.pinInput}
            value={pinned}
            onChangeText={setPinned}
            placeholder="e.g. Men's league Saturday — sign up in the shop"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={240}
          />
          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} disabled={savingPin} accessibilityRole="button" accessibilityLabel="Save pinned note" onPress={savePinned}>
            <Text style={styles.saveText}>{savingPin ? 'Saving…' : 'Save note'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    kicker: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.gold, textTransform: 'uppercase', letterSpacing: 1.2 },
    h1: { ...typography.title, color: c.text },
    note: { ...typography.caption, color: c.muted, textAlign: 'center' },
    statCards: { flexDirection: 'row', gap: spacing.md },
    statCard: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
    statNum: { ...typography.title, fontSize: 32, color: c.text, fontVariant: ['tabular-nums'] },
    statLabel: { ...typography.caption, fontSize: 11, color: c.muted },
    delta: { ...typography.caption, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
    deltaUp: { color: c.win },
    deltaDown: { color: c.loss },
    deltaMuted: { ...typography.caption, fontSize: 11, color: c.muted, marginTop: 2 },
    panel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    recruitPanel: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.gold, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    recruitBody: { ...typography.body, color: c.text },
    recruitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 44, alignSelf: 'flex-start' },
    recruitBtnText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onAccent },
    panelHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    panelTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: c.text },
    trendRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80, gap: 4 },
    trendCol: { flex: 1, alignItems: 'center', gap: 4 },
    trendBarTrack: { width: '70%', height: 60, justifyContent: 'flex-end', backgroundColor: c.surfaceRaised, borderRadius: 3, overflow: 'hidden' },
    trendBarFill: { width: '100%', backgroundColor: c.gold, borderRadius: 3, minHeight: 2 },
    trendNum: { ...typography.caption, fontSize: 10, color: c.muted },
    flowRow: { flexDirection: 'row' },
    flowCell: { flex: 1, alignItems: 'center', gap: 2 },
    flowNum: { ...typography.title, fontSize: 26, color: c.text, fontVariant: ['tabular-nums'] },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    rank: { width: 16, textAlign: 'center', ...typography.caption, color: c.muted },
    personName: { flex: 1, ...typography.body },
    personMeta: { ...typography.caption, color: c.muted },
    hint: { ...typography.caption, color: c.muted, fontStyle: 'italic' },
    demandLine: { ...typography.body, color: c.text },
    demandNum: { fontFamily: fonts.bodyBold, color: c.gold },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginTop: spacing.xs },
    introFaces: { flexDirection: 'row', alignItems: 'center', width: 52 },
    introFaceB: { marginLeft: -10, borderWidth: 2, borderColor: c.surface, borderRadius: 17 },
    introNames: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: c.text },
    introReason: { ...typography.caption, color: c.muted, marginTop: 1 },
    introBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    sectionRule: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 1, color: c.gold, marginTop: spacing.md },
    crestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    crestPreview: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: c.gold },
    crestEmpty: { backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderColor: c.border },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    uploadText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onAccent },
    swatchRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent' },
    swatchOn: { borderColor: c.gold },
    pinInput: { ...typography.body, color: c.text, backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: spacing.md, minHeight: 64, textAlignVertical: 'top' },
    saveBtn: { alignSelf: 'flex-start', backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    saveText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onAccent },
  });
}
