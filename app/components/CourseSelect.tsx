import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCourses } from '@/store/useCourseStore';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { makeType, spacing, radius, type Palette } from '@/constants/theme';
import type { CourseSummary } from '@/types';

// Type-ahead course picker backed by the catalog (GET /courses). Filters as you
// type and returns the selected CourseSummary (or null on clear). Reused by the
// profile home-course, onboarding, and the discovery filter.
export function CourseSelect({ label, valueName, onSelect, placeholder = 'Search courses…' }: {
  label?: string;
  valueName?: string | null;
  onSelect: (course: CourseSummary | null) => void;
  placeholder?: string;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { courses, load } = useCourses();
  const [query, setQuery] = useState(valueName ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQuery(valueName ?? ''); }, [valueName]);

  const matches = useMemo(() => {
    if (!courses) return [];
    const q = query.trim().toLowerCase();
    const base = q ? courses.filter((co) => co.name.toLowerCase().includes(q)) : courses;
    return base.slice(0, 8);
  }, [courses, query]);

  const choose = (co: CourseSummary) => {
    haptics.select();
    Keyboard.dismiss();
    onSelect(co);
    setQuery(co.name);
    setOpen(false);
  };
  const clear = () => { onSelect(null); setQuery(''); setOpen(true); };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={c.muted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => { setQuery(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          autoCapitalize="words"
        />
        {query.length > 0 ? (
          <Pressable onPress={clear} hitSlop={8}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable>
        ) : null}
      </View>

      {open && matches.length > 0 ? (
        <View style={styles.dropdown}>
          {matches.map((co, i) => (
            <Pressable key={co.id} style={[styles.row, i > 0 && styles.rowDivider]} onPress={() => choose(co)}>
              <Text style={styles.rowName}>{co.name}</Text>
              {(co.city || co.state) ? <Text style={styles.rowSub}>{[co.city, co.state].filter(Boolean).join(', ')}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    wrap: { gap: spacing.xs },
    label: { ...t.overline, color: c.muted },
    inputRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    },
    input: { flex: 1, fontSize: 16, color: c.text, paddingVertical: 2 },
    dropdown: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden' },
    row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    rowName: { ...t.bodySemiBold },
    rowSub: { ...t.caption, color: c.muted },
  });
}
