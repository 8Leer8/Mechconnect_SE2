import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar, Image, Modal, ActionSheetIOS } from 'react-native';
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
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [accepting, setAccepting] = useState(false);

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

  const handleHeaderMore = () => {
    const hasBackjob = hasBackjobRequest;
    if (Platform.OS === 'ios' && ActionSheetIOS) {
      const options = ['Report', 'Copy chat'];
      if (hasBackjob) options.push('Accept Backjob');
      options.push('Cancel');
      const cancelIndex = options.length - 1;
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: cancelIndex }, (idx) => {
        if (idx === 0) console.warn('Report pressed');
        if (idx === 1) console.warn('Copy chat pressed');
        if (hasBackjob && idx === 2) setShowAcceptModal(true);
      });
    } else {
      const buttons: any[] = [];
      buttons.push({ text: 'Report', onPress: () => console.warn('Report pressed') });
      buttons.push({ text: 'Copy chat', onPress: () => console.warn('Copy chat pressed') });
      if (hasBackjob) {
        buttons.push({ text: "Accept Backjob", onPress: () => setShowAcceptModal(true) });
      }
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Chat options', undefined, buttons);
    }
  };

  const hasBackjobRequest = useMemo(() => {
    try {
      return messages.some(m => {
        try {
          const p = typeof m.content === 'string' ? JSON.parse(m.content) : null;
          return p && p.type === 'backjob_request';
        } catch (e) { return false; }
      });
    } catch (e) { return false; }
  }, [messages]);

  const handleAcceptConfirm = async () => {
    setAccepting(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}

      const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/accept-backjob/`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.warn('accept backjob failed', res.status, body);
        throw new Error('Failed to accept backjob');
      }
      const data = await res.json();
      setShowAcceptModal(false);
      Alert.alert('Accepted', data?.message || 'You confirmed you will do the backjob.');

      // Try to immediately refresh messages so clients see any updates
      try {
        const mheaders: any = { 'Content-Type': 'application/json' };
        const token2 = await AsyncStorage.getItem('auth_token');
        if (token2) mheaders['Authorization'] = `Bearer ${token2}`;
        const r = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, {
          method: 'GET',
          credentials: 'include',
          headers: mheaders,
        });
        if (r.ok) {
          const d = await r.json();
          setMessages(d || []);
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Unable to accept backjob.');
    } finally {
      setAccepting(false);
    }
  };

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
        credentials: 'include',
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
    // try parse structured content (system messages like backjob_request)
    let parsed: any = null;
    try { parsed = JSON.parse(item.content); } catch (e) { parsed = null; }

    if (parsed && parsed.type === 'backjob_request') {
      return (
        <View style={[styles.messageRow, { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }]}> 
          <View style={styles.systemBubbleContainer}>
            <View style={styles.systemBubble}>
              <ThemedText style={styles.systemTitle}>Backjob Request</ThemedText>
              <ThemedText style={styles.systemText}>{parsed.requested_by_name || 'Client'} asked for a backjob</ThemedText>
              {parsed.reason ? <ThemedText style={styles.systemText}>{parsed.reason}</ThemedText> : null}
              {Array.isArray(parsed.images) && parsed.images.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {parsed.images.map((img: string, idx: number) => (
                    <Image key={idx} source={{ uri: img }} style={styles.systemImage} />
                  ))}
                </View>
              )}
              <ThemedText style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
            </View>
          </View>
        </View>
      );
    }

      if (parsed && parsed.type === 'backjob_accepted') {
        return (
          <View style={[styles.messageRow, { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }]}> 
            <View style={styles.systemBubbleContainer}>
              <View style={styles.systemBubble}>
                <ThemedText style={styles.systemTitle}>Backjob Accepted</ThemedText>
                <ThemedText style={styles.systemText}>{parsed.mechanic_name || 'Mechanic'} accepted the backjob</ThemedText>
                {parsed.message ? <ThemedText style={styles.systemText}>{parsed.message}</ThemedText> : null}
                <ThemedText style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
              </View>
            </View>
          </View>
        );
      }

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
        <TouchableOpacity onPress={handleHeaderMore} style={styles.headerAction}>
          <FontAwesome name="ellipsis-v" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#FF8C00" />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
          <FlatList
            data={messages}
            // Use a combined key of id + created_at to avoid duplicates; fallback to index
            keyExtractor={(it, index) => {
              if (it && (it.id || it.created_at)) {
                const idPart = it.id ? String(it.id) : 'noid';
                const timePart = it.created_at ? String(new Date(it.created_at).getTime()) : 'notime';
                return `${idPart}_${timePart}`;
              }
              return String(index);
            }}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
          />

          <Modal visible={showAcceptModal} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <ThemedText style={styles.modalTitle}>Accept Backjob</ThemedText>
                <ThemedText style={styles.modalText}>By accepting this backjob you acknowledge you'll take responsibility to perform the requested work. Confirm to notify the client.</ThemedText>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#111214' }]} onPress={() => setShowAcceptModal(false)} disabled={accepting}>
                    <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF8C00' }]} onPress={handleAcceptConfirm} disabled={accepting}>
                    {accepting ? <ActivityIndicator color="#fff" /> : <ThemedText style={[styles.modalBtnText, { color: '#fff' }]}>I'll do it</ThemedText>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

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
  systemBubble: { backgroundColor: '#2C2C2E', padding: 12, borderRadius: 12, maxWidth: '90%', alignItems: 'center' },
  systemTitle: { fontSize: 13, fontWeight: '700', color: '#FF8C00', marginBottom: 4 },
  systemText: { fontSize: 13, color: '#ECEDEE', textAlign: 'center' },
  systemImage: { width: 220, height: 140, borderRadius: 10, marginTop: 8 },
  systemBubbleContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerAction: { width: 40, alignItems: 'center', justifyContent: 'center', padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '86%', backgroundColor: '#0F1112', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#222426' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  modalText: { fontSize: 14, color: '#D1D1D6', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700' },
});
