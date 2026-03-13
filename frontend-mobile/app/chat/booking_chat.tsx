import React, { useEffect, useState, useRef } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Hide the default Expo Router header so we only show our custom header
export const screenOptions = { headerShown: false } as const;

export default function BookingChatScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const navigation = useNavigation();
  const [conversationData, setConversationData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<any>(null);
  const [accountId, setAccountId] = useState<number | null>(null);

  // Fetch profile or stored account id
  const fetchProfile = async (): Promise<number | null> => {
    try {
      const r = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        const aid = d?.profile?.id || d?.id || d?.profile?.account_id || null;
        if (aid) {
          setAccountId(Number(aid));
          await AsyncStorage.setItem('account_id', String(aid));
          return Number(aid);
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      const stored = await AsyncStorage.getItem('account_id');
      if (stored) {
        setAccountId(Number(stored));
        return Number(stored);
      }
    } catch (e) {
      // ignore
    }
    return null;
  };

  const ensureConversation = async (resolvedAccountId: number | null) => {
    setLoading(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        // ignore
      }
      const redactedHeaders = {
        ...headers,
        ...(headers.Authorization ? { Authorization: 'REDACTED' } : {}),
      };
      console.warn('Creating conversation with headers', redactedHeaders);
      const res = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => null);
        console.warn('conversation create failed', res.status, text);
        throw new Error('Failed to get/create conversation');
      }
      const data = await res.json();
      setConversationId(data.id);
      setConversationData(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Hide any parent/header provided by the router to avoid duplicate header
    try {
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    } catch (e) {
      // ignore
    }
    if (!bookingId) return;
    let mounted = true;

    (async () => {
      const aid = await fetchProfile();
      if (!mounted) return;
      await ensureConversation(aid);
    })();

    return () => { mounted = false; };
  }, [bookingId]);

  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;

    const fetchMessages = async () => {
      try {
        const headers: any = { 'Content-Type': 'application/json' };
        try {
          const token = await AsyncStorage.getItem('auth_token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {}
        const resUrl = `${API_URL}/chat/${conversationId}/messages/?mark_read=1`;
        const r = await fetch(resUrl, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!mounted) return;
        setMessages(d || []);
      } catch (e) {
        console.warn(e);
      }
    };

    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => { mounted = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [conversationId, accountId]);

  const handleSend = async () => {
    if (!text.trim()) {
      Alert.alert('Empty message', 'Please enter a message before sending.');
      return;
    }
    if (!conversationId) {
      Alert.alert('No conversation', 'Unable to start chat for this booking. Please try again.');
      console.warn('Send aborted: missing conversationId');
      return;
    }
    setSending(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
      const safeHeaders = { ...headers };
      if (safeHeaders.Authorization) {
        safeHeaders.Authorization = 'REDACTED';
      }
      console.warn('Sending message with headers', safeHeaders);
      const res = await fetch(`${API_URL}/chat/${conversationId}/messages/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: text.trim() }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.warn('send failed', res.status, body);
        throw new Error('Failed to send');
      }
      const m = await res.json();
      setMessages(prev => [...prev, m]);
      setText('');
    } catch (e) {
      console.warn(e);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMe = !!item.is_mine;
    return (
      <View style={[styles.messageRow, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}> 
        <View style={[styles.messageBubble, isMe ? { backgroundColor: '#FF8C00', alignSelf: 'flex-end' } : {}]}>
          <ThemedText style={isMe ? { color: '#fff' } : {}}>{item.content}</ThemedText>
          <ThemedText style={[styles.messageTime, isMe ? { color: '#ffe6cc' } : {}]}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <FontAwesome name="chevron-left" size={22} color="#FF8C00" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <ThemedText style={styles.headerName}>{(() => {
            if (!conversationData || !conversationData.participants) return '';
            const others = conversationData.participants.filter((p: any) => String(p.id) !== String(accountId));
            const pick = others.length ? others[0] : conversationData.participants[0];
            if (!pick) return '';
            return `${pick.firstname || ''} ${pick.lastname || ''}`.trim() || pick.username || '';
          })()}</ThemedText>
          <ThemedText style={styles.headerBooking}>Booking #{conversationData?.booking_id || bookingId}</ThemedText>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#FF8C00" />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
          <FlatList
            data={messages}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
          />

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a message..."
              placeholderTextColor="#8E8E93"
              style={styles.input}
              selectionColor="#FF8C00"
              keyboardAppearance="dark"
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <FontAwesome name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 20),
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222426',
    backgroundColor: '#111214'
  },
  headerName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerBooking: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  messageRow: { marginBottom: 12 },
  messageBubble: { backgroundColor: '#1A1C1E', padding: 12, borderRadius: 10, alignSelf: 'flex-start', maxWidth: '80%' },
  messageTime: { fontSize: 10, color: '#8E8E93', marginTop: 6 },
  inputRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: '#222426', alignItems: 'flex-end', backgroundColor: '#111214' },
  input: { flex: 1, backgroundColor: '#0F1112', borderWidth: 1, borderColor: '#222426', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12, marginRight: 10, color: '#fff', maxHeight: 120 },
  sendBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF8C00', justifyContent: 'center', alignItems: 'center' },
});
