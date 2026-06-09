import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { makeType, spacing, radius, type Palette } from '@/constants/theme';
import type { CourseSummary, TeeSummary } from '@/types';

export type CourseSelection = { course_name: string; tee_color: string; tee_id: string };

// Two-step catalog picker (course → tee). Reads GET /courses and GET /courses/:id,
// so any seeded course appears automatically. Overlay pattern (not RN Modal).
export function CoursePicker({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (sel: CourseSelection) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const api = useApi();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CourseSummary | null>(null);
  const [tees, setTees] = useState<TeeSummary[] | null>(null);

  useEffect(() => {
    if (!visible) { setPicked(null); setTees(null); return; }
    setError(null); setCourses(null);
    api.getCourses().then((r) => setCourses(r.courses)).catch((e) => setError(e?.message ?? 'Could not load courses.'));
  }, [visible, api]);

  const openCourse = (course: CourseSummary) => {
    haptics.select(); setPicked(course); setTees(null);
    api.getCourse(course.id).then((r) => setTees(r.tees)).catch(() => setTees([]));
  };
  const pickTee = (tee: TeeSummary) => {
    if (!picked) return;
    haptics.medium();
    onSelect({ course_name: picked.name, tee_color: tee.name, tee_id: tee.id });
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          {picked ? (
            <Pressable onPress={() => { setPicked(null); setTees(null); }} hitSlop={10} style={styles.back}>
              <Ionicons name="chevron-back" size={20} color={c.accent} />
              <Text style={styles.backText}>Courses</Text>
            </Pressable>
          ) : <Text style={styles.title}>Pick a course</Text>}
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={c.muted} /></Pressable>
        </View>

        {error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : !picked ? (
          courses == null ? <ActivityIndicator color={c.accent} style={styles.spinner} />
            : courses.length === 0 ? <Text style={styles.empty}>No courses in the catalog yet.</Text>
              : (
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                  {courses.map((cs) => (
                    <Pressable key={cs.id} style={styles.row} onPress={() => openCourse(cs)}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>{cs.name}</Text>
                        {(cs.city || cs.state) ? <Text style={styles.rowSub}>{[cs.city, cs.state].filter(Boolean).join(', ')}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={c.muted} />
                    </Pressable>
                  ))}
                </ScrollView>
              )
        ) : (
          <>
            <Text style={styles.pickedName}>{picked.name}</Text>
            {tees == null ? <ActivityIndicator color={c.accent} style={styles.spinner} />
              : tees.length === 0 ? <Text style={styles.empty}>No tees for this course.</Text>
                : (
                  <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                    {tees.map((te) => (
                      <Pressable key={te.id} style={styles.row} onPress={() => pickTee(te)}>
                        <View style={styles.rowMain}>
                          <Text style={styles.rowTitle}>{te.name} tees</Text>
                          <Text style={styles.rowSub}>Par {te.par ?? '—'} · {te.course_rating ?? '—'} / {te.slope_rating ?? '—'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={c.muted} />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%',
      backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
      borderWidth: 1, borderColor: c.border, padding: spacing.lg, paddingBottom: spacing.xl,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    title: { ...t.heading },
    back: { flexDirection: 'row', alignItems: 'center' },
    backText: { ...t.bodySemiBold, color: c.accent },
    pickedName: { ...t.subheading, marginBottom: spacing.sm },
    list: { flexGrow: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    rowMain: { flex: 1, gap: 2 },
    rowTitle: { ...t.bodySemiBold },
    rowSub: { ...t.caption, color: c.muted },
    spinner: { padding: spacing.xl },
    empty: { ...t.body, color: c.muted, textAlign: 'center', padding: spacing.lg },
  });
}
