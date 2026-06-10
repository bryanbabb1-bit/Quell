import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Image, Modal,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { Message, Gif } from '@/types';
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

  // GIF picker state
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifUnconfigured, setGifUnconfigured] = useState(false);

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

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const appendAndScroll = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !id) return;
    setSending(true);
    setDraft('');
    try {
      appendAndScroll(await api.sendMessage(id, text));
    } catch {
      setDraft(text); // restore the unsent draft
    } finally {
      setSending(false);
    }
  };

  // ── GIFs ──
  const loadGifs = useCallback(async (q: string) => {
    setGifLoading(true);
    try {
      const r = await api.searchGifs(q);
      setGifs(r.gifs);
      setGifUnconfigured(!!r.unconfigured);
    } catch {
      setGifs([]);
    } finally {
      setGifLoading(false);
    }
  }, [api]);

  const openGif = () => { setGifQuery(''); setGifOpen(true); loadGifs(''); };

  // Debounced search as the query changes (only while the picker is open).
  useEffect(() => {
    if (!gifOpen) return;
    const t = setTimeout(() => loadGifs(gifQuery), 350);
    return () => clearTimeout(t);
  }, [gifQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickGif = async (url: string) => {
    if (!id) return;
    setGifOpen(false);
    try {
      appendAndScroll(await api.sendGif(id, url));
    } catch {
      /* swallow — the poll will reconcile */
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
                {item.gif_url ? (
                  <GifBubble url={item.gif_url} styles={styles} />
                ) : (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    <Text style={[styles.bubbleText, mine && styles.mineText]}>{item.body}</Text>
                  </View>
                )}
                <Text style={styles.time}>{formatMessageTime(item.created_at)}</Text>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TouchableOpacity style={styles.gifBtn} onPress={openGif}>
            <Text style={styles.gifBtnText}>GIF</Text>
          </TouchableOpacity>
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

      <Modal visible={gifOpen} animationType="slide" transparent onRequestClose={() => setGifOpen(false)}>
        <View style={styles.gifBackdrop}>
          <View style={styles.gifSheet}>
            <View style={styles.gifHeader}>
              <TextInput
                style={styles.gifSearch}
                value={gifQuery}
                onChangeText={setGifQuery}
                placeholder="Search GIFs…"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
              />
              <TouchableOpacity onPress={() => setGifOpen(false)} hitSlop={8}>
                <Text style={styles.gifClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {gifLoading ? (
              <ActivityIndicator color={colors.fairway} style={{ paddingVertical: spacing.xl }} />
            ) : gifs.length === 0 ? (
              <Text style={styles.gifEmpty}>
                {gifUnconfigured ? 'GIFs aren’t enabled yet (Giphy key not set).' : 'No GIFs found — try another search.'}
              </Text>
            ) : (
              <FlatList
                data={gifs}
                keyExtractor={(g) => g.id}
                numColumns={2}
                columnWrapperStyle={{ gap: spacing.sm }}
                contentContainerStyle={styles.gifGrid}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.gifCell} onPress={() => pickGif(item.full)} activeOpacity={0.8}>
                    <Image source={{ uri: item.preview }} style={styles.gifThumb} resizeMode="cover" />
                  </TouchableOpacity>
                )}
              />
            )}
            <Text style={styles.gifAttr}>Powered by GIPHY</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// A GIF message bubble: width-locked, height derived from the GIF's own aspect
// ratio (read on load) so it isn't squashed.
function GifBubble({ url, styles }: { url: string; styles: ReturnType<typeof makeStyles> }) {
  const [ratio, setRatio] = useState(1);
  return (
    <Image
      source={{ uri: url }}
      style={[styles.gifMsg, { height: 200 / ratio }]}
      onLoad={(e) => { const s = e.nativeEvent.source; if (s?.width && s?.height) setRatio(s.width / s.height); }}
      resizeMode="cover"
    />
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
  gifMsg: { width: 200, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.12)' },
  time: { ...typography.caption, fontSize: 11, color: colors.muted, marginHorizontal: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper },
  gifBtn: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  gifBtnText: { ...typography.bodySemiBold, color: colors.accent, fontSize: 13, letterSpacing: 0.5 },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fairway, alignItems: 'center', justifyContent: 'center' },
  // GIF picker
  gifBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  gifSheet: { height: '70%', backgroundColor: colors.paper, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  gifHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gifSearch: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.ink },
  gifClose: { ...typography.bodySemiBold, color: colors.accent },
  gifGrid: { gap: spacing.sm, paddingBottom: spacing.md },
  gifCell: { flex: 1, height: 120, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  gifThumb: { width: '100%', height: '100%' },
  gifEmpty: { ...typography.caption, textAlign: 'center', paddingVertical: spacing.xl },
  gifAttr: { ...typography.caption, fontSize: 10, color: colors.muted, textAlign: 'center' },
  });
}
