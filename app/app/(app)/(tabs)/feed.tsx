import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Image, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useCourses } from '@/store/useCourseStore';
import { useUserStore } from '@/store/useUserStore';
import { CourseSelect } from '@/components/CourseSelect';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { AcceptCelebration } from '@/components/AcceptCelebration';
import { Avatar, EmptyState } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatHandicap } from '@/lib/format';
import { MATCH_TYPE_LABELS } from '@/types';
import type { CourseFeedMatch, CourseSummary, OpenInvite, CoursePulse, ClubSummary, ClubChampions, ChampionEntry } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';

// Local YYYY-MM-DD (the player's clock, not UTC) so "today" lines up with the
// feed's play_date filter.
function isoOn(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoToday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return isoOn(d);
}
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + days);
  return isoOn(dt);
}
// "Today" / "Yesterday" / "Wed, Jun 11"
function dateLabel(iso: string): string {
  const today = isoToday();
  if (iso === today) return 'Today';
  if (iso === shiftIso(today, -1)) return 'Yesterday';
  if (iso === shiftIso(today, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
// "2:34 PM" from "HH:MM"
function timeLabel(t: string | null): string | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function FeedScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useUserStore((s) => s.user);

  const [course, setCourse] = useState<string | null>(null);
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState<CourseFeedMatch[]>([]);
  const [open, setOpen] = useState<OpenInvite[]>([]);
  const [pulse, setPulse] = useState<CoursePulse | null>(null);
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [champions, setChampions] = useState<ClubChampions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  // Accept-from-feed (same choreography as the Discovery deck): confirm the
  // index first — it's locked onto the match — then accept + celebrate.
  const [pendingAccept, setPendingAccept] = useState<OpenInvite | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  // Prospect card (A2): shown on the member's HOME board when the club isn't
  // in the network. Dismissal hides it locally for 14 days; the demand signal
  // itself lives server-side and never expires.
  const [prospectHidden, setProspectHidden] = useState(true);
  const [signalCount, setSignalCount] = useState<number | null>(null);

  // Default the feed to the player's home course ONCE (when the catalog
  // resolves). The ref stops it re-firing after the user clears the picker —
  // without it, hitting ✕ instantly repopulated the course they just cleared.
  const { courses, load: loadCourses } = useCourses();
  const defaultedRef = useRef(false);
  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => {
    if (defaultedRef.current) return;
    const hid = user?.home_course_id;
    if (!hid || course || !courses) return;
    const n = courses.find((x) => x.id === hid)?.name ?? null;
    if (n) { defaultedRef.current = true; setCourse(n); }
  }, [user, courses, course]);

  const load = useCallback(async () => {
    if (!course) { setLoading(false); return; }
    try {
      setError(null);
      const r = await api.courseFeed(course, date, isoToday());
      setRows(r.matches);
      setOpen(r.open ?? []);
      setPulse(r.pulse ?? null);
      setClub(r.club ?? null);
      // Demand social proof shows BEFORE the viewer acts; the POST response
      // keeps it fresh after their own tap.
      setSignalCount(r.club?.interest_count ?? null);
      // Champions are a network perk — only fetch where they'll show.
      if (r.club?.status === 'network') {
        api.getChampions(r.club.id).then(setChampions).catch(() => setChampions(null));
      } else {
        setChampions(null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, course, date]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  // The prospect card only speaks on the member's HOME board — the home member
  // is the persuasive voice to their own pro; other boards stay unsolicited.
  const isHomeBoard = !!course && !!user?.home_course_id &&
    courses?.find((x) => x.id === user.home_course_id)?.name === course;

  // 14-day local snooze per club.
  useEffect(() => {
    let active = true;
    if (!club || club.status !== 'prospect' || !isHomeBoard) { setProspectHidden(true); return; }
    SecureStore.getItemAsync(`mp_prospect_hide_${club.id}`)
      .then((v) => {
        if (!active) return;
        const snoozedAt = v ? Date.parse(v) : NaN;
        setProspectHidden(Number.isFinite(snoozedAt) && Date.now() - snoozedAt < 14 * 86_400_000);
      })
      .catch(() => { if (active) setProspectHidden(false); });
    return () => { active = false; };
  }, [club, isHomeBoard]);

  const dismissProspect = () => {
    haptics.select();
    setProspectHidden(true);
    if (club) SecureStore.setItemAsync(`mp_prospect_hide_${club.id}`, new Date().toISOString()).catch(() => {});
  };

  // "Tell your pro" — record the demand signal, then hand the member a message
  // to forward. The signal is the product; the share is the vehicle.
  const tellYourPro = async () => {
    if (!club) return;
    haptics.select();
    api.clubInterest(club.id).then((r) => setSignalCount(r.count)).catch(() => {});
    const msg = `A bunch of us are using Foretera to set up matches at ${club.name}. ` +
      `Clubs on the network get a branded members' board, club leaderboard, and an activity pulse for staff. ` +
      `Worth a look for the club — foretera.app`;
    try { await Share.share({ message: msg }); } catch { /* dismissed */ }
  };

  // Staff of THIS club see a Manage entry into the pulse dashboard.
  const isStaff = !!club && user?.staff_club_id === club.id;

  const live = rows.filter((m) => m.status === 'accepted' || m.status === 'in_progress');
  const done = rows.filter((m) => m.status === 'completed');
  const onToday = date === isoToday();
  // Matches can only be posted 14 days out — navigating past that is dead air.
  const maxDate = shiftIso(isoToday(), 14);
  const atMax = date >= maxDate;
  const visibleOpen = showAllOpen ? open : open.slice(0, 4);

  const onPickCourse = (c: CourseSummary | null) => {
    setCourse(c?.name ?? null);
    setSwitching(false);
  };

  const doAccept = async (iv: OpenInvite) => {
    try {
      await api.acceptMatch(iv.id);
      setCelebrate(iv.id); // flourish, then navigate (see onDone)
    } catch (e: any) {
      // Most common failure: someone else just claimed it. Refresh the board.
      Alert.alert('Could not accept', e?.message ?? 'Please try again.');
      load();
    }
  };

  const confirmIndexAndAccept = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      const iv = pendingAccept;
      setPendingAccept(null);
      if (iv) await doAccept(iv);
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Club masthead — the branded board header. Crest (or monogram), club
          name, and the gold network lockup; the whole row is the switcher. */}
      <View style={styles.courseHeader}>
        <TouchableOpacity
          style={styles.courseTitleRow} activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={course ? `${course} — change course` : 'Pick a course'}
          accessibilityState={{ expanded: switching }}
          onPress={() => { haptics.select(); setSwitching((s) => !s); }}
        >
          {course && club ? (
            <ClubCrest club={club} colors={colors} styles={styles} />
          ) : (
            <Ionicons name="golf-outline" size={18} color={colors.live} />
          )}
          <View style={styles.mastheadMid}>
            <Text style={styles.courseTitle} numberOfLines={1}>{course ?? 'Pick a course'}</Text>
            {club?.status === 'network' && (
              <View style={styles.networkRow}>
                <Ionicons name="shield-checkmark" size={11} color={colors.gold} />
                <Text style={styles.networkText}>Foretera Network Club</Text>
              </View>
            )}
          </View>
          <Ionicons name={switching ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </TouchableOpacity>
        {isStaff && (
          <TouchableOpacity
            style={styles.manageBar}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Manage this club"
            onPress={() => { haptics.select(); router.push(`/(app)/club/${club!.id}/manage`); }}
          >
            <Ionicons name="speedometer-outline" size={14} color={colors.gold} />
            <Text style={styles.manageText}>Manage club · pulse dashboard</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </TouchableOpacity>
        )}
      </View>
      {(switching || !course) && (
        <View style={styles.switcher}>
          <CourseSelect valueName={course} onSelect={onPickCourse} placeholder="Search a course…" />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {/* ── A2: the join-the-network prompt — home board, prospect clubs
            only. Gentle, dismissible, never gates anything. ── */}
        {club?.status === 'prospect' && isHomeBoard && !prospectHidden && (
          <View style={styles.prospectCard}>
            <View style={styles.prospectHead}>
              <Ionicons name="shield-outline" size={16} color={colors.gold} />
              <Text style={styles.prospectTitle} numberOfLines={2}>
                {club.name} isn’t a Foretera club yet.
              </Text>
              <TouchableOpacity hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide this for now" onPress={dismissProspect}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.prospectBody}>
              Your games here work just fine — but the branded board, monthly champions, and members’ leaderboard are waiting.
            </Text>
            {signalCount != null && signalCount > 0 && (
              <Text style={styles.prospectCount}>
                {signalCount === 1 ? '1 member here has asked.' : `${signalCount} members here have asked.`}
              </Text>
            )}
            <View style={styles.prospectRow}>
              <TouchableOpacity style={styles.prospectBtn} activeOpacity={0.8} accessibilityRole="button" onPress={tellYourPro}>
                <Ionicons name="paper-plane-outline" size={14} color={colors.onAccent} />
                <Text style={styles.prospectBtnText}>Tell your pro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={8}
                accessibilityRole="button"
                onPress={() => { haptics.select(); router.push(`/(app)/club-claim?club_id=${club.id}&club_name=${encodeURIComponent(club.name)}`); }}
              >
                <Text style={styles.prospectClaim}>Is this your club? Claim it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Club pulse — the course's weekly heartbeat. Network clubs wear
            the gold trim: the paid tier should LOOK like the paid tier. ── */}
        {course && pulse && (
          <View style={[styles.pulseCard, club?.status === 'network' && styles.pulseCardNetwork]}>
            <View style={styles.pulseCell}>
              <Text style={styles.pulseNum}>{pulse.week_matches}</Text>
              <Text style={styles.pulseLabel}>matches this week</Text>
            </View>
            <View style={styles.pulseDivider} />
            <View style={styles.pulseCell}>
              <Text style={styles.pulseNum}>{pulse.week_players}</Text>
              <Text style={styles.pulseLabel}>players active</Text>
            </View>
            <View style={styles.pulseDivider} />
            <View style={styles.pulseCell}>
              <View style={styles.pulseLiveRow}>
                {pulse.live_now > 0 && <View style={styles.liveDot} />}
                <Text style={[styles.pulseNum, pulse.live_now > 0 && { color: colors.live }]}>{pulse.live_now}</Text>
              </View>
              <Text style={styles.pulseLabel}>live now</Text>
            </View>
          </View>
        )}

        {/* ── Monthly champions — the network club's marquee (gold). ── */}
        {club?.status === 'network' && champions && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="trophy" size={14} color={colors.gold} style={{ marginTop: spacing.sm }} />
              <Text style={styles.sectionTitle}>{monthTitle(champions.month, champions.crowned)}</Text>
              <TouchableOpacity
                style={{ marginTop: spacing.sm, marginLeft: 'auto' }}
                hitSlop={8} accessibilityRole="button"
                onPress={() => { haptics.select(); router.push(`/(app)/club/${club.id}`); }}
              >
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.champRow}>
              <CrownCard label="Most Wins" entry={champions.won[0]} colors={colors} styles={styles} />
              <CrownCard label="Most Played" entry={champions.played[0]} colors={colors} styles={styles} />
              <CrownCard label="Best Win %" entry={champions.win_pct[0]} colors={colors} styles={styles} />
            </View>
          </>
        )}

        {/* ── Looking for a game — the open network at this course ── */}
        {course && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="people-outline" size={14} color={colors.accent} style={{ marginTop: spacing.sm }} />
              <Text style={styles.sectionTitle}>Looking for a game</Text>
              {open.length > 0 && (
                <View style={styles.countBadge}><Text style={styles.countBadgeText}>{open.length}</Text></View>
              )}
            </View>
            {open.length > 0 ? (
              <View style={styles.card}>
                {visibleOpen.map((iv, i) => (
                  <InviteRow
                    key={iv.id} iv={iv} divider={i > 0} colors={colors} styles={styles}
                    onAccept={() => { haptics.select(); setPendingAccept(iv); }}
                  />
                ))}
                {open.length > 4 && (
                  <TouchableOpacity
                    style={[styles.moreRow, styles.rowDivider]}
                    onPress={() => { haptics.select(); setShowAllOpen((s) => !s); }}
                  >
                    <Text style={styles.moreText}>{showAllOpen ? 'Show fewer' : `Show all ${open.length} invites`}</Text>
                    <Ionicons name={showAllOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.openEmpty}>
                <Text style={styles.openEmptyText}>No one's posted an open match yet. Put one up and the club will see it here.</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.postBtn}
              activeOpacity={0.8}
              onPress={() => { haptics.select(); router.push('/(app)/create'); }}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.onAccent} />
              <Text style={styles.postBtnText}>Post a match</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Around the club — the browsed day's public activity ── */}
        {course && (
          <View style={styles.dateBar}>
            <TouchableOpacity
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => { haptics.select(); setDate((d) => shiftIso(d, -1)); }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.dateMid}>
              <Text style={styles.dateText}>{dateLabel(date)}</Text>
              {!onToday && (
                <TouchableOpacity onPress={() => { haptics.select(); setDate(isoToday()); }}>
                  <Text style={styles.todayLink}>Jump to today</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              hitSlop={10}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => { haptics.select(); setDate((d) => shiftIso(d, 1)); }}
            >
              <Ionicons name="chevron-forward" size={22} color={atMax ? colors.border : colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {!loading && course && rows.length === 0 && !error && (
          <EmptyState
            icon="newspaper-outline"
            title={`Quiet day at ${course?.split(' ')[0] ?? 'this course'}`}
            message={`No public matches ${onToday ? 'today' : 'on this day'}. Post one as Public and it shows here.`}
          />
        )}

        {live.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={[styles.liveDot, { marginTop: spacing.sm }]} />
              <Text style={styles.sectionTitle}>Now playing</Text>
            </View>
            <View style={styles.card}>
              {live.map((m, i) => <FeedRow key={m.id} m={m} divider={i > 0} colors={colors} styles={styles} />)}
            </View>
          </>
        )}

        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Final results</Text>
            <View style={styles.card}>
              {done.map((m, i) => <FeedRow key={m.id} m={m} divider={i > 0} colors={colors} styles={styles} />)}
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmIndexSheet
        visible={!!pendingAccept}
        handicap={user?.handicap ?? null}
        updatedAt={user?.handicap_updated_at ?? null}
        actionLabel="Accept match"
        busy={sheetBusy}
        onCancel={() => setPendingAccept(null)}
        onConfirm={confirmIndexAndAccept}
      />

      {celebrate ? (
        <AcceptCelebration onDone={() => { const id = celebrate; setCelebrate(null); router.push(`/(app)/match/${id}`); }} />
      ) : null}
    </SafeAreaView>
  );
}

// "June leaders" while the month is live; "May champions" once frozen.
function monthTitle(monthKey: string, crowned: boolean): string {
  const [y, m] = monthKey.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  return `${name} ${crowned ? 'champions' : 'leaders'}`;
}

// One crown: the leader in a category. Empty (no qualifier yet) shows a muted
// placeholder so the three-up row stays even.
function CrownCard({ label, entry, colors, styles }: {
  label: string; entry: ChampionEntry | undefined; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.crownCard}>
      <Text style={styles.crownLabel}>{label}</Text>
      {entry ? (
        <>
          <Avatar name={entry.name} size={40} photoUrl={entry.photo_url} />
          <Text style={styles.crownName} numberOfLines={1}>{entry.name.split(' ')[0]}</Text>
          <Text style={styles.crownValue}>{entry.detail}</Text>
        </>
      ) : (
        <>
          <View style={styles.crownEmptyDot} />
          <Text style={styles.crownEmpty}>No leader yet</Text>
        </>
      )}
    </View>
  );
}

// The club crest: real artwork when the club has uploaded one, otherwise a
// monogram chip in the club's color. Network clubs get the gold ring.
function crestInitials(name: string): string {
  const stop = new Set(['golf', 'club', 'course', 'country', 'the', 'of', 'at']);
  const words = name.split(/\s+/).filter((w) => w && !stop.has(w.toLowerCase()));
  return ((words[0]?.[0] ?? name[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

// Monogram text must read on an ARBITRARY club brand color, so the pair is
// picked by the background's luminance — the one place theme tokens can't help.
function crestTextColor(bg: string | null, colors: Palette): string {
  if (!bg) return colors.text; // theme fallback chip → theme text
  const m = bg.match(/^#?([0-9a-fA-F]{6})/);
  if (!m) return '#F5F1E6';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 145 ? '#16120A' : '#F5F1E6';
}

function ClubCrest({ club, colors, styles }: {
  club: ClubSummary; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const ring = club.status === 'network' ? colors.gold : colors.border;
  if (club.crest_url) {
    return <Image source={{ uri: club.crest_url }} style={[styles.crest, { borderColor: ring }]} accessible={false} />;
  }
  return (
    <View style={[styles.crest, styles.crestMono, { borderColor: ring, backgroundColor: club.primary_color ?? colors.surfaceRaised }]}>
      <Text style={[styles.crestText, { color: crestTextColor(club.primary_color, colors) }]}>{crestInitials(club.name)}</Text>
    </View>
  );
}

// One open invite — a member of the network asking for a game. The Accept pill
// runs the confirm-index → accept flow; the card body opens the match detail.
function InviteRow({ iv, divider, colors, styles, onAccept }: {
  iv: OpenInvite; divider: boolean; colors: Palette; styles: ReturnType<typeof makeStyles>;
  onAccept: () => void;
}) {
  const time = timeLabel(iv.play_time);
  const when = [dateLabel(iv.play_date), time].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      style={[styles.inviteRow, divider && styles.rowDivider]}
      activeOpacity={0.7}
      onPress={() => { haptics.select(); router.push(`/(app)/match/${iv.id}`); }}
    >
      <Avatar name={iv.creator_name} size={40} photoUrl={iv.creator_photo_url} />
      <View style={styles.inviteMid}>
        <View style={styles.inviteNameRow}>
          <Text style={styles.inviteName} numberOfLines={1}>{iv.creator_name}</Text>
          {iv.creator_handicap_index != null && (
            <Text style={styles.inviteIndex}>{formatHandicap(iv.creator_handicap_index)}</Text>
          )}
        </View>
        <Text style={styles.inviteMeta} numberOfLines={1}>
          {when} · {MATCH_TYPE_LABELS[iv.match_type]}
        </Text>
        <View style={styles.invitePillRow}>
          <View style={styles.invitePill}>
            <Text style={styles.invitePillText}>Index {iv.hcp_range_min}–{iv.hcp_range_max}</Text>
          </View>
          {iv.playing_together ? (
            <View style={styles.groupPill}>
              <Ionicons name="people" size={10} color={colors.live} />
              <Text style={styles.groupPillText}>Same group</Text>
            </View>
          ) : null}
          {iv.is_mine && <Text style={styles.mineTag}>Your post</Text>}
        </View>
      </View>
      {!iv.is_mine && (
        <TouchableOpacity style={styles.acceptBtn} activeOpacity={0.8} onPress={onAccept} hitSlop={6}>
          <Ionicons name="flash" size={13} color={colors.onAccent} />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function FeedRow({ m, divider, colors, styles }: {
  m: CourseFeedMatch; divider: boolean; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const time = timeLabel(m.play_time);
  // Result line for a finished match (neutral, third-person).
  let resultText: string | null = null;
  if (m.status === 'completed') {
    if (m.result === 'tie') resultText = m.final_delta ? `Halved (${m.final_delta})` : 'Halved';
    else {
      const winner = m.result === 'creator_wins' ? m.creator_name : m.opponent_name;
      resultText = m.final_delta ? `${winner} won ${m.final_delta}` : `${winner} won`;
    }
  }
  return (
    <TouchableOpacity
      style={[styles.row, divider && styles.rowDivider]}
      activeOpacity={0.7}
      // Completed public matches → straight into the reveal (watch it play out, or
      // "Skip to result"). Live matches → the read-only match detail.
      onPress={() => router.push(m.status === 'completed' ? `/(app)/match/${m.id}/reveal` : `/(app)/match/${m.id}`)}
    >
      <View style={styles.players}>
        <View style={styles.playerLine}>
          <Avatar name={m.creator_name} size={26} photoUrl={m.creator_photo_url} />
          <Text style={styles.playerName} numberOfLines={1}>{m.creator_name}</Text>
        </View>
        <Text style={styles.vs}>vs</Text>
        <View style={styles.playerLine}>
          <Avatar name={m.opponent_name} size={26} photoUrl={m.opponent_photo_url} />
          <Text style={styles.playerName} numberOfLines={1}>{m.opponent_name}</Text>
        </View>
      </View>

      <View style={styles.rowRight}>
        {m.status === 'completed' ? (
          <Text style={styles.resultText} numberOfLines={2}>{resultText}</Text>
        ) : (
          <View style={[styles.statusChip, m.status === 'in_progress' && styles.statusChipLive]}>
            <Text style={[styles.statusChipText, m.status === 'in_progress' && styles.statusChipTextLive]}>
              {m.status === 'in_progress' ? 'In progress' : 'Scheduled'}
            </Text>
          </View>
        )}
        <Text style={styles.meta}>{[time, MATCH_TYPE_LABELS[m.match_type]].filter(Boolean).join(' · ')}</Text>
        {m.is_mine && <Text style={styles.mineTag}>Your match</Text>}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    courseHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    courseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    courseTitle: { ...typography.heading, fontSize: 20, color: colors.text, flex: 1 },
    switcher: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    dateBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: spacing.md, paddingTop: spacing.sm,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    dateMid: { alignItems: 'center', gap: 2 },
    dateText: { ...typography.bodySemiBold, color: colors.text },
    todayLink: { ...typography.caption, color: colors.accent },
    container: { padding: spacing.lg, gap: spacing.md },
    error: { ...typography.caption, color: colors.flagRed, textAlign: 'center' },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    // Club pulse strip
    pulseCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: spacing.md,
    },
    pulseCell: { flex: 1, alignItems: 'center', gap: 2 },
    pulseDivider: { width: 1, height: 28, backgroundColor: colors.border },
    pulseNum: { ...typography.heading, fontSize: 22, color: colors.text },
    pulseLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pulseLabel: { ...typography.caption, fontSize: 11, color: colors.muted },
    countBadge: {
      marginTop: spacing.sm, backgroundColor: colors.accentGlow, borderRadius: radius.pill,
      paddingHorizontal: 8, paddingVertical: 1, minWidth: 20, alignItems: 'center',
    },
    countBadgeText: { ...typography.caption, fontSize: 11, color: colors.accent, fontFamily: fonts.bodyBold },
    // Open invites
    inviteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    inviteMid: { flex: 1, gap: 2 },
    inviteNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    inviteName: { ...typography.bodySemiBold, flexShrink: 1 },
    inviteIndex: { ...typography.caption, color: colors.muted },
    inviteMeta: { ...typography.caption, color: colors.muted },
    invitePillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    invitePill: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    groupPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.liveGlow, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    groupPillText: { ...typography.caption, fontSize: 11, color: colors.live, fontFamily: fonts.bodySemi },
    invitePillText: { ...typography.caption, fontSize: 11, color: colors.muted },
    acceptBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 6,
    },
    acceptBtnText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontFamily: fonts.bodyBold },
    // Masthead
    mastheadMid: { flex: 1, gap: 2 },
    networkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    networkText: {
      // fontFamily wins over fontWeight on iOS — use the semibold family.
      fontFamily: fonts.bodySemi, fontSize: 11, color: colors.gold,
      textTransform: 'uppercase', letterSpacing: 1,
    },
    crest: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 },
    crestMono: { alignItems: 'center', justifyContent: 'center' },
    crestText: { ...typography.bodySemiBold, fontSize: 15, letterSpacing: 0.5 },
    pulseCardNetwork: { borderColor: colors.gold },
    // Staff manage bar
    manageBar: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
      backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.gold,
      borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    manageText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.gold, flex: 1 },
    seeAll: { ...typography.caption, color: colors.gold, fontFamily: fonts.bodySemi },
    // Champions strip
    champRow: { flexDirection: 'row', gap: spacing.sm },
    crownCard: {
      flex: 1, alignItems: 'center', gap: 4,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
    },
    crownLabel: { ...typography.caption, fontSize: 10.5, color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
    crownName: { ...typography.bodySemiBold, fontSize: 13 },
    crownValue: { ...typography.caption, fontSize: 11, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
    crownEmptyDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceRaised },
    crownEmpty: { ...typography.caption, fontSize: 11, color: colors.muted, marginTop: 2 },
    // Prospect (join-the-network) card
    // Standard border — the GOLD trim is the network's earned mark; a prospect
    // card wearing it would dilute what the paid tier looks like.
    prospectCard: {
      backgroundColor: colors.surface, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
    },
    prospectHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    prospectTitle: { ...typography.bodySemiBold, fontSize: 15, flex: 1 },
    prospectBody: { ...typography.caption, color: colors.muted },
    prospectCount: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.gold },
    prospectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    prospectBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    },
    prospectBtnText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.onAccent },
    prospectClaim: { ...typography.caption, color: colors.accent, textDecorationLine: 'underline' },
    moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
    moreText: { ...typography.caption, color: colors.accent, fontFamily: fonts.bodySemi },
    openEmpty: {
      backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
      borderColor: colors.border, borderStyle: 'dashed', padding: spacing.md,
    },
    openEmptyText: { ...typography.caption, color: colors.muted, textAlign: 'center' },
    postBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2, marginTop: spacing.xs,
    },
    postBtnText: { ...typography.bodySemiBold, fontSize: 14, color: colors.onAccent },
    // Day activity rows
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    players: { flex: 1, gap: 4 },
    playerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    playerName: { ...typography.bodySemiBold, flex: 1 },
    vs: { ...typography.caption, color: colors.muted, marginLeft: 34 },
    rowRight: { alignItems: 'flex-end', gap: 4, maxWidth: 130 },
    resultText: { ...typography.bodySemiBold, color: colors.ink, textAlign: 'right' },
    statusChip: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    statusChipLive: { backgroundColor: colors.live },
    statusChipText: { ...typography.caption, color: colors.muted },
    statusChipTextLive: { color: colors.scheme === 'dark' ? colors.bg : colors.onAccent, fontFamily: fonts.bodySemi },
    meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
    mineTag: { ...typography.caption, color: colors.live, fontSize: 11 },
  });
}
