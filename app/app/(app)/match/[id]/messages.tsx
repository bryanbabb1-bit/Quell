import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { Message } from '@/types';
import { formatMessageTime } from '@/lib/format';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const POLL_MS = 5000;

export default function MessagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // Lift the composer by the exact keyboard height (UI-thread tracked) so the
  // text box is never covered — reliable regardless of header/safe-area.
  const keyboard = useAnimatedKeyboard();
  const kbStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { messages } = await api.messages(id);
      setMessages(messages);
    } catch {
      // Keep last-known thread on a transient failure; the poll will retry.
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  // Initial load + lightweight polling. Swaps to a live subscription when the
  // realtime vendor is chosen — the screen contract stays the same.
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !id) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await api.sendMessage(id, text);
      setMessages((prev) => [...prev, msg]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setDraft(text); // restore the unsent draft
    } finally {
      setSending(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Animated.View style={[{ flex: 1 }, kbStyle]}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello and set up your match.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleText, mine && styles.mineText]}>{item.body}</Text>
                </View>
                <Text style={styles.time}>{formatMessageTime(item.created_at)}</Text>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={colors.muted}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending || !draft.trim()}>
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  row: { maxWidth: '80%', gap: 3 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mine: { backgroundColor: colors.accent },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleText: { ...typography.body },
  mineText: { color: colors.onAccent },
  time: { ...typography.caption, fontSize: 11, color: colors.muted, marginHorizontal: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fairway, alignItems: 'center', justifyContent: 'center' },
  });
}
