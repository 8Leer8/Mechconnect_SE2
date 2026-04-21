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
  const listRef = useRef<FlatList<any> | null>(null);
  const [conversationData, setConversationData] = useState<any | null>(null);
  const [canSendMessages, setCanSendMessages] = useState(true);
  const [myChatRole, setMyChatRole] = useState<string | null>(null);
  const [chatAccessDenied, setChatAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<any>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptedLocks, setAcceptedLocks] = useState<number[]>([]);
  const [quotationActionLoading, setQuotationActionLoading] = useState<'accept' | 'reject' | null>(null);
  const [expandedQuoteCards, setExpandedQuoteCards] = useState<Record<string, boolean>>({});
  const [isAssignedMechanicForBooking, setIsAssignedMechanicForBooking] = useState(false);
  const [didInitialScrollToLatest, setDidInitialScrollToLatest] = useState(false);
  const [showQuotationDecisionModal, setShowQuotationDecisionModal] = useState(false);
  const [quotationDecisionAction, setQuotationDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);
  const forceFollowNextUpdateRef = useRef(false);
  const lastMessageSignatureRef = useRef('');

  const getQuotationMessageKey = (m: any) => `${m?.id || 'noid'}_${m?.created_at || 'notime'}`;

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
      let res = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({}),
      });

      // If token is expired, attempt a single retry without the Authorization header
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        const txt = await res.text().catch(() => '');
        console.warn('conversation create failed', res.status, txt);
        if (txt && txt.toLowerCase().includes('token has expired')) {
          try {
            await AsyncStorage.removeItem('auth_token');
          } catch (e) {}
          // retry without Authorization header (may succeed via session cookie)
          const retryHeaders: any = { 'Content-Type': 'application/json' };
          const retryRes = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
            method: 'POST',
            credentials: 'include',
            headers: retryHeaders,
            body: JSON.stringify({}),
          });
          res = retryRes;
        }
      }

      if (!res.ok) {
        const text = await res.text().catch(() => null);
        console.warn('conversation create failed', res.status, text);
        if (res.status === 403) {
          setConversationData(null);
          setConversationId(null);
          setMessages([]);
          setCanSendMessages(false);
          setMyChatRole('none');
          setChatAccessDenied(true);
          return;
        }
        throw new Error('Failed to get/create conversation');
      }
      const data = await res.json();
      setConversationId(data.id);
      setConversationData(data);
      setCanSendMessages(Boolean(data?.can_send ?? false));
      setMyChatRole(data?.my_chat_role || null);
      setChatAccessDenied(data?.my_chat_role === 'none' && !data?.is_participant);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshConversationAccess = async () => {
    if (!bookingId) return;
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        // ignore
      }
      const res = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        if (res.status === 403) {
          setConversationData(null);
          setConversationId(null);
          setMessages([]);
          setCanSendMessages(false);
          setMyChatRole('none');
          setChatAccessDenied(true);
        }
        return;
      }
      const data = await res.json();
      setConversationData(data);
      setCanSendMessages(Boolean(data?.can_send ?? false));
      setMyChatRole(data?.my_chat_role || null);
      setChatAccessDenied(data?.my_chat_role === 'none' && !data?.is_participant);
      if (data?.id && data.id !== conversationId) {
        setConversationId(data.id);
      }
    } catch (e) {
      // ignore permission refresh failures
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
    setShowOptionsModal(true);
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

  const canOpenQuotationEditor = useMemo(() => {
    if (!canSendMessages) return false;
    if (isAssignedMechanicForBooking) return true;
    if (!accountId) return false;
    return messages.some((m: any) => {
      try {
        const p = typeof m.content === 'string' ? JSON.parse(m.content) : null;
        return p && p.type === 'quotation_request' && Number(p.mechanic_id) === Number(accountId);
      } catch (e) {
        return false;
      }
    });
  }, [canSendMessages, isAssignedMechanicForBooking, accountId, messages]);

  useEffect(() => {
    if (!bookingId || !accountId) {
      setIsAssignedMechanicForBooking(false);
      return;
    }

    let mounted = true;
    const verifyMechanicAssignment = async () => {
      try {
        const headers: any = { 'Content-Type': 'application/json' };
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // This endpoint should only succeed for mechanics assigned/authorized on this booking.
        const r = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        if (!mounted) return;
        setIsAssignedMechanicForBooking(r.ok);
      } catch (e) {
        if (mounted) setIsAssignedMechanicForBooking(false);
      }
    };

    verifyMechanicAssignment();
    return () => { mounted = false; };
  }, [bookingId, accountId]);

  const openQuotationEditor = () => {
    if (!bookingId) return;
    router.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(bookingId) } });
  };

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
    let accessPoll: any = null;

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

        // If we have accepted locks, force those quotation payloads to 'accepted'
        let fetched = d || [];
        try {
          if (acceptedLocks && acceptedLocks.length > 0) {
            fetched = fetched.map((m: any) => {
              try {
                const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
                if (p && p.type === 'quotation_request' && acceptedLocks.includes(p.quotation_id) && p.status !== 'accepted') {
                  p.status = 'accepted';
                  m.content = JSON.stringify(p);
                }
              } catch (e) {}
              return m;
            });

            // Clear locks for quotations that the server now reports as accepted
            const remainingLocks = acceptedLocks.filter(lockId => {
              const found = fetched.find((mm: any) => {
                try {
                  const pp = typeof mm.content === 'string' ? JSON.parse(mm.content) : mm.content;
                  return pp && pp.type === 'quotation_request' && pp.quotation_id === lockId && pp.status === 'accepted';
                } catch (e) { return false; }
              });
              return !found;
            });
            if (remainingLocks.length !== acceptedLocks.length) setAcceptedLocks(remainingLocks);
          }
        } catch (e) {
          // ignore
        }

        setMessages(fetched || []);
      } catch (e) {
        console.warn(e);
      }
    };

    refreshConversationAccess();
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    accessPoll = setInterval(refreshConversationAccess, 15000);
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (accessPoll) clearInterval(accessPoll);
    };
  }, [conversationId, accountId, acceptedLocks]);

  useEffect(() => {
    return () => {
      if (initialScrollTimerRef.current) {
        clearTimeout(initialScrollTimerRef.current);
        initialScrollTimerRef.current = null;
      }
    };
  }, []);

  const scrollToLatestOnce = () => {
    if (!messages.length || didInitialScrollToLatest) return;
    if (initialScrollTimerRef.current) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = null;
    }

    // Wait for first layout/content pass, then perform a second pass to handle async row sizing.
    initialScrollTimerRef.current = setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: false });
        setTimeout(() => {
          try { listRef.current?.scrollToEnd({ animated: false }); } catch (e) {}
          setDidInitialScrollToLatest(true);
        }, 40);
      } catch (e) {
        // ignore
      }
    }, 30);
  };

  useEffect(() => {
    // Reset when conversation changes so each opened chat auto-jumps to latest once.
    setDidInitialScrollToLatest(false);
    isNearBottomRef.current = true;
    forceFollowNextUpdateRef.current = false;
    lastMessageSignatureRef.current = '';
    if (initialScrollTimerRef.current) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = null;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!messages.length || !didInitialScrollToLatest) return;

    const last = messages[messages.length - 1];
    const lastContent = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
    const signature = `${messages.length}|${last?.id ?? 'noid'}|${last?.created_at ?? 'notime'}|${lastContent}`;

    if (!lastMessageSignatureRef.current) {
      lastMessageSignatureRef.current = signature;
      return;
    }

    if (lastMessageSignatureRef.current === signature) return;
    lastMessageSignatureRef.current = signature;

    if (!isNearBottomRef.current && !forceFollowNextUpdateRef.current) return;

    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      } finally {
        forceFollowNextUpdateRef.current = false;
      }
    }, 20);
  }, [messages, didInitialScrollToLatest]);

  const handleContentSizeChange = () => {
    if (!messages.length) return;

    // Initial enter: jump to latest once.
    if (!didInitialScrollToLatest) {
      scrollToLatestOnce();
      return;
    }

    // Real-time follow: when user is near bottom, or when user just sent a message.
    if (!isNearBottomRef.current && !forceFollowNextUpdateRef.current) return;

    setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: true });
      } catch (e) {
        // ignore
      } finally {
        forceFollowNextUpdateRef.current = false;
      }
    }, 20);
  };

  const handleListScroll = (e: any) => {
    try {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      isNearBottomRef.current = distanceFromBottom <= 120;
    } catch (err) {
      // ignore
    }
  };

  const handleSend = async () => {
    if (!canSendMessages) {
      Alert.alert('View only', 'Only lead mechanic and shop owner can send messages in this booking chat.');
      return;
    }
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
      forceFollowNextUpdateRef.current = true;
      setMessages(prev => [...prev, m]);
      setText('');
    } catch (e) {
      console.warn(e);
    } finally {
      setSending(false);
    }
  };

  const getPendingQuotationId = () => {
    for (const m of messages) {
      try {
        const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        if (p && p.type === 'quotation_request' && p.status === 'pending') return p.quotation_id;
      } catch (e) {
        // ignore
      }
    }
    return null;
  };

  const executeQuotationDecision = async (decision: 'accept' | 'reject') => {
    const pendingQuotedId = getPendingQuotationId();

    if (decision === 'accept') {
      const optimisticAccept = (oldMessages: any[]) => oldMessages.map(m => {
        try {
          const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
          if (p && p.type === 'quotation_request' && (pendingQuotedId == null || p.quotation_id === pendingQuotedId)) {
            p.status = 'accepted';
            m.content = JSON.stringify(p);
          }
        } catch (e) {}
        return m;
      });

      setMessages(prev => optimisticAccept(prev));
      try {
        setQuotationActionLoading('accept');
        const headers: any = { 'Content-Type': 'application/json' };
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_URL}/bookings/bookings/${bookingId}/quotation/accept/`, {
          method: 'POST',
          credentials: 'include',
          headers,
        });
        if (!res.ok) throw new Error('Failed to accept');

        if (pendingQuotedId) {
          setAcceptedLocks(prev => Array.from(new Set([...(prev || []), pendingQuotedId])));
        }

        const r = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (r.ok) { const d = await r.json(); setMessages(d || []); }
        try { await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, { method: 'GET', credentials: 'include' }); } catch (e) {}
      } catch (e) {
        console.warn(e);
        Alert.alert('Error', 'Unable to accept quotation.');
        try { const r2 = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } }); if (r2.ok) { const d2 = await r2.json(); setMessages(d2 || []); } } catch (_) {}
      } finally { setQuotationActionLoading(null); }
      return;
    }

    const optimisticUpdate = (oldMessages: any[]) => oldMessages.map(m => {
      try {
        const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        if (p && p.type === 'quotation_request' && (pendingQuotedId == null || p.quotation_id === pendingQuotedId)) {
          p.status = 'rejected';
          m.content = JSON.stringify(p);
        }
      } catch (e) {}
      return m;
    });

    setMessages(prev => optimisticUpdate(prev));
    setQuotationActionLoading('reject');
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      const token = await AsyncStorage.getItem('auth_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/bookings/bookings/${bookingId}/quotation/reject/`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        console.warn('reject failed', res.status, txt);
        throw new Error('Failed to reject');
      }

      const r = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      if (r.ok) { const d = await r.json(); setMessages(d || []); }
      try {
        await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, { method: 'GET', credentials: 'include' });
      } catch (e) {}
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Unable to reject quotation.');
      try { const r2 = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } }); if (r2.ok) { const d2 = await r2.json(); setMessages(d2 || []); } } catch (_) {}
    } finally { setQuotationActionLoading(null); }
  };

  const renderItem = ({ item }: { item: any }) => {
    // try parse structured content (system messages like backjob_request)
    let parsed: any = null;
    try { parsed = JSON.parse(item.content); } catch (e) { parsed = null; }

    if (parsed && parsed.type === 'backjob_request') {
      return (
        <View style={styles.messageRow}>
          <View style={[styles.systemBubbleContainer, styles.systemBubbleContainerAligned]}>
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

    if (parsed && parsed.type === 'quotation_request') {
      const quoteMessageKey = getQuotationMessageKey(item);
      const itemList = Array.isArray(parsed.items) ? parsed.items : [];
      const sortQuotationItems = (rawList: any[]) => rawList
        .map((it: any, idx: number) => ({ ...it, __sourceIndex: idx }))
        .sort((a: any, b: any) => {
          const aTimeRaw = a?.updated_at || a?.created_at || null;
          const bTimeRaw = b?.updated_at || b?.created_at || null;
          const aTime = aTimeRaw ? new Date(aTimeRaw).getTime() : 0;
          const bTime = bTimeRaw ? new Date(bTimeRaw).getTime() : 0;

          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
            return aTime - bTime; // oldest first, newest at bottom
          }

          const aId = Number(a?.id);
          const bId = Number(b?.id);
          if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
            return aId - bId; // lower id first, newer/higher id lower in the list
          }

          return (a.__sourceIndex || 0) - (b.__sourceIndex || 0);
        })
      ;

      const orderedItemList = sortQuotationItems(itemList);
      const hasPendingItem = itemList.some((it: any) => String(it?.status || '').toLowerCase() === 'pending');
      // Prefer explicit quotation status from server. Only infer from items if missing.
      const resolvedStatus = parsed.status
        ? String(parsed.status).toLowerCase()
        : (hasPendingItem ? 'pending' : 'accepted');
      const isPending = resolvedStatus === 'pending';
      const amIMechanic = accountId && parsed.mechanic_id && Number(accountId) === Number(parsed.mechanic_id);
      const isExpanded = expandedQuoteCards[quoteMessageKey] ?? isPending;
      const compactTitle = isPending ? 'Quotation Request' : 'Quotation Requested';
      const compactTitleStyle = isPending ? styles.quotationCompactTextPending : styles.quotationCompactText;
      const statusText = isPending ? 'Pending' : (resolvedStatus === 'accepted' ? 'Accepted' : 'Rejected');
      const statusTextStyle = isPending
        ? styles.quoteStatusPending
        : (resolvedStatus === 'accepted' ? styles.quoteStatusAccepted : styles.quoteStatusRejected);

      // Find previous quotation snapshot (same quotation_id) to infer per-item changes.
      const currentIdx = messages.findIndex((m: any) => getQuotationMessageKey(m) === quoteMessageKey);
      let previousItems: any[] = [];
      if (currentIdx > 0) {
        for (let i = currentIdx - 1; i >= 0; i--) {
          try {
            const pm = messages[i];
            const pp = typeof pm.content === 'string' ? JSON.parse(pm.content) : pm.content;
            const ppStatus = String(pp?.status || '').toLowerCase();
            if (pp && pp.type === 'quotation_request' && String(pp.quotation_id) === String(parsed.quotation_id) && ppStatus !== 'rejected') {
              previousItems = Array.isArray(pp.items) ? pp.items : [];
              break;
            }
          } catch (e) {}
        }
      }

      const orderedPreviousItems = sortQuotationItems(previousItems);

      const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
      const normalizeNum = (v: any) => Number(v ?? 0);
      const getAssocKey = (it: any) => {
        const serviceId = Number(it?.service);
        const addOnId = Number(it?.service_add_on);
        if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
        if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
        return null;
      };
      const isLikelyRename = (prevDesc: any, currDesc: any) => {
        const a = normalizeText(prevDesc);
        const b = normalizeText(currDesc);
        if (!a || !b) return false;
        if (a === b) return true;
        if (a.includes(b) || b.includes(a)) return true;

        const aTokens = new Set(a.split(/\s+/).filter(Boolean));
        const bTokens = new Set(b.split(/\s+/).filter(Boolean));
        if (!aTokens.size || !bTokens.size) return false;

        let overlap = 0;
        aTokens.forEach(t => { if (bTokens.has(t)) overlap += 1; });
        const ratioA = overlap / aTokens.size;
        const ratioB = overlap / bTokens.size;
        return ratioA >= 0.6 || ratioB >= 0.6;
      };

      // Match current items against previous snapshot using a stable strategy:
      // 1) same id, 2) same service/add-on identity, 3) exact content, 4) same description.
      // This avoids false Added/Removed when backend regenerates IDs for edited rows.
      const usedPrevIndexes = new Set<number>();
      const matchedRows = orderedItemList.map((currentIt: any) => {
        let matchIdx = -1;

        if (currentIt?.id != null) {
          matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
            !usedPrevIndexes.has(prevIdx) && prevIt?.id != null && String(prevIt.id) === String(currentIt.id)
          ));
        }

        if (matchIdx < 0) {
          const currentAssoc = getAssocKey(currentIt);
          if (currentAssoc) {
            matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
              !usedPrevIndexes.has(prevIdx) && getAssocKey(prevIt) === currentAssoc
            ));
          }
        }

        if (matchIdx < 0) {
          matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
            !usedPrevIndexes.has(prevIdx) &&
            normalizeText(prevIt?.description) === normalizeText(currentIt?.description) &&
            normalizeNum(prevIt?.quantity) === normalizeNum(currentIt?.quantity) &&
            normalizeNum(prevIt?.unit_price) === normalizeNum(currentIt?.unit_price)
          ));
        }

        if (matchIdx < 0) {
          matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
            !usedPrevIndexes.has(prevIdx) &&
            normalizeNum(prevIt?.quantity) === normalizeNum(currentIt?.quantity) &&
            normalizeNum(prevIt?.unit_price) === normalizeNum(currentIt?.unit_price) &&
            isLikelyRename(prevIt?.description, currentIt?.description)
          ));
        }

        if (matchIdx < 0) {
          const currAssoc = getAssocKey(currentIt);
          const currIndex = Number(currentIt?.__sourceIndex);
          if (!currAssoc && Number.isFinite(currIndex)) {
            matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
              !usedPrevIndexes.has(prevIdx) &&
              !getAssocKey(prevIt) &&
              Number(prevIt?.__sourceIndex) === currIndex
            ));
          }
        }

        if (matchIdx < 0) {
          matchIdx = orderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
            !usedPrevIndexes.has(prevIdx) &&
            normalizeText(prevIt?.description) === normalizeText(currentIt?.description)
          ));
        }

        const previousIt = matchIdx >= 0 ? orderedPreviousItems[matchIdx] : null;
        if (matchIdx >= 0) usedPrevIndexes.add(matchIdx);

        const isAdded = !previousIt;
        const isEdited = !!previousIt && (
          normalizeText(previousIt?.description) !== normalizeText(currentIt?.description) ||
          normalizeNum(previousIt?.quantity) !== normalizeNum(currentIt?.quantity) ||
          normalizeNum(previousIt?.unit_price) !== normalizeNum(currentIt?.unit_price)
        );

        return { currentIt, previousIt, isAdded, isEdited };
      });

      const removedItems = orderedPreviousItems.filter((_: any, prevIdx: number) => !usedPrevIndexes.has(prevIdx));

      return (
        <View style={styles.messageRow}>
          <View style={[styles.systemBubbleContainer, styles.systemBubbleContainerAligned]}>
            <View style={styles.quotationCompactBubble}>
              <TouchableOpacity
                onPress={() => setExpandedQuoteCards(prev => ({ ...prev, [quoteMessageKey]: !prev[quoteMessageKey] }))}
                activeOpacity={0.8}
                style={{ width: '100%' }}
              >
                <View style={styles.quotationCompactRow}>
                  <ThemedText style={compactTitleStyle}>{compactTitle}</ThemedText>
                  <ThemedText style={styles.quotationCompactAmount}>₱{(Number(parsed.total_amount) || 0).toFixed(2)}</ThemedText>
                  <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#9CA3AF" />
                </View>

                {isExpanded ? (
                  <>
                    <View style={{ height: 1, backgroundColor: '#2f3338', marginVertical: 8 }} />
                    {matchedRows.map(({ currentIt: it, previousIt: prevIt, isAdded, isEdited }: any, idx: number) => {
                      return (
                        <View key={idx}>
                          {!isAdded && isEdited ? (
                            <View style={styles.quoteGhostRow}>
                              <ThemedText style={styles.quoteGhostLabel}>{prevIt?.description || `Item ${idx + 1}`}</ThemedText>
                              <ThemedText style={styles.quoteGhostValue}>₱{(Number(prevIt?.line_total) || 0).toFixed(2)}</ThemedText>
                            </View>
                          ) : null}

                          {!isAdded && isEdited ? (
                            <View style={styles.quoteGhostArrowRow}>
                              <FontAwesome name="long-arrow-down" size={12} color="#8E8E93" />
                              <ThemedText style={styles.quoteGhostArrowText}>Updated to</ThemedText>
                            </View>
                          ) : null}

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, alignItems: 'center' }}>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}>
                              <ThemedText style={styles.quoteItemLabel}>{it.description || `Item ${idx + 1}`}</ThemedText>
                              {isAdded ? <ThemedText style={styles.quoteChangeAdd}>Added</ThemedText> : null}
                              {!isAdded && isEdited ? <ThemedText style={styles.quoteChangeEdit}>Edited</ThemedText> : null}
                            </View>
                            <ThemedText style={styles.quoteItemValue}>₱{(Number(it.line_total) || 0).toFixed(2)}</ThemedText>
                          </View>
                        </View>
                      );
                    })}

                    {removedItems.map((it: any, idx: number) => (
                      <View key={`removed-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, alignItems: 'center', opacity: 0.75 }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}>
                          <ThemedText style={styles.quoteItemRemovedLabel}>{it.description || `Item ${idx + 1}`}</ThemedText>
                          <ThemedText style={styles.quoteChangeDelete}>Removed</ThemedText>
                        </View>
                        <ThemedText style={styles.quoteItemRemovedValue}>₱{(Number(it.line_total) || 0).toFixed(2)}</ThemedText>
                      </View>
                    ))}

                    <View style={{ height: 1, backgroundColor: '#2f3338', marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={styles.quoteTotalLabel}>Total</ThemedText>
                      <ThemedText style={styles.quoteTotalValue}>₱{(Number(parsed.total_amount) || 0).toFixed(2)}</ThemedText>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <ThemedText style={styles.quoteTotalLabel}>Status</ThemedText>
                      <ThemedText style={statusTextStyle}>{statusText}</ThemedText>
                    </View>
                  </>
                ) : null}
              </TouchableOpacity>

              {isPending && !amIMechanic ? (
                <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'flex-end' }}>
                  <TouchableOpacity
                    style={styles.actionBtnAccept}
                    onPress={() => {
                      setQuotationDecisionAction('accept');
                      setShowQuotationDecisionModal(true);
                    }}
                    disabled={quotationActionLoading !== null}
                  >
                    {quotationActionLoading === 'accept' ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnAcceptText}>Accept</ThemedText>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnReject}
                    onPress={() => {
                        setQuotationDecisionAction('reject');
                        setShowQuotationDecisionModal(true);
                    }}
                    disabled={quotationActionLoading !== null}
                  >
                    {quotationActionLoading === 'reject' ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnRejectText}>Reject</ThemedText>}
                  </TouchableOpacity>
                </View>
              ) : null}

              <ThemedText style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
            </View>
          </View>
        </View>
      );
    }

      if (parsed && parsed.type === 'backjob_accepted') {
        return (
          <View style={styles.messageRow}>
            <View style={[styles.systemBubbleContainer, styles.systemBubbleContainerAligned]}>
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

    const senderId = item?.sender?.id != null ? Number(item.sender.id) : null;
    const isMe = Boolean(item?.is_mine) || (senderId != null && accountId != null && Number(senderId) === Number(accountId));
    const senderName = [item?.sender?.firstname, item?.sender?.lastname].filter(Boolean).join(' ').trim() || item?.sender?.username || 'User';
    const senderInitial = (senderName || 'U').charAt(0).toUpperCase();
    const senderPhoto = item?.sender?.profile_photo || null;
    const senderRole = String(item?.sender?.chat_role || 'participant');
    const senderRoleLabelMap: Record<string, string> = {
      lead_mechanic: 'Lead',
      assistant_mechanic: 'Assistant',
      shop_owner: 'Shop Owner',
      client: 'Client',
      provider_mechanic: 'Mechanic',
      participant: 'Participant',
      admin: 'Admin',
      none: 'Participant',
    };
    const senderRoleLabel = senderRoleLabelMap[senderRole] || 'Participant';
    return (
      <View style={[styles.messageRow, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}> 
        <View style={[styles.senderRow, isMe ? styles.senderRowMine : styles.senderRowOther]}>
          {!isMe ? (
            senderPhoto ? (
              <Image source={{ uri: senderPhoto }} style={styles.messageAvatar} />
            ) : (
              <View style={styles.messageAvatarFallback}>
                <ThemedText style={styles.messageAvatarFallbackText}>{senderInitial}</ThemedText>
              </View>
            )
          ) : null}

          <View style={[styles.messageContentWrap, isMe ? styles.messageContentWrapMine : styles.messageContentWrapOther]}>
            <View style={[styles.senderMetaRow, isMe ? styles.senderMetaRowMine : styles.senderMetaRowOther]}>
              <ThemedText style={[styles.senderName, isMe ? styles.senderNameMine : styles.senderNameOther]}>
                {isMe ? 'You' : senderName}
              </ThemedText>
              <ThemedText style={[styles.senderRoleInline, isMe ? styles.senderRoleInlineMine : styles.senderRoleInlineOther]}>
                {senderRoleLabel}
              </ThemedText>
            </View>
            <View style={[styles.messageBubble, isMe ? styles.messageBubbleMine : styles.messageBubbleOther]}>
              <ThemedText style={isMe ? styles.messageTextMine : styles.messageTextOther}>{item.content}</ThemedText>
            </View>
          </View>

          {isMe ? (
            senderPhoto ? (
              <Image source={{ uri: senderPhoto }} style={styles.messageAvatar} />
            ) : (
              <View style={styles.messageAvatarFallback}>
                <ThemedText style={styles.messageAvatarFallbackText}>{senderInitial}</ThemedText>
              </View>
            )
          ) : null}
        </View>
        <ThemedText style={[styles.messageTimeOutside, isMe ? styles.messageTimeOutsideMine : styles.messageTimeOutsideOther]}>
          {new Date(item.created_at).toLocaleTimeString()}
        </ThemedText>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <FontAwesome name="chevron-left" size={22} color="#FF8C00" />
        </TouchableOpacity>
        <View style={styles.headerIdentityWrap}>
          <View style={styles.headerAvatar}>
            {(() => {
              if (!conversationData || !conversationData.participants) {
                return <ThemedText style={styles.headerAvatarText}>?</ThemedText>;
              }
              const others = conversationData.participants.filter((p: any) => String(p.id) !== String(accountId));
              const pick = others.length ? others[0] : conversationData.participants[0];
              if (pick?.profile_photo) {
                return <Image source={{ uri: pick.profile_photo }} style={styles.headerAvatarImage} />;
              }
              const initial = (pick?.firstname || pick?.username || '?').toString().charAt(0).toUpperCase();
              return <ThemedText style={styles.headerAvatarText}>{initial || '?'}</ThemedText>;
            })()}
          </View>
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
        </View>
        <View style={styles.headerRightActions}>
          {canOpenQuotationEditor ? (
            <TouchableOpacity onPress={openQuotationEditor} style={[styles.headerAction, styles.headerActionPrimary]}>
              <FontAwesome name="pencil" size={14} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={handleHeaderMore} style={styles.headerAction}>
            <FontAwesome name="ellipsis-v" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#FF8C00" />
        </View>
      ) : chatAccessDenied ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <View
            style={{
              backgroundColor: '#151718',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#2A2C2E',
              padding: 20,
              alignItems: 'center',
            }}
          >
            <FontAwesome name="ban" size={28} color="#FF8C00" />
            <ThemedText style={{ color: '#ECEDEE', fontSize: 20, fontWeight: '800', marginTop: 12 }}>
              Chat unavailable
            </ThemedText>
            <ThemedText style={{ color: '#8E8E93', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              This booking is closed to chat unless there is a live backjob in progress.
            </ThemedText>
            <TouchableOpacity
              style={{ marginTop: 18, backgroundColor: '#FF8C00', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
              onPress={() => router.back()}
            >
              <ThemedText style={{ color: '#111214', fontWeight: '700' }}>Go back</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
          <FlatList
            ref={listRef}
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
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
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

          <Modal visible={showOptionsModal} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.optionsModalBox}>
                <View style={styles.optionsModalHeader}>
                  <ThemedText style={styles.optionsModalTitle}>Chat Options</ThemedText>
                  <TouchableOpacity onPress={() => setShowOptionsModal(false)}>
                    <FontAwesome name="times" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsModal(false); console.warn('Report pressed'); }}>
                  <FontAwesome name="flag" size={14} color="#D1D5DB" />
                  <ThemedText style={styles.optionText}>Report</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsModal(false); console.warn('Copy chat pressed'); }}>
                  <FontAwesome name="copy" size={14} color="#D1D5DB" />
                  <ThemedText style={styles.optionText}>Copy chat</ThemedText>
                </TouchableOpacity>

                {hasBackjobRequest ? (
                  <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsModal(false); setShowAcceptModal(true); }}>
                    <FontAwesome name="check-circle" size={14} color="#FFB357" />
                    <ThemedText style={styles.optionText}>Accept Backjob</ThemedText>
                  </TouchableOpacity>
                ) : null}

                {canOpenQuotationEditor ? (
                  <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsModal(false); openQuotationEditor(); }}>
                    <FontAwesome name="file-text-o" size={14} color="#FFB357" />
                    <ThemedText style={styles.optionText}>Add or Edit Quotation</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Modal>

          <Modal visible={showQuotationDecisionModal} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <ThemedText style={styles.modalTitle}>{quotationDecisionAction === 'accept' ? 'Accept Quotation' : 'Reject Quotation'}</ThemedText>
                <ThemedText style={styles.modalText}>
                  {quotationDecisionAction === 'accept'
                    ? 'Are you sure you want to accept this quotation request?'
                    : 'Are you sure you want to reject this quotation request?'}
                </ThemedText>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#111214' }]}
                    onPress={() => {
                      setShowQuotationDecisionModal(false);
                      setQuotationDecisionAction(null);
                    }}
                    disabled={quotationActionLoading !== null}
                  >
                    <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: quotationDecisionAction === 'accept' ? '#FF8C00' : '#B03A48' }]}
                    onPress={async () => {
                      if (!quotationDecisionAction) return;
                      const action = quotationDecisionAction;
                      setShowQuotationDecisionModal(false);
                      setQuotationDecisionAction(null);
                      await executeQuotationDecision(action);
                    }}
                    disabled={quotationActionLoading !== null || !quotationDecisionAction}
                  >
                    <ThemedText style={[styles.modalBtnText, { color: '#fff' }]}>{quotationDecisionAction === 'accept' ? 'Accept' : 'Reject'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {canSendMessages ? (
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
              <TouchableOpacity style={[styles.sendBtn, !text.trim() ? styles.sendBtnDisabled : null]} onPress={handleSend} disabled={sending || !text.trim()}>
                {sending ? <ActivityIndicator color="#fff" /> : <FontAwesome name="send" size={20} color="#fff" />}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewOnlyRow}>
              <FontAwesome name="eye" size={14} color="#F2B15C" />
              <ThemedText style={styles.viewOnlyText}>
                View only ({myChatRole === 'assistant_mechanic' ? 'Assistant Mechanic' : 'Participant'}). You can read updates but cannot send messages for this booking.
              </ThemedText>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 20),
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222426',
    backgroundColor: '#111214'
  },
  headerIdentityWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    gap: 10,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22262B',
    borderWidth: 1,
    borderColor: '#2F353C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
  },
  headerAvatarText: {
    color: '#E5E7EB',
    fontWeight: '700',
    fontSize: 13,
  },
  headerName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerBooking: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  messageRow: { marginBottom: 8, width: '100%' },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
  },
  senderRowOther: {
    justifyContent: 'flex-start',
  },
  senderRowMine: {
    justifyContent: 'flex-end',
  },
  messageContentWrap: {
    maxWidth: '82%',
    flexShrink: 1,
    minWidth: 0,
  },
  messageContentWrapOther: {
    alignItems: 'flex-start',
  },
  messageContentWrapMine: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '600',
  },
  senderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  senderMetaRowOther: {
    justifyContent: 'flex-start',
  },
  senderMetaRowMine: {
    justifyContent: 'flex-end',
  },
  senderNameOther: {
    color: '#9CA3AF',
  },
  senderNameMine: {
    color: '#B8BDC3',
  },
  senderRoleInline: {
    fontSize: 11,
    fontWeight: '700',
  },
  senderRoleInlineOther: {
    color: '#AEB6C2',
  },
  senderRoleInlineMine: {
    color: '#D3D8E0',
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22262B',
    borderWidth: 1,
    borderColor: '#2F353C',
  },
  messageAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22262B',
    borderWidth: 1,
    borderColor: '#2F353C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageAvatarFallbackText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  messageBubble: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageBubbleMine: {
    backgroundColor: '#FF8C00',
    borderBottomRightRadius: 6,
    alignSelf: 'flex-end',
  },
  messageBubbleOther: {
    backgroundColor: '#1B1D20',
    borderWidth: 1,
    borderColor: '#2A2E33',
    borderBottomLeftRadius: 6,
    alignSelf: 'flex-start',
  },
  messageTextMine: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
  },
  messageTextOther: {
    color: '#ECEDEE',
    fontSize: 14,
    lineHeight: 19,
  },
  messageTime: { fontSize: 10, color: '#8E8E93', marginTop: 6 },
  messageTimeOutside: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
  },
  messageTimeOutsideMine: {
    alignSelf: 'flex-end',
    marginRight: 36,
    color: '#B8BDC3',
  },
  messageTimeOutsideOther: {
    alignSelf: 'flex-start',
    marginLeft: 36,
    color: '#7F8790',
  },
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#202428',
    alignItems: 'flex-end',
    backgroundColor: '#111214'
  },
  input: {
    flex: 1,
    backgroundColor: '#171A1E',
    borderWidth: 1,
    borderColor: '#2A2E33',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    color: '#ECEDEE',
    fontSize: 14,
    maxHeight: 110
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendBtnDisabled: {
    backgroundColor: '#3A3D42',
  },
  viewOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#202428',
    backgroundColor: '#111214',
  },
  viewOnlyText: {
    color: '#F2B15C',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  systemBubble: {
    backgroundColor: '#2C2C2E',
    padding: 12,
    borderRadius: 12,
    maxWidth: '82%',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#2F353C',
  },
  quotationCompactBubble: {
    backgroundColor: '#1B1D20',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    maxWidth: '82%',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#2A2E33',
  },
  quotationCompactRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  quotationCompactText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#B8BDC3',
  },
  quotationCompactTextPending: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#FF8C00',
  },
  quotationCompactAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4D8DD',
  },
  quoteItemLabel: {
    flex: 1,
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '500',
  },
  quoteItemValue: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '600',
  },
  quoteGhostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    opacity: 0.65,
  },
  quoteGhostLabel: {
    flex: 1,
    color: '#8E949C',
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginRight: 10,
  },
  quoteGhostValue: {
    color: '#8E949C',
    fontSize: 12,
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  quoteGhostArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 1,
  },
  quoteGhostArrowText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontStyle: 'italic',
  },
  quoteItemRemovedLabel: {
    flex: 1,
    color: '#AAB0B7',
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  quoteItemRemovedValue: {
    color: '#AAB0B7',
    fontSize: 13,
    fontWeight: '600',
  },
  quoteTotalLabel: {
    fontWeight: '700',
    color: '#F3F4F6',
    fontSize: 13,
  },
  quoteTotalValue: {
    fontWeight: '700',
    color: '#F3F4F6',
    fontSize: 13,
  },
  quoteStatusPending: {
    fontWeight: '700',
    color: '#F2B15C',
    fontSize: 13,
  },
  quoteStatusAccepted: {
    fontWeight: '700',
    color: '#34C759',
    fontSize: 13,
  },
  quoteStatusRejected: {
    fontWeight: '700',
    color: '#FF6B6B',
    fontSize: 13,
  },
  quoteChangeAdd: {
    fontSize: 10,
    color: '#1D3A24',
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: '#8CE99A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  quoteChangeEdit: {
    fontSize: 10,
    color: '#5A3D0A',
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: '#FFD49A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  quoteChangeDelete: {
    fontSize: 10,
    color: '#631B21',
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: '#FFB4B0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  systemTitle: { fontSize: 13, fontWeight: '700', color: '#FF8C00', marginBottom: 4 },
  systemText: { fontSize: 13, color: '#ECEDEE', textAlign: 'left' },
  systemImage: { width: 220, height: 140, borderRadius: 10, marginTop: 8 },
  systemBubbleContainer: { flexDirection: 'row', width: '100%' },
  systemBubbleContainerAligned: {
    justifyContent: 'flex-start',
    paddingLeft: 36,
    paddingRight: 8,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1D21',
    borderWidth: 1,
    borderColor: '#2A2E33'
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionPrimary: {
    backgroundColor: '#FF8C00',
    borderColor: '#D97706',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '86%', backgroundColor: '#0F1112', padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#222426' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  modalText: { fontSize: 14, color: '#D1D1D6', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700' },
  optionsModalBox: {
    width: '82%',
    backgroundColor: '#15181C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2E33',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#232830',
    marginBottom: 4,
  },
  optionsModalTitle: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  optionText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnReject: {
    backgroundColor: '#E53935',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  actionBtnAccept: {
    backgroundColor: '#FF8C00',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnRejectText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  actionBtnAcceptText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
