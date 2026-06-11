import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useUserStore } from '@/store/useUserStore';
import { useFavorites } from '@/store/useFavoritesStore';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { Match, HolesSetup, TeeSummary, Visibility } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';
import { formatHandicap, formatPlayWhen, STATUS_LABELS } from '@/lib/format';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [match, setMatch] = useState<Match | null>(null);
  const [hsetup, setHsetup] = useState<HolesSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [teeModal, setTeeModal] = useState(false);
  const [courseTees, setCourseTees] = useState<TeeSummary[] | null>(null);
  const [teeBusy, setTeeBusy] = useState(false);
  const user = useUserStore((s) => s.user);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [nudged, setNudged] = useState(false);
  const { isFavorite, toggle: toggleFav, load: loadFavs } = useFavorites();
  useEffect(() => { loadFavs(); }, [loadFavs]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const m = await api.getMatch(id);
      setMatch(m);
      // Pull the computed course handicaps for this tee/segment (participants only).
      if (m.creator_id === userId || m.opponent_id === userId) {
        api.getMatchHoles(id).then(setHsetup).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [api, id, userId]);

  // While a match is live, poll so it flips to "Reveal ready" on its own the
  // moment the opponent submits. Focus-scoped: the interval dies when the
  // player navigates away (score entry, messages) instead of polling behind
  // the pushed screen. 10s is plenty — push notifies the real event.
  const statusRef = useRef<string | undefined>(undefined);
  statusRef.current = match?.status;
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => {
      const s = statusRef.current;
      if (s === 'accepted' || s === 'in_progress') load();
    }, 10000);
    return () => clearInterval(t);
  }, [load]));

  // Re-post the same matchup as a fresh open match (today's date).
  const rematch = async () => {
    if (!match || reposting) return;
    setReposting(true);
    try {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const created = await api.createMatch({
        course_name: match.course_name, tee_color: match.tee_color,
        play_date: iso, play_time: null, match_type: match.match_type,
        stakes: null, hcp_range_min: match.hcp_range_min, hcp_range_max: match.hcp_range_max,
      });
      haptics.success();
      router.replace(`/(app)/match/${created.id}`);
    } catch (e: any) {
      Alert.alert('Could not repost', e?.message ?? 'Try again.');
    } finally {
      setReposting(false);
    }
  };

  // Accepting a challenge locks your handicap onto the match, so confirm it first.
  const doAcceptChallenge = async () => {
    setActing(true);
    try { setMatch(await api.acceptMatch(id!)); haptics.success(); }
    catch (e: any) { Alert.alert('Could not accept', e?.message ?? 'Try again.'); }
    finally { setActing(false); }
  };
  const confirmIndexAndAccept = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      setConfirmAccept(false);
      await doAcceptChallenge();
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  // Nudge the opponent to post their scores (push notification).
  const nudgeOpponent = async () => {
    if (nudging || nudged) return;
    setNudging(true);
    try {
      const r = await api.nudgeMatch(id!);
      if (r.ok) { setNudged(true); haptics.success(); }
      else { Alert.alert("They're in", 'Your opponent has already posted their scores.'); }
    } catch (e: any) {
      Alert.alert('Could not nudge', e?.message ?? 'Try again.');
    } finally {
      setNudging(false);
    }
  };

  const openTeePicker = async () => {
    haptics.light();
    setTeeModal(true);
    if (!courseTees) {
      try { const r = await api.getMatchTees(id!); setCourseTees(r.tees); }
      catch { setCourseTees([]); }
    }
  };
  const chooseTee = async (teeId: string) => {
    setTeeBusy(true);
    try {
      setMatch(await api.setMatchTee(id!, teeId));
      haptics.success();
      setTeeModal(false);
      // Strokes depend on the tee — refresh the handicap/strokes preview.
      api.getMatchHoles(id!).then(setHsetup).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not change tees', e?.message ?? 'Try again.');
    } finally {
      setTeeBusy(false);
    }
  };

  const act = async (fn: () => Promise<Match>, confirmLabel: string) => {
    Alert.alert(confirmLabel, 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes', style: 'destructive', onPress: async () => {
          setActing(true);
          try { setMatch(await fn()); } catch (e: any) { Alert.alert('Failed', e?.message ?? 'Try again.'); }
          finally { setActing(false); }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  if (error || !match) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error ?? 'Match not found.'}</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const isCreator = match.creator_id === userId;
  const isOpponent = match.opponent_id === userId;
  const isParticipant = isCreator || isOpponent;
  // The other player (relative to the viewer) — the one you can favorite/challenge.
  const otherId = (isCreator ? match.opponent_id : match.creator_id) as string | null;
  const otherName = (isCreator ? match.opponent_name : match.creator_name) ?? 'this player';
  const challenge = () => {
    if (!otherId) return;
    haptics.light();
    router.push(`/(app)/create?opponent_id=${otherId}&opponent_name=${encodeURIComponent(otherName)}`);
  };
  const mySubmitted = isCreator ? !!match.creator_scorecard_id : !!match.opponent_scorecard_id;
  const oppSubmitted = isCreator ? !!match.opponent_scorecard_id : !!match.creator_scorecard_id;
  // The other player opened score entry (but hasn't posted) — tension tease.
  const otherScoringAt = isCreator ? match.opponent_scoring_at : match.creator_scoring_at;
  const scoringStage =
    match.status === 'accepted' || match.status === 'in_progress' || match.status === 'completed';
  // A completed match missing a card was won by forfeit (no hole-by-hole reveal).
  const isForfeit = match.status === 'completed' && (!match.creator_scorecard_id || !match.opponent_scorecard_id);
  const iWon = (match.result === 'creator_wins' && isCreator) || (match.result === 'opponent_wins' && isOpponent);

  // Per-player tees. The creator's is tee_color; the opponent's is
  // opponent_tee_color (defaults to the creator's at accept, switchable before
  // scoring). Show both only when they actually differ.
  const firstName = (n?: string | null) => ((n ?? '').trim().split(/\s+/)[0] || 'Player');
  const oppTee = match.opponent_tee_color ?? match.tee_color;
  const differentTees = !!match.opponent_id && oppTee !== match.tee_color;
  const myTee = isCreator ? match.tee_color : oppTee;
  const canChangeTee =
    isParticipant && !!match.opponent_id &&
    (match.status === 'accepted' || match.status === 'in_progress') && !mySubmitted;

  // Visibility — the creator can flip private/public until a scorecard is in
  // (then it locks). Shown to participants only.
  const visibility: Visibility = match.visibility ?? 'private';
  const isPublic = visibility === 'public';
  const canFlipVisibility =
    isCreator && !match.creator_scorecard_id && !match.opponent_scorecard_id &&
    (match.status === 'open' || match.status === 'pending' ||
     match.status === 'accepted' || match.status === 'in_progress');
  const flipVisibility = async () => {
    haptics.select();
    setActing(true);
    try { setMatch(await api.setVisibility(match.id, isPublic ? 'private' : 'public')); }
    catch (e: any) { Alert.alert('Could not change visibility', e?.message ?? 'Try again.'); }
    finally { setActing(false); }
  };

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.course}>{match.course_name}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{STATUS_LABELS[match.status]}</Text></View>
      </View>
      <Text style={styles.sub}>{MATCH_TYPE_LABELS[match.match_type]}</Text>

      {isParticipant && match.opponent_id && (match.status === 'accepted' || match.status === 'in_progress' || match.status === 'completed') && (
        <View style={styles.actionRow}>
          <IconAction icon="chatbubble-outline" label="Message" onPress={() => router.push(`/(app)/match/${match.id}/messages`)} />
          {match.status === 'completed' && otherId ? (
            <IconAction icon="flash-outline" label="Challenge" onPress={challenge} />
          ) : null}
        </View>
      )}

      <View style={styles.card}>
        <Row icon="flag-outline" label="Format" value={MATCH_TYPE_LABELS[match.match_type]} />
        <Row icon="calendar-outline" label="When" value={formatPlayWhen(match.play_date)} />
        {differentTees ? (
          <>
            <Row icon="golf-outline" label={`${firstName(match.creator_name)} tees`} value={match.tee_color} />
            <Row icon="golf-outline" label={`${firstName(match.opponent_name)} tees`} value={oppTee} />
          </>
        ) : (
          <Row icon="golf-outline" label="Tees" value={match.tee_color} />
        )}
        {match.status === 'open' && (
          <Row icon="people-outline" label="Wants handicap" value={`${match.hcp_range_min}–${match.hcp_range_max}`} />
        )}
        {isParticipant && (
          <Row
            icon={isPublic ? 'earth-outline' : 'lock-closed-outline'}
            label="Visibility"
            value={isPublic ? 'Public · in course feed' : 'Private'}
          />
        )}
        {canFlipVisibility && (
          <TouchableOpacity style={styles.teeChange} disabled={acting} onPress={flipVisibility} activeOpacity={0.7}>
            <Ionicons name={isPublic ? 'lock-closed-outline' : 'earth-outline'} size={16} color={colors.accent} />
            <Text style={styles.teeChangeText}>{isPublic ? 'Make private' : 'Make public'}</Text>
          </TouchableOpacity>
        )}
        {canChangeTee && (
          <TouchableOpacity style={styles.teeChange} onPress={openTeePicker} activeOpacity={0.7}>
            <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
            <Text style={styles.teeChangeText}>Change your tees{myTee ? ` · now ${myTee}` : ''}</Text>
          </TouchableOpacity>
        )}
      </View>

      {match.opponent_id && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Players</Text>
          <PlayerLine
            userId={match.creator_id}
            name={match.creator_name ?? 'Creator'}
            photoUrl={match.creator_photo_url}
            you={isCreator}
            index={match.creator_handicap}
            ch={hsetup?.creator_course_handicap}
            isFav={isFavorite(match.creator_id)}
            onStar={() => toggleFav(match.creator_id, { name: match.creator_name ?? 'A golfer', handicap: match.creator_handicap })}
          />
          <PlayerLine
            userId={match.opponent_id}
            name={match.opponent_name ?? 'Opponent'}
            photoUrl={match.opponent_photo_url}
            you={isOpponent}
            index={match.opponent_handicap}
            ch={hsetup?.opponent_course_handicap}
            isFav={isFavorite(match.opponent_id)}
            onStar={() => toggleFav(match.opponent_id!, { name: match.opponent_name ?? 'A golfer', handicap: match.opponent_handicap })}
          />
        </View>
      )}

      {isParticipant && match.status === 'pending' && (
        <View style={styles.card}>
          {isOpponent ? (
            <>
              <Text style={styles.cardTitle}>Challenge</Text>
              <Text style={styles.note}>{match.creator_name ?? 'Someone'} challenged you to a match at {match.course_name}.</Text>
              <TouchableOpacity style={styles.primaryBtn} disabled={acting} onPress={() => { if (!acting) setConfirmAccept(true); }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.onAccent} />
                <Text style={styles.primaryText}>Accept challenge</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.declineMatch(match.id), 'Decline challenge')}>
                <Text style={styles.dangerText}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Challenge sent</Text>
              <Text style={styles.note}>Waiting for {match.opponent_name ?? 'your opponent'} to accept.</Text>
              <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.cancelMatch(match.id), 'Withdraw challenge')}>
                <Text style={styles.dangerText}>Withdraw challenge</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {isParticipant && hsetup?.has_course_data && (
        <PopsPreview
          hsetup={hsetup}
          creatorName={`${match.creator_name ?? 'Creator'}${isCreator ? ' (You)' : ''}`}
          opponentName={`${match.opponent_name ?? 'Opponent'}${isOpponent ? ' (You)' : ''}`}
        />
      )}

      {match.status === 'expired' && (
        <View style={styles.card}>
          <Text style={styles.note}>This match expired — neither player submitted a score in time.</Text>
        </View>
      )}

      {isParticipant && scoringStage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scores</Text>

          {match.status === 'completed' ? (
            isForfeit ? (
              <Text style={styles.note}>
                {iWon
                  ? `Won by forfeit — ${otherName} didn't submit their score in time.`
                  : 'You forfeited — no score was submitted in time.'}
              </Text>
            ) : (
              <>
                <Text style={styles.note}>Both cards are in. See how it played out hole by hole.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/reveal`)}>
                  <Ionicons name="trophy-outline" size={18} color={colors.surface} />
                  <Text style={styles.primaryText}>Watch the reveal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/scorecard`)}>
                  <Text style={styles.secondaryText}>Head-to-head scorecard</Text>
                </TouchableOpacity>
              </>
            )
          ) : !mySubmitted ? (
            <>
              <Text style={styles.note}>Enter your hole-by-hole gross scores. They stay hidden until your opponent submits too.</Text>
              {/* Pre-Settle tension: they're in their card right now. */}
              {!oppSubmitted && otherScoringAt && (
                <View style={styles.statusRow}>
                  <Ionicons name="create-outline" size={16} color={colors.live} />
                  <Text style={[styles.statusText, { color: colors.live }]}>
                    {firstName(otherName)} is entering scores…
                  </Text>
                </View>
              )}
              {oppSubmitted && (
                <View style={styles.statusRow}>
                  <Ionicons name="lock-closed" size={16} color={colors.accent} />
                  <Text style={[styles.statusText, { color: colors.live }]}>
                    {firstName(otherName)}'s card is in. Yours unlocks the reveal.
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/score`)}>
                <Ionicons name="create-outline" size={18} color={colors.surface} />
                <Text style={styles.primaryText}>Enter your scores</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.fairway} />
                <Text style={styles.statusText}>
                  {oppSubmitted ? 'Submitted' : `Card's in. Waiting on ${firstName(otherName)}.`}
                </Text>
              </View>
              {/* Pre-Settle tension: they've opened score entry but haven't posted. */}
              {!oppSubmitted && otherScoringAt && (
                <View style={styles.statusRow}>
                  <Ionicons name="create-outline" size={16} color={colors.live} />
                  <Text style={[styles.statusText, { color: colors.live }]}>
                    {firstName(otherName)} is entering scores…
                  </Text>
                </View>
              )}
              {!oppSubmitted && (
                <TouchableOpacity style={styles.secondaryBtn} disabled={nudging || nudged} onPress={nudgeOpponent}>
                  <Ionicons name={nudged ? 'checkmark' : 'notifications-outline'} size={18} color={colors.fairway} />
                  <Text style={styles.secondaryText}>{nudged ? 'Nudge sent' : `Nudge ${firstName(otherName)} to post`}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/score`)}>
                <Text style={styles.secondaryText}>Edit my scores</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {isCreator && (match.status === 'open' || match.status === 'accepted') && (
          <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.cancelMatch(match.id), 'Cancel match')}>
            <Text style={styles.dangerText}>Cancel match</Text>
          </TouchableOpacity>
        )}
        {isOpponent && match.status === 'accepted' && (
          <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.declineMatch(match.id), 'Back out of match')}>
            <Text style={styles.dangerText}>Back out</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={teeModal} transparent animationType="slide" onRequestClose={() => setTeeModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose your tees</Text>
            <Text style={styles.note}>You and your opponent can play different tees — each plays to their own course handicap.</Text>
            {courseTees === null ? (
              <ActivityIndicator color={colors.fairway} style={{ paddingVertical: spacing.lg }} />
            ) : courseTees.length === 0 ? (
              <Text style={styles.note}>No tees available for this course.</Text>
            ) : (
              courseTees.map((t) => {
                const active = (isCreator ? match.tee_id : match.opponent_tee_id) === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[styles.teeOption, active && styles.teeOptionActive]} disabled={teeBusy} onPress={() => chooseTee(t.id)} activeOpacity={0.8}>
                    <View style={styles.flex1}>
                      <Text style={styles.teeOptionName}>{t.name}</Text>
                      <Text style={styles.note}>{t.course_rating ?? '—'} / {t.slope_rating ?? '—'} · Par {t.par ?? '—'}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setTeeModal(false)} disabled={teeBusy}>
              <Text style={styles.secondaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>

      <ConfirmIndexSheet
        visible={confirmAccept}
        handicap={user?.handicap ?? null}
        updatedAt={user?.handicap_updated_at ?? null}
        actionLabel="Accept match"
        busy={sheetBusy}
        onCancel={() => setConfirmAccept(false)}
        onConfirm={confirmIndexAndAccept}
      />
    </View>
  );
}

// "8.4 · CH 9" — the player's Index and the computed Course Handicap for this match.
function withCourseHcp(index: number | null, courseHcp: number | null | undefined): string {
  const idx = formatHandicap(index);
  return courseHcp != null ? `${idx}  ·  CH ${courseHcp}` : idx;
}

// Scorecard-style preview of where each player receives handicap strokes. Frozen
// name column + horizontally-scrolling holes so it reads like a real card. Data
// comes from getMatchHoles (no scores revealed — safe before play).
const POP_ROW_H = 30;
const POP_CELL_W = 30;

function PopsPreview({ hsetup, creatorName, opponentName }: {
  hsetup: HolesSetup; creatorName: string; opponentName: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { holes, creator_strokes, opponent_strokes } = hsetup;
  const cSum = creator_strokes.reduce((a, b) => a + b, 0);
  const oSum = opponent_strokes.reduce((a, b) => a + b, 0);

  if (cSum === 0 && oSum === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Strokes</Text>
        <Text style={styles.note}>Even match — no strokes given.</Text>
      </View>
    );
  }

  const dotRow = (strokes: number[]) => (
    <View style={styles.popRow}>
      {holes.map((h, i) => (
        <View key={h.hole} style={styles.popCell}>
          {strokes[i] > 0
            ? <Text style={styles.popDot}>{'●'.repeat(strokes[i])}</Text>
            : <Text style={styles.popEmpty}>·</Text>}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Strokes</Text>

      <View style={styles.popWrap}>
        {/* Frozen name column */}
        <View>
          <View style={[styles.popRow, styles.popLabelCell]}><Text style={styles.popHeadLabel}>Hole</Text></View>
          <View style={[styles.popRow, styles.popLabelCell]}><Text style={styles.popSiLabel}>SI</Text></View>
          <View style={[styles.popRow, styles.popLabelCell]}>
            <Text style={styles.popName} numberOfLines={1}>{creatorName}</Text>
            <Text style={styles.popCount}>{cSum}</Text>
          </View>
          <View style={[styles.popRow, styles.popLabelCell]}>
            <Text style={styles.popName} numberOfLines={1}>{opponentName}</Text>
            <Text style={styles.popCount}>{oSum}</Text>
          </View>
        </View>

        {/* Scrolling holes */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.popRow}>
              {holes.map((h) => <View key={h.hole} style={styles.popCell}><Text style={styles.popHead}>{h.hole}</Text></View>)}
            </View>
            <View style={styles.popRow}>
              {holes.map((h) => <View key={h.hole} style={styles.popCell}><Text style={styles.popSi}>{h.stroke_index ?? '–'}</Text></View>)}
            </View>
            {dotRow(creator_strokes)}
            {dotRow(opponent_strokes)}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function IconAction({ icon, label, onPress, disabled }: {
  icon: any; label: string; onPress: () => void; disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.iconAction} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <View style={styles.iconCircle}><Ionicons name={icon} size={22} color={colors.accent} /></View>
      <Text style={styles.iconLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlayerLine({ userId, name, photoUrl, you, index, ch, isFav, onStar }: {
  userId: string; name: string; photoUrl?: string | null; you: boolean; index: number | null;
  ch: number | null | undefined; isFav: boolean; onStar: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.playerLine}>
      <TouchableOpacity style={styles.playerTap} activeOpacity={0.7} disabled={you} onPress={() => router.push(`/(app)/player/${userId}`)}>
        <Avatar name={name} size={38} photoUrl={photoUrl} />
        <View style={styles.playerMid}>
          <Text style={styles.playerName} numberOfLines={1}>{name}{you ? ' (You)' : ''}</Text>
          <Text style={styles.playerSub}>Index {formatHandicap(index)}{ch != null ? `  ·  CH ${ch}` : ''}</Text>
        </View>
      </TouchableOpacity>
      {!you ? (
        <TouchableOpacity hitSlop={8} onPress={() => { haptics.select(); onStar(); }}>
          <Ionicons name={isFav ? 'star' : 'star-outline'} size={20} color={isFav ? colors.gold : colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.paper },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  course: { ...typography.title, fontSize: 24, flexShrink: 1 },
  sub: { ...typography.caption, marginBottom: spacing.sm },
  badge: { borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.fairway },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  cardTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.muted, flex: 1 },
  rowValue: { ...typography.bodySemiBold },
  note: { ...typography.caption, color: colors.muted },
  actionRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.sm, marginBottom: spacing.xs },
  iconAction: { alignItems: 'center', gap: spacing.xs },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconLabel: { ...typography.caption, color: colors.muted, fontSize: 11 },
  playerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  playerTap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  playerMid: { flex: 1 },
  playerName: { ...typography.bodySemiBold },
  playerSub: { ...typography.caption, color: colors.muted },
  primaryBtn: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.bodySemiBold, color: colors.surface },
  secondaryBtn: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodySemiBold, color: colors.fairway },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { ...typography.body, color: colors.ink, flex: 1 },
  dangerBtn: { borderWidth: 1, borderColor: colors.flagRed, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerText: { ...typography.bodySemiBold, color: colors.flagRed },
  errText: { ...typography.body, color: colors.muted },
  link: { ...typography.bodySemiBold, color: colors.fairway },
  flex1: { flex: 1 },
  // Per-player tees
  teeChange: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs },
  teeChangeText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { ...typography.bodySemiBold, fontSize: 18 },
  teeOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface },
  teeOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  teeOptionName: { ...typography.bodySemiBold },
  // Pops preview grid
  popWrap: { flexDirection: 'row', marginTop: spacing.xs },
  popRow: { flexDirection: 'row', height: POP_ROW_H, alignItems: 'center' },
  popLabelCell: { width: 132, paddingRight: spacing.sm, gap: spacing.xs },
  popCell: { width: POP_CELL_W, alignItems: 'center', justifyContent: 'center' },
  popHeadLabel: { ...typography.caption, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  popSiLabel: { ...typography.caption, color: colors.muted, fontSize: 11 },
  popHead: { ...typography.bodySemiBold, fontSize: 13, color: colors.muted },
  popSi: { ...typography.caption, fontSize: 11, color: colors.muted },
  popName: { ...typography.bodySemiBold, fontSize: 13, flex: 1 },
  popCount: { ...typography.bodySemiBold, fontSize: 13, color: colors.accent },
  popDot: { color: colors.accent, fontSize: 11, letterSpacing: -2 },
  popEmpty: { color: colors.border },
  });
}
