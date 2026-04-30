import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar, Image, Modal, ActionSheetIOS, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';
import { getImageUrl, quotationReceiptDisplayUri } from '@/lib/imageUtils';
import { fetchProfileDetailsCached, getCachedAccountId } from '@/lib/profileCache';
import { shouldMarkAsAdded, runQuotationDiffSelfCheck } from '@/lib/quotationDiff';
import { isLikelyQuotationLineRename } from '@/lib/quotationTextMatch';
import { getQuoteRequestKey, mergeResolvedQuotationMessages } from '@/lib/chatQuotationMerge';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Hide the default Expo Router header so we only show our custom header
export const screenOptions = { headerShown: false } as const;

// PII masking utility function
const maskPII = (text: string): string => {
  if (!text || typeof text !== 'string') return text;
  const emailRegex = /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let masked = text.replace(emailRegex, '****');
  // Philippine phone: matches 09XX XXXX XXXX, +639XX XXXX XXXX, or any variation with spaces/dashes
  const phoneRegex = /(?:\+63|0)[0-9\s\-\.()]{9,14}/g;
  masked = masked.replace(phoneRegex, '****');
  return masked;
};

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
  const accessPollRef = useRef<any>(null);
  const pollBackoffRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const lastFetchedCountRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptedLocks, setAcceptedLocks] = useState<string[]>([]);
  const [quotationActionLoading, setQuotationActionLoading] = useState<'accept' | 'reject' | null>(null);
  const [backjobActionLoading, setBackjobActionLoading] = useState<'accept' | 'decline' | null>(null);
  const [expandedQuoteCards, setExpandedQuoteCards] = useState<Record<string, boolean>>({});
  const [isAssignedMechanicForBooking, setIsAssignedMechanicForBooking] = useState(false);
  const [didInitialScrollToLatest, setDidInitialScrollToLatest] = useState(false);
  const [showQuotationDecisionModal, setShowQuotationDecisionModal] = useState(false);
  const [quotationDecisionAction, setQuotationDecisionAction] = useState<'accept' | 'reject' | null>(null);
  const [shownSatisfiedNotice, setShownSatisfiedNotice] = useState(false);
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottomRef = useRef(true);
  const forceFollowNextUpdateRef = useRef(false);
  const lastMessageSignatureRef = useRef('');
  const [visibleMessageKeys, setVisibleMessageKeys] = useState<Record<string, true>>({});

  const getQuotationMessageKey = (m: any) => `${m?.id || 'noid'}_${m?.created_at || 'notime'}`;
  const getMessageKey = (m: any, fallbackIndex?: number) => {
    if (m && (m.id || m.created_at)) {
      const idPart = m.id ? String(m.id) : 'noid';
      const timePart = m.created_at ? String(new Date(m.created_at).getTime()) : 'notime';
      return `${idPart}_${timePart}`;
    }
    return `idx_${String(fallbackIndex ?? 0)}`;
  };
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 25 });
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    const nextVisible: Record<string, true> = {};
    viewableItems.forEach((entry: any) => {
      const key = entry?.item ? getMessageKey(entry.item, entry.index) : null;
      if (key) nextVisible[key] = true;
    });
    setVisibleMessageKeys(nextVisible);
  });

  const parseStructuredContent = (raw: any): any | null => {
    if (typeof raw !== 'string') return null;
    try {
      const first = JSON.parse(raw);
      if (first && typeof first === 'object') return first;
      if (typeof first === 'string') {
        const nested = first.trim();
        if (nested.startsWith('{')) {
          try {
            const second = JSON.parse(nested);
            return second && typeof second === 'object' ? second : null;
          } catch (e) {
            return null;
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // Fetch profile or stored account id
  const fetchProfile = async (): Promise<number | null> => {
    const cachedId = await getCachedAccountId();
    if (cachedId) {
      setAccountId(cachedId);
      return cachedId;
    }

    const profile = await fetchProfileDetailsCached(false);
    const aid = Number(profile?.id || profile?.account_id || 0) || null;
    if (aid) {
      setAccountId(aid);
      return aid;
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

  useEffect(() => {
    if (loading || !chatAccessDenied || shownSatisfiedNotice) return;
    setShownSatisfiedNotice(true);
    Alert.alert(
      'Backjob satisfied',
      'This backjob is already done, so the booking chat is closed again.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  }, [loading, chatAccessDenied, shownSatisfiedNotice]);

  const handleHeaderMore = () => {
    setShowOptionsModal(true);
  };

  const hasBackjobRequest = useMemo(() => {
    try {
      return messages.some(m => {
        const p = parseStructuredContent(m.content);
        return p && p.type === 'backjob_request';
      });
    } catch (e) { return false; }
  }, [messages]);

  const canModerateBackjobRequest = useMemo(() => {
    if (!canSendMessages) return false;
    if (myChatRole === 'client' || myChatRole === 'assistant_mechanic') return false;
    if (myChatRole === 'shop_owner') return true;
    return Boolean(isAssignedMechanicForBooking || myChatRole === 'lead_mechanic' || myChatRole === 'provider_mechanic');
  }, [canSendMessages, myChatRole, isAssignedMechanicForBooking]);

  const backjobRequestStatus = useMemo(() => {
    let nextStatus: 'pending' | 'accepted' | 'declined' | null = null;
    messages.forEach((m: any) => {
      const p = parseStructuredContent(m.content);
      if (!p) return;
      if (p.type === 'backjob_request') nextStatus = 'pending';
      if (p.type === 'backjob_accepted') nextStatus = 'accepted';
      if (p.type === 'backjob_declined') nextStatus = 'declined';
    });
    return nextStatus;
  }, [messages]);

  const latestBackjobRequestAt = useMemo(() => {
    let latest = 0;
    messages.forEach((m: any) => {
      const p = parseStructuredContent(m.content);
      if (!p || p.type !== 'backjob_request') return;
      const createdMs = Number(new Date(String(m?.created_at || '')).getTime());
      if (Number.isFinite(createdMs) && createdMs > latest) latest = createdMs;
    });
    return latest;
  }, [messages]);

  const canOpenQuotationEditor = useMemo(() => {
    if (!canSendMessages) return false;
    if (myChatRole === 'assistant_mechanic' || myChatRole === 'client') return false;
    if (myChatRole === 'shop_owner') return false;
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
  }, [canSendMessages, myChatRole, isAssignedMechanicForBooking, accountId, messages]);

  const canRequestQuotation = canSendMessages && myChatRole === 'shop_owner';

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
    setBackjobActionLoading('accept');
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}

      const acceptPath = myChatRole === 'shop_owner'
        ? `${API_URL}/bookings/shopowner/bookings/${bookingId}/accept-backjob/`
        : `${API_URL}/bookings/mechanic/bookings/${bookingId}/accept-backjob/`;
      const res = await fetch(acceptPath, {
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
      setBackjobActionLoading(null);
    }
  };

  const handleDeclineBackjobRequest = async () => {
    if (!conversationId || !canModerateBackjobRequest) return;
    setBackjobActionLoading('decline');
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}

      const payload = {
        type: 'backjob_declined',
        message: myChatRole === 'shop_owner'
          ? 'Backjob request declined by shop owner.'
          : 'Backjob request declined by mechanic.',
      };

      const res = await fetch(`${API_URL}/chat/${conversationId}/messages/`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ content: JSON.stringify(payload) }),
      });

      if (!res.ok) {
        throw new Error('Failed to decline backjob request');
      }

      const m = await res.json();
      forceFollowNextUpdateRef.current = true;
      setMessages(prev => [...prev, m]);
      setShowAcceptModal(false);
      Alert.alert('Declined', 'Backjob request was declined.');
    } catch (e) {
      Alert.alert('Error', 'Unable to decline backjob right now.');
    } finally {
      setBackjobActionLoading(null);
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;

    const stopPolling = () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      if (accessPollRef.current) {
        clearInterval(accessPollRef.current);
        accessPollRef.current = null;
      }
    };

    const scheduleNextPoll = (ms: number) => {
      if (!mounted) return;
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = setTimeout(() => {
        fetchMessages();
      }, ms);
    };

    const fetchMessages = async (opts?: { markRead?: boolean; immediate?: boolean }) => {
      if (fetchInFlightRef.current) return;
      if (appStateRef.current !== 'active') {
        scheduleNextPoll(15000);
        return;
      }

      fetchInFlightRef.current = true;
      try {
        const headers: any = { 'Content-Type': 'application/json' };
        try {
          const token = await AsyncStorage.getItem('auth_token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {}
        const shouldMarkRead = Boolean(opts?.markRead);
        const resUrl = shouldMarkRead
          ? `${API_URL}/chat/${conversationId}/messages/?mark_read=1`
          : `${API_URL}/chat/${conversationId}/messages/`;
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
                if (p && p.type === 'quotation_request' && acceptedLocks.includes(getQuoteRequestKey(p)) && p.status !== 'accepted') {
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
                  return pp && pp.type === 'quotation_request' && getQuoteRequestKey(pp) === lockId && pp.status === 'accepted';
                } catch (e) { return false; }
              });
              return !found;
            });
            if (remainingLocks.length !== acceptedLocks.length) setAcceptedLocks(remainingLocks);
          }
        } catch (e) {
          // ignore
        }

        const next = mergeResolvedQuotationMessages(fetched || []);
        const nextLen = Array.isArray(next) ? next.length : 0;
        const prevLen = lastFetchedCountRef.current;
        if (nextLen === prevLen) {
          pollBackoffRef.current = Math.min(3, pollBackoffRef.current + 1);
        } else {
          pollBackoffRef.current = 0;
        }
        lastFetchedCountRef.current = nextLen;
        setMessages(next);
      } catch (e) {
        console.warn(e);
      } finally {
        fetchInFlightRef.current = false;
        if (!mounted) return;
        if (opts?.immediate) return;
        const idleStep = pollBackoffRef.current;
        const nextMs = idleStep <= 0 ? 3500 : idleStep === 1 ? 5000 : idleStep === 2 ? 7000 : 9000;
        scheduleNextPoll(nextMs);
      }
    };

    refreshConversationAccess();
    fetchMessages({ markRead: true });
    accessPollRef.current = setInterval(refreshConversationAccess, 30000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;
      if (!wasActive && nextState === 'active') {
        pollBackoffRef.current = 0;
        refreshConversationAccess();
        if (!accessPollRef.current) {
          accessPollRef.current = setInterval(refreshConversationAccess, 30000);
        }
        fetchMessages({ markRead: true, immediate: true });
        scheduleNextPoll(3500);
      } else if (nextState !== 'active') {
        stopPolling();
      }
    });

    return () => {
      mounted = false;
      appStateSub.remove();
      stopPolling();
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

  useEffect(() => {
    if (!__DEV__) return;
    const failures = runQuotationDiffSelfCheck();
    if (failures.length > 0) {
      console.warn('[quotation-diff-self-check] failed cases:', failures);
    }
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

  const requestQuotationFromChat = async () => {
    if (!conversationId) return;
    setSending(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
      const res = await fetch(`${API_URL}/chat/${conversationId}/messages/`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ content: 'Please provide or update the quotation for this booking.' }),
      });
      if (!res.ok) throw new Error('Failed to request quotation');
      const m = await res.json();
      forceFollowNextUpdateRef.current = true;
      setMessages(prev => [...prev, m]);
      Alert.alert('Requested', 'Quotation request sent to the lead mechanic.');
    } catch (e) {
      Alert.alert('Error', 'Unable to request quotation right now.');
    } finally {
      setSending(false);
    }
  };

  const getPendingQuotationId = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      try {
        const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        if (p && p.type === 'quotation_request' && p.status === 'pending') {
          return getQuoteRequestKey(p);
        }
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
          if (p && p.type === 'quotation_request' && (pendingQuotedId == null || getQuoteRequestKey(p) === pendingQuotedId)) {
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
        if (r.ok) { const d = await r.json(); setMessages(mergeResolvedQuotationMessages(d || [])); }
        try { await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, { method: 'GET', credentials: 'include' }); } catch (e) {}
      } catch (e) {
        console.warn(e);
        Alert.alert('Error', 'Unable to accept quotation.');
        try { const r2 = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } }); if (r2.ok) { const d2 = await r2.json(); setMessages(mergeResolvedQuotationMessages(d2 || [])); } } catch (_) {}
      } finally { setQuotationActionLoading(null); }
      return;
    }

    const optimisticUpdate = (oldMessages: any[]) => oldMessages.map(m => {
      try {
        const p = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        if (p && p.type === 'quotation_request' && (pendingQuotedId == null || getQuoteRequestKey(p) === pendingQuotedId)) {
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
      if (r.ok) { const d = await r.json(); setMessages(mergeResolvedQuotationMessages(d || [])); }
      try {
        await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, { method: 'GET', credentials: 'include' });
      } catch (e) {}
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Unable to reject quotation.');
      try { const r2 = await fetch(`${API_URL}/chat/${conversationId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } }); if (r2.ok) { const d2 = await r2.json(); setMessages(mergeResolvedQuotationMessages(d2 || [])); } } catch (_) {}
    } finally { setQuotationActionLoading(null); }
  };

  const renderItem = ({ item }: { item: any }) => {
    const messageKey = getMessageKey(item);
    const shouldLoadImages = Boolean(visibleMessageKeys[messageKey]);

    // try parse structured content (system messages like backjob_request)
    const parsed = parseStructuredContent(item.content);

    if (parsed && parsed.type === 'backjob_request') {
      return (
        <View style={styles.messageRow}>
          <View style={[styles.systemBubbleContainer, styles.systemBubbleContainerAligned]}>
            <View style={styles.systemBubble}>
              <ThemedText style={styles.systemTitle}>
                {backjobRequestStatus === 'accepted'
                  ? 'Backjob Accepted'
                  : backjobRequestStatus === 'declined'
                    ? 'Backjob Declined'
                    : 'Backjob Request'}
              </ThemedText>
              <ThemedText style={styles.systemText}>{parsed.requested_by_name || 'Client'} asked for a backjob</ThemedText>
              {backjobRequestStatus === 'accepted' ? (
                <ThemedText style={styles.systemText}>The provider accepted this backjob request.</ThemedText>
              ) : null}
              {backjobRequestStatus === 'declined' ? (
                <ThemedText style={styles.systemText}>Mechanic declined this backjob request.</ThemedText>
              ) : null}
              {parsed.reason ? <ThemedText style={styles.systemText}>{parsed.reason}</ThemedText> : null}
              {shouldLoadImages && Array.isArray(parsed.images) && parsed.images.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {parsed.images.map((img: string, idx: number) => (
                    <Image key={idx} source={{ uri: img }} style={styles.systemImage} />
                  ))}
                </View>
              )}
              {canModerateBackjobRequest && backjobRequestStatus !== 'accepted' && backjobRequestStatus !== 'declined' ? (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtnBase, styles.actionBtnAccept]}
                    onPress={() => setShowAcceptModal(true)}
                    disabled={backjobActionLoading !== null}
                  >
                    {backjobActionLoading === 'accept'
                      ? <ActivityIndicator color="#fff" />
                      : <ThemedText style={styles.actionBtnAcceptText}>Accept</ThemedText>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtnBase, styles.actionBtnReject]}
                    onPress={() => {
                      Alert.alert(
                        'Decline backjob?',
                        'This will post a declined update in the chat.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Decline', style: 'destructive', onPress: handleDeclineBackjobRequest },
                        ]
                      );
                    }}
                    disabled={backjobActionLoading !== null}
                  >
                    {backjobActionLoading === 'decline'
                      ? <ActivityIndicator color="#fff" />
                      : <ThemedText style={styles.actionBtnRejectText}>Decline</ThemedText>}
                  </TouchableOpacity>
                </View>
              ) : null}
              <ThemedText style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
            </View>
          </View>
        </View>
      );
    }

    if (parsed && parsed.type === 'quotation_request') {
      const quoteMessageKey = getQuotationMessageKey(item);
      const quoteRequestKey = getQuoteRequestKey(parsed);
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
      const resolvePayloadStatus = (payload: any) => {
        const actionStatus = String(payload?.action || '').toLowerCase();
        if (actionStatus === 'accepted') return 'accepted';
        if (actionStatus === 'rejected') return 'rejected';
        const direct = String(payload?.status || '').toLowerCase();
        if (direct) return direct;
        const payloadItems = Array.isArray(payload?.items) ? payload.items : [];
        const hasPending = payloadItems.some((it: any) => String(it?.status || '').toLowerCase() === 'pending');
        return hasPending ? 'pending' : 'accepted';
      };
      // Prefer explicit quotation status from server. Only infer from items if missing.
      const actionStatus = String(parsed?.action || '').toLowerCase();
      const resolvedStatus = actionStatus === 'accepted'
        ? 'accepted'
        : actionStatus === 'rejected'
          ? 'rejected'
          : (parsed.status
        ? String(parsed.status).toLowerCase()
        : (hasPendingItem ? 'pending' : 'accepted'));
      const isPending = resolvedStatus === 'pending';
      const amIMechanic = accountId && parsed.mechanic_id && Number(accountId) === Number(parsed.mechanic_id);
      const isExpanded = expandedQuoteCards[quoteMessageKey] ?? isPending;
      const compactTitle = isPending ? 'Quotation Request' : 'Quotation Requested';
      const compactTitleStyle = isPending ? styles.quotationCompactTextPending : styles.quotationCompactText;
      const statusText = isPending ? 'Pending' : (resolvedStatus === 'accepted' ? 'Accepted' : 'Rejected');
      const statusTextStyle = isPending
        ? styles.quoteStatusPending
        : (resolvedStatus === 'accepted' ? styles.quoteStatusAccepted : styles.quoteStatusRejected);

      // Hide stale pending card if a newer quotation card exists for the same quotation.
      // Shop owner and lead mechanic can revise the same pending amendment, creating a new amendment id.
      if (isPending) {
        const currentIdxForPending = messages.findIndex((m: any) => getQuotationMessageKey(m) === quoteMessageKey);
        if (currentIdxForPending >= 0) {
          const hasNewerSameQuotation = messages.slice(currentIdxForPending + 1).some((nm: any) => {
            try {
              const np = parseStructuredContent(nm.content) || (typeof nm.content === 'object' ? nm.content : null);
              if (!np || np.type !== 'quotation_request') return false;
              const sameRequest = getQuoteRequestKey(np) === quoteRequestKey;
              const sameQuotation = String(np?.quotation_id ?? '') === String(parsed?.quotation_id ?? '');
              return sameRequest || sameQuotation;
            } catch (e) {
              return false;
            }
          });
          if (hasNewerSameQuotation) return null;
        }
      }

      // Find previous quotation snapshot. Prefer same amendment bundle key, fallback to quotation id.
      const currentIdx = messages.findIndex((m: any) => getQuotationMessageKey(m) === quoteMessageKey);
      let previousItems: any[] = [];
      if (currentIdx > 0) {
        let fallbackItems: any[] = [];
        for (let i = currentIdx - 1; i >= 0; i--) {
          try {
            const pm = messages[i];
            const pp = parseStructuredContent(pm.content) || (typeof pm.content === 'object' ? pm.content : null);
            const sameBundle = pp && pp.type === 'quotation_request' && getQuoteRequestKey(pp) === quoteRequestKey;
            const sameQuotationLegacy = pp && pp.type === 'quotation_request' && String(pp.quotation_id) === String(parsed.quotation_id);
            if (sameBundle || (!parsed?.amendment_id && sameQuotationLegacy)) {
              let candidateItems = Array.isArray(pp.items) ? pp.items : [];
              const prevStatus = resolvePayloadStatus(pp);
              if (prevStatus === 'accepted') {
                candidateItems = candidateItems.filter((it: any) => {
                  const ct = String(it?.change_type || '').toLowerCase();
                  const st = String(it?.status || '').toLowerCase();
                  if (ct === 'removed' || ct.includes('remove')) return false;
                  if (st === 'rejected') return false;
                  return true;
                });
              }

              if (!fallbackItems.length) {
                fallbackItems = candidateItems;
              }

              // For a NEW pending request, skip older pending/rejected snapshots.
              // We only want a stable accepted baseline for add/edit/remove diffing.
              if (resolvedStatus === 'pending') {
                if (prevStatus === 'pending' || prevStatus === 'rejected') {
                  continue;
                }
                previousItems = candidateItems;
                break;
              }

              // For resolved requests, compare against the latest pending request card.
              // This preserves what was actually requested and avoids matching against
              // older rejected/accepted history that can mislabel rows as edited.
              if (resolvedStatus === 'accepted' || resolvedStatus === 'rejected') {
                if (prevStatus !== 'pending') {
                  continue;
                }
                previousItems = candidateItems;
                break;
              }

              previousItems = candidateItems;
              break;
            }

            // Amendment flow baseline:
            // if this card belongs to an amendment, compare against the latest accepted
            // snapshot for the same quotation_id (not item names).
            if (parsed?.amendment_id && sameQuotationLegacy && !sameBundle) {
              const candidateItems = Array.isArray(pp.items) ? pp.items : [];
              const prevStatus = resolvePayloadStatus(pp);
              if (prevStatus === 'accepted') {
                previousItems = candidateItems;
                break;
              }
              if (!fallbackItems.length && candidateItems.length > 0) {
                fallbackItems = candidateItems;
              }
            }
          } catch (e) {}
        }
        if (!previousItems.length && fallbackItems.length) {
          previousItems = fallbackItems;
        }
      }

      const orderedPreviousItems = sortQuotationItems(previousItems);
      const visibleOrderedItemList = orderedItemList;
      const visibleOrderedPreviousItems = orderedPreviousItems;

      const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
      const normalizeNum = (v: any) => Number(v ?? 0);
      const getAssocKey = (it: any) => {
        const serviceId = Number(it?.service);
        const addOnId = Number(it?.service_add_on);
        if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
        if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
        return null;
      };
      const isLikelyRename = (prevDesc: any, currDesc: any) =>
        isLikelyQuotationLineRename(prevDesc, currDesc);
      const bookedServiceCandidates = visibleOrderedPreviousItems.filter((it: any) => (
        String(it?.line_kind || '').toLowerCase() === 'service' ||
        Number(it?.service || 0) > 0
      ));
      const isBookedServiceRemovalRow = (line: any, previousLine?: any | null) => {
        const changeType = String(line?.change_type || '').toLowerCase();
        if (changeType !== 'removed') return false;

        const lineKind = String(line?.line_kind || previousLine?.line_kind || '').toLowerCase();
        const serviceId = Number(line?.service || previousLine?.service || 0);
        if (lineKind === 'service' || serviceId > 0) return true;

        const desc = normalizeText(line?.description);
        if (!desc) return false;
        return bookedServiceCandidates.some((svc: any) => {
          const svcDesc = normalizeText(svc?.description);
          return Boolean(svcDesc && (svcDesc === desc || svcDesc.includes(desc) || desc.includes(svcDesc)));
        });
      };

      let matchedRows: any[] = [];
      let removedItemsFromPrevious: any[] = [];

      if (parsed?.amendment_id) {
        // Strict amendment diff by ID only:
        // - no original id (or unknown id) => added
        // - same original id + changed fields => edited
        // - original id missing in amendment => removed
        const previousById = new Map<string, any>();
        visibleOrderedPreviousItems.forEach((it: any) => {
          if (it?.id != null) previousById.set(String(it.id), it);
        });

        const normalizeLineKind = (lineKind: any, serviceId: any) => {
          const kind = normalizeText(lineKind) || 'item';
          if (kind === 'service' && !(Number(serviceId || 0) > 0)) return 'item';
          return kind === 'service' || kind === 'item' ? kind : 'item';
        };
        const hasChanged = (prevIt: any, curIt: any) => (
          normalizeText(prevIt?.description) !== normalizeText(curIt?.description) ||
          normalizeNum(prevIt?.quantity) !== normalizeNum(curIt?.quantity) ||
          normalizeNum(prevIt?.unit_price) !== normalizeNum(curIt?.unit_price) ||
          normalizeLineKind(prevIt?.line_kind, prevIt?.service) !== normalizeLineKind(curIt?.line_kind, curIt?.service) ||
          normalizeText(prevIt?.source) !== normalizeText(curIt?.source) ||
          normalizeNum(prevIt?.service) !== normalizeNum(curIt?.service) ||
          normalizeNum(prevIt?.service_add_on) !== normalizeNum(curIt?.service_add_on)
        );

        matchedRows = visibleOrderedItemList.map((currentIt: any) => {
          const declaredChangeType = String(currentIt?.change_type || '').toLowerCase();
          const idKey = currentIt?.id != null ? String(currentIt.id) : null;
          const previousIt = idKey ? (previousById.get(idKey) || null) : null;

          if (declaredChangeType === 'removed') {
            return { currentIt, previousIt, isAdded: false, isEdited: false, isRemoved: !isBookedServiceRemovalRow(currentIt, previousIt) };
          }

          if (declaredChangeType === 'added') {
            return { currentIt, previousIt: null, isAdded: true, isEdited: false, isRemoved: false };
          }

          if (declaredChangeType === 'edited' || declaredChangeType === 'updated' || declaredChangeType === 'modify') {
            const storedPrevious = (
              currentIt?.previous_description != null ||
              currentIt?.previous_quantity != null ||
              currentIt?.previous_unit_price != null
            )
              ? {
                  description: currentIt?.previous_description ?? currentIt?.description,
                  quantity: currentIt?.previous_quantity ?? currentIt?.quantity,
                  unit_price: currentIt?.previous_unit_price ?? currentIt?.unit_price,
                  line_kind: currentIt?.line_kind,
                  source: currentIt?.source,
                  service: currentIt?.service,
                  service_add_on: currentIt?.service_add_on,
                }
              : null;
            const compareAgainst = previousIt || storedPrevious;
            const edited = compareAgainst ? hasChanged(compareAgainst, currentIt) : true;
            return { currentIt, previousIt: compareAgainst, isAdded: false, isEdited: edited, isRemoved: false };
          }

          if (!idKey || !previousIt) {
            return { currentIt, previousIt: null, isAdded: true, isEdited: false, isRemoved: false };
          }
          const edited = hasChanged(previousIt, currentIt);
          return { currentIt, previousIt, isAdded: false, isEdited: edited, isRemoved: false };
        });

        removedItemsFromPrevious = [];
      } else {
        // Legacy quotation diff mode.
        const usedPrevIndexes = new Set<number>();
        matchedRows = visibleOrderedItemList.map((currentIt: any) => {
          const declaredChangeType = String(currentIt?.change_type || '').toLowerCase();
          const currentStatus = String(currentIt?.status || '').toLowerCase();
          const explicitRemoved = declaredChangeType === 'removed';

          if (explicitRemoved) {
            return { currentIt, previousIt: null, isAdded: false, isEdited: false, isRemoved: !isBookedServiceRemovalRow(currentIt, null) };
          }

          if (declaredChangeType === 'added') {
            const currentChangeType = declaredChangeType;
            const isAdded = currentStatus === 'pending' || currentStatus === 'rejected' || currentChangeType === 'added';
            return { currentIt, previousIt: null, isAdded, isEdited: false, isRemoved: false };
          }

          let matchIdx = -1;

          if (currentIt?.id != null) {
            matchIdx = visibleOrderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
              !usedPrevIndexes.has(prevIdx) && prevIt?.id != null && String(prevIt.id) === String(currentIt.id)
            ));
          }

          if (matchIdx < 0) {
            const currentAssoc = getAssocKey(currentIt);
            if (currentAssoc) {
              matchIdx = visibleOrderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
                !usedPrevIndexes.has(prevIdx) && getAssocKey(prevIt) === currentAssoc
              ));
            }
          }

          if (matchIdx < 0) {
            matchIdx = visibleOrderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
              !usedPrevIndexes.has(prevIdx) &&
              normalizeText(prevIt?.description) === normalizeText(currentIt?.description) &&
              normalizeNum(prevIt?.quantity) === normalizeNum(currentIt?.quantity) &&
              normalizeNum(prevIt?.unit_price) === normalizeNum(currentIt?.unit_price)
            ));
          }

          if (matchIdx < 0) {
            matchIdx = visibleOrderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
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
              matchIdx = visibleOrderedPreviousItems.findIndex((prevIt: any, prevIdx: number) => (
                !usedPrevIndexes.has(prevIdx) &&
                !getAssocKey(prevIt) &&
                Number(prevIt?.__sourceIndex) === currIndex
              ));
            }
          }

          let previousIt = matchIdx >= 0 ? visibleOrderedPreviousItems[matchIdx] : null;
          if (matchIdx >= 0) usedPrevIndexes.add(matchIdx);

          if (!previousIt && (
            currentIt?.previous_description != null ||
            currentIt?.previous_quantity != null ||
            currentIt?.previous_unit_price != null
          )) {
            const prevQty = Number(currentIt?.previous_quantity ?? currentIt?.quantity ?? 1) || 1;
            const prevUnit = Number(currentIt?.previous_unit_price ?? 0) || 0;
            previousIt = {
              description: currentIt?.previous_description,
              quantity: prevQty,
              unit_price: prevUnit,
              line_total: prevQty * prevUnit,
            };
          }

          const currentChangeType = declaredChangeType;
          const isAdded = shouldMarkAsAdded(
            { ...currentIt, status: currentStatus, change_type: currentChangeType },
            previousIt
          );
          const isEdited = (currentChangeType === 'edited' || currentChangeType === 'update' || currentChangeType === 'modify') || (!!previousIt && (
            normalizeText(previousIt?.description) !== normalizeText(currentIt?.description) ||
            normalizeNum(previousIt?.quantity) !== normalizeNum(currentIt?.quantity) ||
            normalizeNum(previousIt?.unit_price) !== normalizeNum(currentIt?.unit_price)
          ));

          return { currentIt, previousIt, isAdded, isEdited, isRemoved: false };
        });

        removedItemsFromPrevious = visibleOrderedPreviousItems.filter((_: any, prevIdx: number) => !usedPrevIndexes.has(prevIdx));
      }

      const visibleTotalAmount = Number(parsed.total_amount) || 0;
      const messageCreatedMs = Number(new Date(String(item?.created_at || '')).getTime());
      const wasSentAfterBackjobRequest =
        Number.isFinite(messageCreatedMs) &&
        latestBackjobRequestAt > 0 &&
        messageCreatedMs >= latestBackjobRequestAt;
      const isBackjobQuote = Boolean(parsed.is_backjob) || wasSentAfterBackjobRequest;
      const isPendingBackjobQuote = isPending && isBackjobQuote;
      const isCurrentBackjobChatItem = (line: any, row?: any) => {
        if (!isBackjobQuote) return true;
        const payloadBackjobId = Number(parsed?.backjob_id || 0);
        const lineBackjobId = Number(line?.backjob_id || 0);
        if (payloadBackjobId > 0 && lineBackjobId > 0) {
          return payloadBackjobId === lineBackjobId;
        }

        const lineCreatedMs = Number(new Date(String(line?.created_at || '')).getTime());
        if (Number.isFinite(lineCreatedMs) && latestBackjobRequestAt > 0) {
          return lineCreatedMs >= latestBackjobRequestAt;
        }

        const changeType = String(line?.change_type || '').toLowerCase();
        return Boolean(row?.isAdded) || changeType === 'added';
      };
      const isAddedBackjobRow = (row: any) => {
        const changeType = String(row?.currentIt?.change_type || '').toLowerCase();
        return isCurrentBackjobChatItem(row?.currentIt, row) && (
          Boolean(row?.currentIt?.is_backjob_new_line) ||
          row?.isAdded ||
          changeType === 'added'
        );
      };
      const rowsForDisplay = isBackjobQuote
        ? matchedRows.filter((row: any) => {
          if (row?.isRemoved) return false;
          if (!isCurrentBackjobChatItem(row?.currentIt, row)) return false;
          return isPendingBackjobQuote ? isAddedBackjobRow(row) : true;
        })
        : matchedRows;
      const removedRowsFromCurrent = matchedRows.filter((row: any) => (
        Boolean(row?.isRemoved) && !isBookedServiceRemovalRow(row?.currentIt, row?.previousIt)
      ));
      const removedItems = isBackjobQuote
        ? []
        : [
            ...removedRowsFromCurrent.map((row: any) => row.currentIt),
            ...removedItemsFromPrevious.filter((it: any) => !isBookedServiceRemovalRow({ ...it, change_type: 'removed' }, it)),
          ];
      const pendingChargeTotal = Math.max(0, rowsForDisplay.reduce((sum: number, row: any) => {
        if (row?.isRemoved) return sum;
        const currentLine = Number(row?.currentIt?.line_total) || 0;
        const previousLine = Number(row?.previousIt?.line_total) || 0;
        if (row?.isAdded) return sum + currentLine;
        if (isPendingBackjobQuote && isCurrentBackjobChatItem(row?.currentIt, row) && Boolean(row?.currentIt?.is_backjob_new_line)) return sum + currentLine;
        if (row?.isEdited) return sum + (currentLine - previousLine);
        return sum;
      }, 0) - removedItems.reduce((sum: number, it: any) => sum + (Number(it?.line_total) || 0), 0));
      const displayTotalAmount = isPending && isBackjobQuote ? pendingChargeTotal : visibleTotalAmount;
      const shouldHideLegacyEmptyPendingCard = isPending && rowsForDisplay.length === 0 && removedItems.length === 0;
      if (shouldHideLegacyEmptyPendingCard) {
        return null;
      }

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
                  <ThemedText style={styles.quotationCompactAmount}>₱{displayTotalAmount.toFixed(2)}</ThemedText>
                  <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#9CA3AF" />
                </View>

                {isExpanded ? (
                  <>
                    <View style={{ height: 1, backgroundColor: '#2f3338', marginVertical: 8 }} />
                    {isPending && isBackjobQuote ? (
                      <ThemedText style={{ color: '#8E8E93', fontSize: 11, marginBottom: 8 }}>
                        Backjob: only new changes will be charged
                      </ThemedText>
                    ) : null}
                    {rowsForDisplay
                      .filter((row: any) => !row?.isRemoved)
                      .map(({ currentIt: it, previousIt: prevIt, isAdded, isEdited }: any, idx: number) => {
                      const previousQuantity = Number(it?.previous_quantity ?? it?.quantity ?? 1) || 1;
                      const previousUnitPrice = Number(it?.previous_unit_price ?? 0) || 0;
                      const storedPrevious = (
                        it?.previous_description != null ||
                        it?.previous_quantity != null ||
                        it?.previous_unit_price != null
                      )
                        ? {
                            description: it?.previous_description,
                            line_total: previousQuantity * previousUnitPrice,
                          }
                        : null;
                      const previousDisplay = prevIt || storedPrevious;
                      const receiptUri = quotationReceiptDisplayUri(it?.purchase_receipt_image);
                      return (
                        <View key={idx}>
                          {!isAdded && isEdited ? (
                            <View style={styles.quoteGhostRow}>
                              <ThemedText style={styles.quoteGhostLabel}>{previousDisplay?.description || `Item ${idx + 1}`}</ThemedText>
                              <ThemedText style={styles.quoteGhostValue}>₱{(Number(previousDisplay?.line_total) || 0).toFixed(2)}</ThemedText>
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
                          {String(it?.line_kind || '').toLowerCase() !== 'service' && receiptUri ? (
                            <View style={styles.quoteReceiptRow}>
                              <ThemedText style={styles.quoteReceiptLabel}>Receipt</ThemedText>
                              <Image
                                source={{ uri: receiptUri }}
                                style={styles.quoteReceiptThumb}
                                accessibilityLabel="Purchase receipt"
                              />
                            </View>
                          ) : null}
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
                    {isPending && isBackjobQuote ? (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ThemedText style={styles.quoteTotalLabel}>Pending additional charge</ThemedText>
                          <ThemedText style={styles.quoteTotalValue}>₱{displayTotalAmount.toFixed(2)}</ThemedText>
                        </View>
                      </>
                    ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={styles.quoteTotalLabel}>Total</ThemedText>
                      <ThemedText style={styles.quoteTotalValue}>₱{displayTotalAmount.toFixed(2)}</ThemedText>
                    </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <ThemedText style={styles.quoteTotalLabel}>Status</ThemedText>
                      <ThemedText style={statusTextStyle}>{statusText}</ThemedText>
                    </View>
                  </>
                ) : null}
              </TouchableOpacity>

              {isPending && !amIMechanic ? (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtnBase, styles.actionBtnAccept]}
                    onPress={() => {
                      setQuotationDecisionAction('accept');
                      setShowQuotationDecisionModal(true);
                    }}
                    disabled={quotationActionLoading !== null}
                  >
                    {quotationActionLoading === 'accept' ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.actionBtnAcceptText}>Accept</ThemedText>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtnBase, styles.actionBtnReject]}
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
                <ThemedText style={styles.systemText}>{parsed.mechanic_name || 'Provider'} accepted the backjob</ThemedText>
                {parsed.message ? <ThemedText style={styles.systemText}>{parsed.message}</ThemedText> : null}
                <ThemedText style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString()}</ThemedText>
              </View>
            </View>
          </View>
        );
      }

      if (parsed && parsed.type === 'backjob_declined') {
        return (
          <View style={styles.messageRow}>
            <View style={[styles.systemBubbleContainer, styles.systemBubbleContainerAligned]}>
              <View style={styles.systemBubble}>
                <ThemedText style={styles.systemTitle}>Backjob Declined</ThemedText>
                <ThemedText style={styles.systemText}>{parsed.message || 'Backjob request was declined.'}</ThemedText>
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
    const senderPhoto = getImageUrl(item?.sender?.profile_photo) || null;
    const senderRole = String(
      (isMe ? (myChatRole || item?.sender?.chat_role) : item?.sender?.chat_role) || 'participant'
    );
    const senderRoleLabelMap: Record<string, string> = {
      lead_mechanic: 'Lead Mechanic',
      assistant_mechanic: 'Assisting Mechanic',
      shop_owner: 'Shop Owner',
      client: 'Client',
      provider_mechanic: 'Lead Mechanic',
      participant: 'Participant',
      admin: 'Admin',
      none: 'Participant',
    };
    const senderRoleLabel = senderRoleLabelMap[senderRole] || 'Participant';
    return (
      <View style={[styles.messageRow, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}> 
        <View style={[styles.senderRow, isMe ? styles.senderRowMine : styles.senderRowOther]}>
          {!isMe ? (
            (shouldLoadImages && senderPhoto) ? (
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
              <ThemedText style={isMe ? styles.messageTextMine : styles.messageTextOther}>{maskPII(item.content)}</ThemedText>
            </View>
          </View>

          {isMe ? (
            (shouldLoadImages && senderPhoto) ? (
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
                return <Image source={{ uri: getImageUrl(pick.profile_photo) || '' }} style={styles.headerAvatarImage} />;
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
              Backjob satisfied
            </ThemedText>
            <ThemedText style={{ color: '#8E8E93', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              This backjob is already done, so the booking chat is closed again.
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
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            // Use a combined key of id + created_at to avoid duplicates; fallback to index
            keyExtractor={(it, index) => {
              return getMessageKey(it, index);
            }}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 56 }}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChangedRef.current}
            viewabilityConfig={viewabilityConfigRef.current}
          />

          <Modal visible={showAcceptModal} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <ThemedText style={styles.modalTitle}>Accept Backjob</ThemedText>
                <ThemedText style={styles.modalText}>Choose what to do with this backjob request.</ThemedText>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#111214' }]} onPress={() => setShowAcceptModal(false)} disabled={accepting}>
                    <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#B03A48' }]}
                    onPress={handleDeclineBackjobRequest}
                    disabled={accepting || backjobActionLoading !== null}
                  >
                    {backjobActionLoading === 'decline'
                      ? <ActivityIndicator color="#fff" />
                      : <ThemedText style={[styles.modalBtnText, { color: '#fff' }]}>Decline</ThemedText>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF8C00' }]} onPress={handleAcceptConfirm} disabled={accepting}>
                    {accepting ? <ActivityIndicator color="#fff" /> : <ThemedText style={[styles.modalBtnText, { color: '#fff' }]}>Accept</ThemedText>}
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

                {hasBackjobRequest && backjobRequestStatus === 'pending' ? (
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
                {canRequestQuotation ? (
                  <TouchableOpacity style={styles.optionRow} onPress={() => { setShowOptionsModal(false); requestQuotationFromChat(); }}>
                    <FontAwesome name="file-text-o" size={14} color="#FFB357" />
                    <ThemedText style={styles.optionText}>Request Quotation</ThemedText>
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
                View only ({myChatRole === 'assistant_mechanic' ? 'Assisting Mechanic' : 'Participant'}). You can read updates but cannot send messages for this booking.
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
  quoteReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  quoteReceiptLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  quoteReceiptThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#1a1d22',
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
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    marginTop: 10,
    gap: 8,
  },
  actionBtnBase: {
    minWidth: 92,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnReject: {
    backgroundColor: '#E53935',
  },
  actionBtnAccept: {
    backgroundColor: '#FF8C00',
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
