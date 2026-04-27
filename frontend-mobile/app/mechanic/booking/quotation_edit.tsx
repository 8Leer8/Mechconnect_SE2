import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Modal, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from '../../../style/mechanic/quotation_edit';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

/** Same pattern as booking_chat: JWT avoids POST CSRF issues when session cookies are flaky on mobile. */
async function authJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return headers;
}

async function authHeadersMultipart(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return headers;
}

async function responseHasExpiredToken(res: Response): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false;
  try {
    const body = await res.clone().json();
    const detail = String(body?.detail || body?.error || '').toLowerCase();
    return detail.includes('token') && detail.includes('expired');
  } catch {
    try {
      const text = await res.clone().text();
      const detail = text.toLowerCase();
      return detail.includes('token') && detail.includes('expired');
    } catch {
      return false;
    }
  }
}

async function fetchWithAuthRetry(
  url: string,
  options: RequestInit,
  getHeaders: () => Promise<Record<string, string>>,
): Promise<Response> {
  const headers = await getHeaders();
  const first = await fetch(url, { ...options, headers });
  if (!(await responseHasExpiredToken(first))) return first;

  try {
    await AsyncStorage.removeItem('auth_token');
  } catch {
    /* ignore */
  }

  const retryHeaders = await getHeaders();
  delete retryHeaders.Authorization;
  return fetch(url, { ...options, headers: retryHeaders });
}
/** Prefix logs so you can filter Metro: `npx expo start` terminal. */
const LOG = '[quotation_edit]';

const ITEM_SOURCES = [
  { value: 'on_hand', label: 'On-hand (stock)' },
  { value: 'to_be_purchased', label: 'To be purchased' },
  { value: 'mechanic_selling', label: 'Mechanic selling / owned' },
] as const;

type ItemSourceValue = (typeof ITEM_SOURCES)[number]['value'];

type QuotationItem = {
  id?: number;
  client_key?: string;
  created_at?: string;
  updated_at?: string;
  is_backjob_new_line?: boolean;
  backjob_id?: number | null;
  status?: string;
  change_type?: 'added' | 'edited' | 'removed' | null;
  line_kind: 'service' | 'item';
  source?: ItemSourceValue | null;
  description: string;
  quantity: number;
  unit_price: number;
  service?: number | null;
  service_add_on?: number | null;
  purchase_receipt_image?: string | null;
};

type BookedServiceInfo = {
  id: number;
  name: string;
  default_price: number;
};

const getSourceLabel = (v: string | null | undefined) => {
  const row = ITEM_SOURCES.find((s) => s.value === v);
  return row ? row.label : String(v || '');
};

const formatMoney = (amount: number) => {
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
};

const clampLabel = (value: string, max = 24) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

export default function QuotationEdit() {
  const { bookingId, source } = useLocalSearchParams<{ bookingId: string; source?: string }>();
  const router = useRouter();
  const isShopOwnerSource = source === 'shopowner' || source === 'shop_owner';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [quantityText, setQuantityText] = useState<Record<string, string>>({});
  const [unitPriceText, setUnitPriceText] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [editingItems, setEditingItems] = useState<Record<string, boolean>>({});
  const [deleteArmedItems, setDeleteArmedItems] = useState<Record<string, boolean>>({});
  const [removedAcceptedItems, setRemovedAcceptedItems] = useState<Record<string, boolean>>({});
  const [itemSnapshots, setItemSnapshots] = useState<Record<string, QuotationItem>>({});
  const [initialItemMap, setInitialItemMap] = useState<Record<string, QuotationItem>>({});
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [showSaveReviewModal, setShowSaveReviewModal] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [receiptUploadingKey, setReceiptUploadingKey] = useState<string | null>(null);
  const [hasQuotationOnServer, setHasQuotationOnServer] = useState<boolean | null>(null);
  const [bookedServiceIds, setBookedServiceIds] = useState<number[]>([]);
  const [bookedServices, setBookedServices] = useState<BookedServiceInfo[]>([]);
  const [initialSaveSignature, setInitialSaveSignature] = useState<string | null>(null);
  const [isAcceptedBackjob, setIsAcceptedBackjob] = useState(false);
  const [currentBackjob, setCurrentBackjob] = useState<any | null>(null);
  const [isBookingCompleted, setIsBookingCompleted] = useState(false);
  const [bookingContextLoaded, setBookingContextLoaded] = useState(false);
  const isReadOnly = isBookingCompleted;

  const extractBookedServices = (booking: any): BookedServiceInfo[] => {
    const details = booking?.request?.request_details;
    if (!details) return [];
    const rows: BookedServiceInfo[] = [];

    const pushService = (svc: any) => {
      const sid = Number(svc?.id);
      if (!Number.isFinite(sid) || sid <= 0) return;
      rows.push({
        id: sid,
        name: String(svc?.name || 'Service'),
        default_price: Number(svc?.minimum_price || booking?.amount_fee || 0),
      });
    };

    if (Array.isArray(details.services)) {
      details.services.forEach(pushService);
    } else if (details.service) {
      pushService(details.service);
    }

    const uniqueMap = new Map<number, BookedServiceInfo>();
    rows.forEach((row) => {
      if (!uniqueMap.has(row.id)) uniqueMap.set(row.id, row);
    });
    return Array.from(uniqueMap.values());
  };

  useEffect(() => {
    let mounted = true;
    const checkMechanicRole = async () => {
      if (!bookingId) {
        if (mounted) setRoleChecked(true);
        return;
      }

      try {
        const res = await fetchWithAuthRetry(`${API_URL}/chat/booking/${bookingId}/access/`, {
          method: 'GET',
          credentials: 'include',
        }, authJsonHeaders);

        if (res.ok) {
          const data = await res.json();
          if (mounted && String(data?.my_chat_role || '') === 'assistant_mechanic') {
            console.warn(LOG, 'assistant_mechanic is view-only; leaving screen');
            router.back();
            return;
          }
        }
      } catch (e) {
        // Ignore role check errors. Backend still blocks assistant POST saves.
      } finally {
        if (mounted) setRoleChecked(true);
      }
    };

    checkMechanicRole();
    return () => {
      mounted = false;
    };
  }, [bookingId, router]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const getItemKey = (item: QuotationItem, idx: number) => String(item.id ?? item.client_key ?? `new-${idx}`);

  const makeClientKey = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  /** Use draft qty/price fields so Save + signature match what the user sees (even if blur did not run). */
  const mergeDraftIntoItems = (rows: QuotationItem[]) =>
    rows.map((it, idx) => {
      const key = getItemKey(it, idx);
      let quantity = it.quantity;
      let unit_price = it.unit_price;
      if (it.line_kind === 'item') {
        const qs = quantityText[key];
        if (qs != null && qs !== '') {
          const n = parseInt(qs, 10);
          if (Number.isFinite(n)) quantity = Math.max(1, n);
        }
      }
      const ps = unitPriceText[key];
      if (ps != null && ps !== '') {
        const n = parseFloat(ps);
        if (Number.isFinite(n)) unit_price = Math.max(0, n);
      }
      if (quantity === it.quantity && unit_price === it.unit_price) return it;
      return { ...it, quantity, unit_price };
    });

  const buildSavableItems = (rows: QuotationItem[], removedMap: Record<string, boolean>) => {
    return rows
      .filter((it, idx) => {
        const key = getItemKey(it, idx);
        return !removedMap[key];
      })
      .map(({ client_key, created_at, ...it }) => {
        const line_kind = it.line_kind === 'service' ? 'service' : 'item';
        const quantity = line_kind === 'service' ? 1 : Math.max(1, Number(it.quantity || 1));
        const unit_price = Math.max(0, Number(it.unit_price || 0));
        return {
          ...it,
          line_kind,
          quantity,
          unit_price,
          source: line_kind === 'service' ? null : (it.source || 'on_hand'),
        };
      });
  };

  const orderItems = (rawItems: QuotationItem[]) => {
    if (!rawItems.length) return [];
    return rawItems
      .map((it, index) => ({ ...it, _sourceIndex: index }))
      .sort((a: any, b: any) => {
        const aIsService = a.line_kind === 'service';
        const bIsService = b.line_kind === 'service';
        if (aIsService !== bIsService) return aIsService ? -1 : 1;

        const aId = Number(a.id);
        const bId = Number(b.id);
        if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;

        return (a._sourceIndex || 0) - (b._sourceIndex || 0);
      })
      .map(({ _sourceIndex, ...rest }: any) => rest);
  };

  /**
   * Turn GET/POST quotation JSON into rows for the list.
   * When there is no saved quotation yet (API "has_quotation: false" stub), still merge booked
   * services from `extracted` so this screen matches booking_details (which can show the same
   * rows from request_details before any Quotation row exists in the DB).
   */
  const buildMappedItemsFromApiData = (
    data: any,
    acceptedBackjob: boolean,
    extracted: BookedServiceInfo[],
    activeBackjob?: any,
  ): { mappedItems: QuotationItem[]; serverHasQuotation: boolean } => {
    const safe = data ?? {};
    const savedQuotationId = Number(safe.id);
    const rawItems = safe.items;
    const itemsArray = Array.isArray(rawItems) ? rawItems : [];

    const mappedItemsRaw = itemsArray.map((it: any, index: number) => {
      const lineKind =
        it.line_kind === 'service' || it.line_kind === 'item'
          ? it.line_kind
          : it.service
            ? 'service'
            : 'item';
      return {
        id: it.id,
        client_key: `existing-${it.id ?? index}`,
        created_at: it.created_at,
        updated_at: it.updated_at,
        is_backjob_new_line: Boolean(it.is_backjob_new_line),
        backjob_id: it.backjob_id ?? null,
        status: it.status,
        change_type: null,
        description: it.description || '',
        quantity: Number(it.quantity || 1),
        unit_price: Number(it.unit_price || 0),
        service: it.service || null,
        service_add_on: it.service_add_on || null,
        line_kind: lineKind,
        source: lineKind === 'service' ? null : (it.source as ItemSourceValue) || 'on_hand',
        purchase_receipt_image: it.purchase_receipt_image || null,
      };
    });

    const currentBackjobId = Number(activeBackjob?.id || 0);
    const backjobCreatedAtMs = Number(new Date(String(activeBackjob?.created_at || '')).getTime());
    const hasBackjobCreatedAt = Number.isFinite(backjobCreatedAtMs) && backjobCreatedAtMs > 0;
    const isCurrentBackjobItem = (it: QuotationItem) => {
      const itemBackjobId = Number(it.backjob_id || 0);
      if (currentBackjobId > 0 && itemBackjobId > 0) return itemBackjobId === currentBackjobId;
      const itemMs = Number(new Date(String(it.created_at || '')).getTime());
      return Boolean(it.is_backjob_new_line) && hasBackjobCreatedAt && Number.isFinite(itemMs) && itemMs >= backjobCreatedAtMs;
    };
    const isOldPaidBackjobReference = (it: QuotationItem) =>
      acceptedBackjob &&
      String(it.status || '').toLowerCase() === 'accepted' &&
      !isCurrentBackjobItem(it);
    const mappedItemsFiltered = acceptedBackjob
      ? mappedItemsRaw.filter((it: QuotationItem) => !isOldPaidBackjobReference(it))
      : mappedItemsRaw;

    const existingServiceIds = new Set(
      mappedItemsFiltered
        .filter((row: QuotationItem) => row.line_kind === 'service')
        .map((row: QuotationItem) => Number(row.service || 0))
        .filter((sid: number) => Number.isFinite(sid) && sid > 0),
    );

    const missingBookedRows: QuotationItem[] = acceptedBackjob
      ? []
      : extracted
          .filter((svc) => !existingServiceIds.has(svc.id))
          .map((svc) => ({
            client_key: `booked-fallback-${svc.id}`,
            description: svc.name,
            quantity: 1,
            unit_price: Number.isFinite(Number(svc.default_price)) ? Number(svc.default_price) : 0,
            service: svc.id,
            line_kind: 'service',
            status: 'accepted',
            change_type: null,
            source: null,
            purchase_receipt_image: null,
          }));

    const mappedItems = orderItems([...mappedItemsFiltered, ...missingBookedRows]);
    const serverHasQuotation = Number.isFinite(savedQuotationId);
    return { mappedItems, serverHasQuotation };
  };

  const initializeInputText = (nextItems: QuotationItem[]) => {
    const qty: Record<string, string> = {};
    const price: Record<string, string> = {};
    nextItems.forEach((it, idx) => {
      const key = getItemKey(it, idx);
      qty[key] = String(Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 1);
      price[key] = String(Number.isFinite(Number(it.unit_price)) ? Number(it.unit_price) : 0);
    });
    setQuantityText(qty);
    setUnitPriceText(price);
  };

  // Load booking first, then quotation, using the booking response for backjob filtering (not stale React state).
  useEffect(() => {
    let cancelled = false;

    const loadBookingAndQuotation = async () => {
      if (!bookingId) return;

      setLoading(true);
      setBookingContextLoaded(false);
      setIsAcceptedBackjob(false);
      setCurrentBackjob(null);
      setItems([]);
      setInitialSaveSignature(null);
      setHasQuotationOnServer(null);
      setInitialItemMap({});
      setRemovedAcceptedItems({});

      let acceptedBackjob = false;
      let extracted: BookedServiceInfo[] = [];

      const formatLoadFailure = (label: string, res: Response, body: any) => {
        const parts = [label, res.status ? `HTTP ${res.status}` : null, body?.error, body?.detail, body?.details]
          .filter(Boolean)
          .map(String);
        return parts.join(' — ') || `${label} (unknown error)`;
      };

      let bookingPayload: any = null;

      try {
        const bookingDetailUrl = isShopOwnerSource
          ? `${API_URL}/bookings/shopowner/bookings/${bookingId}/`
          : `${API_URL}/bookings/mechanic/bookings/${bookingId}/`;
        const quotationUrl = isShopOwnerSource
          ? `${API_URL}/bookings/shopowner/bookings/${bookingId}/quotation/`
          : `${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/`;

        const bookingRes = await fetchWithAuthRetry(bookingDetailUrl, {
          method: 'GET',
          credentials: 'include',
        }, authJsonHeaders);
        if (bookingRes.ok) {
          const payload = await bookingRes.json();
          const booking = payload.booking || payload;
          bookingPayload = booking;
          if (cancelled) return;
          setIsBookingCompleted(String(booking?.status || '').toLowerCase() === 'completed');
          acceptedBackjob = String(booking?.backjob?.status || '').toLowerCase() === 'accepted';
          setIsAcceptedBackjob(acceptedBackjob);
          setCurrentBackjob(booking?.backjob || null);
          extracted = extractBookedServices(booking);
          setBookedServices(extracted);
          setBookedServiceIds(extracted.map((s) => s.id));
        } else {
          const errBody = await bookingRes.json().catch(() => null);
          const msg = formatLoadFailure('Could not load booking', bookingRes, errBody);
          if (!cancelled) {
            console.error(LOG, 'booking GET failed', msg, errBody);
          }
        }

        const quotationRes = await fetchWithAuthRetry(
          `${quotationUrl}?_=${Date.now()}`,
          {
            method: 'GET',
            credentials: 'include',
          },
          authJsonHeaders,
        );
        if (cancelled) return;

        if (!quotationRes.ok) {
          const errBody = await quotationRes.json().catch(() => null);
          const msg = formatLoadFailure('Could not load quotation', quotationRes, errBody);
          if (!cancelled) {
            console.error(LOG, 'quotation GET failed', msg, errBody);
          }
          const bq = bookingPayload?.quotation;
          if (!cancelled && bq && Array.isArray(bq.items) && bq.items.length > 0) {
            const fromBooking = buildMappedItemsFromApiData(
              { id: bq.id, items: bq.items, status: bq.status },
              acceptedBackjob,
              extracted,
              bookingPayload?.backjob,
            );
            setHasQuotationOnServer(fromBooking.serverHasQuotation);
            setItems(fromBooking.mappedItems);
            const initialMapFb: Record<string, QuotationItem> = {};
            fromBooking.mappedItems.forEach((it: QuotationItem) => {
              if (it.id != null) initialMapFb[String(it.id)] = { ...it };
            });
            setInitialItemMap(initialMapFb);
            initializeInputText(fromBooking.mappedItems);
            setInitialSaveSignature(JSON.stringify(buildSavableItems(fromBooking.mappedItems, {})));
            const nextExpFb: Record<string, boolean> = {};
            fromBooking.mappedItems.forEach((it: QuotationItem, idx: number) => {
              const key = getItemKey(it, idx);
              nextExpFb[key] = String(it.status || '').toLowerCase() !== 'accepted';
            });
            setExpandedItems(nextExpFb);
            if (!cancelled) {
              console.log(LOG, 'loaded from booking payload (quotation GET failed)', {
                bookingId,
                rowCount: fromBooking.mappedItems.length,
              });
            }
          } else if (!cancelled) {
            const fromExtracted = buildMappedItemsFromApiData({}, acceptedBackjob, extracted, bookingPayload?.backjob);
            if (fromExtracted.mappedItems.length > 0) {
              setHasQuotationOnServer(fromExtracted.serverHasQuotation);
              setItems(fromExtracted.mappedItems);
              const initialMapEx: Record<string, QuotationItem> = {};
              fromExtracted.mappedItems.forEach((it: QuotationItem) => {
                if (it.id != null) initialMapEx[String(it.id)] = { ...it };
              });
              setInitialItemMap(initialMapEx);
              initializeInputText(fromExtracted.mappedItems);
              setInitialSaveSignature(JSON.stringify(buildSavableItems(fromExtracted.mappedItems, {})));
              const nextExpEx: Record<string, boolean> = {};
              fromExtracted.mappedItems.forEach((it: QuotationItem, idx: number) => {
                const key = getItemKey(it, idx);
                nextExpEx[key] = String(it.status || '').toLowerCase() !== 'accepted';
              });
              setExpandedItems(nextExpEx);
              console.log(LOG, 'loaded from booked services (quotation GET failed, no booking.quotation)', {
                bookingId,
                rowCount: fromExtracted.mappedItems.length,
              });
            } else {
              setItems([]);
              setHasQuotationOnServer(false);
              setInitialSaveSignature(JSON.stringify(buildSavableItems([], {})));
            }
          }
          return;
        }

        const data = await quotationRes.json();
        if (cancelled) return;
        let { mappedItems, serverHasQuotation } = buildMappedItemsFromApiData(data, acceptedBackjob, extracted, bookingPayload?.backjob);
        const bq = bookingPayload?.quotation;
        if (
          mappedItems.length === 0 &&
          bq &&
          Array.isArray(bq.items) &&
          bq.items.length > 0
        ) {
          const fromBooking = buildMappedItemsFromApiData(
            { id: bq.id ?? data?.id, items: bq.items, status: bq.status ?? data?.status },
            acceptedBackjob,
            extracted,
            bookingPayload?.backjob,
          );
          if (fromBooking.mappedItems.length > 0) {
            mappedItems = fromBooking.mappedItems;
            serverHasQuotation = fromBooking.serverHasQuotation;
            if (!cancelled) {
              console.warn(LOG, 'quotation GET had no rows; using booking.quotation items', {
                bookingId,
                rowCount: mappedItems.length,
              });
            }
          }
        }
        setHasQuotationOnServer(serverHasQuotation);
        setItems(mappedItems);
        const initialMap: Record<string, QuotationItem> = {};
        mappedItems.forEach((it: QuotationItem) => {
          if (it.id != null) initialMap[String(it.id)] = { ...it };
        });
        setInitialItemMap(initialMap);
        initializeInputText(mappedItems);
        setInitialSaveSignature(JSON.stringify(buildSavableItems(mappedItems, {})));
        const nextExpanded: Record<string, boolean> = {};
        mappedItems.forEach((it: QuotationItem, idx: number) => {
          const key = getItemKey(it, idx);
          const isAccepted = String(it.status || '').toLowerCase() === 'accepted';
          nextExpanded[key] = !isAccepted;
        });
        setExpandedItems(nextExpanded);
        if (!cancelled) {
          console.log(LOG, 'loaded', {
            bookingId,
            acceptedBackjob,
            hasQuotation: serverHasQuotation,
            rowCount: mappedItems.length,
            quotationId: data?.id ?? null,
            prefilledBookedOnly: mappedItems.length > 0 && !serverHasQuotation,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message ? String(e.message) : 'Network error while loading quotation.';
          console.error(LOG, 'load exception', msg, e);
          setItems([]);
          setHasQuotationOnServer(false);
          setInitialSaveSignature(JSON.stringify(buildSavableItems([], {})));
        }
      } finally {
        if (!cancelled) {
          setBookingContextLoaded(true);
          setLoading(false);
        }
      }
    };

    loadBookingAndQuotation();
    return () => {
      cancelled = true;
    };
  }, [bookingId, isShopOwnerSource]);

  const updateItem = (index: number, patch: any) => {
    if (isReadOnly) return;
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const addServiceLine = () => {
    if (isReadOnly) return;
    const newItem: QuotationItem = {
      client_key: makeClientKey(),
      line_kind: 'service',
      description: '',
      quantity: 1,
      unit_price: 0,
      service: null,
      service_add_on: null,
      status: 'pending',
      change_type: 'added',
    };
    let newKey = '';
    setItems((prev) => {
      newKey = getItemKey(newItem, prev.length);
      return [...prev, newItem];
    });
    setQuantityText((prev) => ({ ...prev, [newKey]: '1' }));
    setUnitPriceText((prev) => ({ ...prev, [newKey]: '0' }));
  };

  const addItem = () => {
    if (isReadOnly) return;
    const newItem: QuotationItem = {
      client_key: makeClientKey(),
      line_kind: 'item',
      source: 'on_hand',
      description: '',
      quantity: 1,
      unit_price: 0,
      status: 'pending',
      change_type: 'added',
    };
    let newKey = '';
    setItems((prev) => {
      newKey = getItemKey(newItem, prev.length);
      return [...prev, newItem];
    });
    setQuantityText((prev) => ({ ...prev, [newKey]: '1' }));
    setUnitPriceText((prev) => ({ ...prev, [newKey]: '0' }));
  };

  const removeItem = (index: number) => {
    if (isReadOnly) return;
    const key = getItemKey(items[index], index);
    setItems(prev => prev.filter((_, i) => i !== index));
    setQuantityText(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setUnitPriceText(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleSelectItem = (key: string) => {
    if (isReadOnly) return;
    setSelectedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectMode = () => {
    if (isReadOnly) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectMode(prev => {
      const next = !prev;
      if (!next) setSelectedItems({});
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const startItemEdit = (key: string, item: QuotationItem) => {
    if (isReadOnly) return;
    setItemSnapshots(prev => ({ ...prev, [key]: { ...item } }));
    setEditingItems(prev => ({ ...prev, [key]: true }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
  };

  const confirmItemEdit = (key: string, index: number) => {
    if (isReadOnly) return;
    const snapshot = itemSnapshots[key];
    const current = items[index];
    const wasAccepted = String(snapshot?.status || '').toLowerCase() === 'accepted';
    const changed = !!snapshot && !!current && (
      String(snapshot.description || '') !== String(current.description || '') ||
      Number(snapshot.quantity || 0) !== Number(current.quantity || 0) ||
      Number(snapshot.unit_price || 0) !== Number(current.unit_price || 0) ||
      Number(snapshot.service || 0) !== Number(current.service || 0) ||
      Number(snapshot.service_add_on || 0) !== Number(current.service_add_on || 0) ||
      String(snapshot.line_kind || '') !== String(current.line_kind || '') ||
      String(snapshot.source || '') !== String(current.source || '')
    );

    if (wasAccepted && changed && !removedAcceptedItems[key]) {
      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'pending', change_type: 'edited' } : it));
    }

    setEditingItems(prev => ({ ...prev, [key]: false }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
    setItemSnapshots(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const cancelItemEdit = (key: string, index: number) => {
    if (isReadOnly) return;
    const snapshot = itemSnapshots[key];
    if (snapshot) {
      setItems(prev => prev.map((it, i) => (i === index ? { ...snapshot } : it)));
      setQuantityText(prev => ({ ...prev, [key]: String(Number.isFinite(Number(snapshot.quantity)) ? Number(snapshot.quantity) : 1) }));
      setUnitPriceText(prev => ({ ...prev, [key]: String(Number.isFinite(Number(snapshot.unit_price)) ? Number(snapshot.unit_price) : 0) }));
    }
    setRemovedAcceptedItems(prev => ({ ...prev, [key]: false }));
    setEditingItems(prev => ({ ...prev, [key]: false }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
    setItemSnapshots(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const armDelete = (key: string) => {
    if (isReadOnly) return;
    setEditingItems(prev => ({ ...prev, [key]: false }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: true }));
  };

  const cancelDelete = (key: string) => {
    if (isReadOnly) return;
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
  };

  const confirmDelete = (key: string, index: number) => {
    if (isReadOnly) return;
    const current = items[index];
    const isAccepted = String(current?.status || '').toLowerCase() === 'accepted';
    if (isAccepted) {
      setRemovedAcceptedItems(prev => ({ ...prev, [key]: true }));
      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'pending', change_type: 'removed' } : it));
      setEditingItems(prev => ({ ...prev, [key]: false }));
      setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
      return;
    }

    removeItem(index);
    setEditingItems(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeleteArmedItems(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setItemSnapshots(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSelectedItems(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const selectedCount = useMemo(() => Object.values(selectedItems).filter(Boolean).length, [selectedItems]);

  const clearAllSelected = () => {
    if (isReadOnly) return;
    setSelectedItems({});
  };

  const bulkDeleteSelected = () => {
    if (isReadOnly) return;
    if (!selectedCount) return;
    setItems(prevItems => {
      const nextRemovedAccepted: Record<string, boolean> = { ...removedAcceptedItems };
      const nextItems = prevItems
        .map((it, idx) => {
          const key = getItemKey(it, idx);
          if (!selectedItems[key]) return it;
          const isAccepted = String(it?.status || '').toLowerCase() === 'accepted';
          if (isAccepted) {
            nextRemovedAccepted[key] = true;
            return { ...it, status: 'pending', change_type: 'removed' as const };
          }
          return null;
        })
        .filter(Boolean) as QuotationItem[];

      setRemovedAcceptedItems(nextRemovedAccepted);
      initializeInputText(nextItems);
      return nextItems;
    });

    setSelectedItems({});
  };

  const changeBreakdown = useMemo(() => {
    const added: Array<{ current: QuotationItem }> = [];
    const edited: Array<{ current: QuotationItem; previous: QuotationItem | null }> = [];
    const removed: Array<{ current: QuotationItem; previous: QuotationItem | null }> = [];

    items.forEach((it, idx) => {
      const key = getItemKey(it, idx);
      const change = String(it.change_type || '').toLowerCase();
      const status = String(it.status || '').toLowerCase();
      const previous = it.id != null ? (initialItemMap[String(it.id)] || null) : null;
      const sid = Number(it.service || 0);
      const isBookedBaseService = it.line_kind === 'service' && Number.isFinite(sid) && bookedServiceIds.includes(sid);
      const changedFromInitial = !!previous && (
        String(previous.description || '') !== String(it.description || '') ||
        Number(previous.quantity || 0) !== Number(it.quantity || 0) ||
        Number(previous.unit_price || 0) !== Number(it.unit_price || 0) ||
        String(previous.line_kind || '') !== String(it.line_kind || '') ||
        String(previous.source || '') !== String(it.source || '')
      );

      if (removedAcceptedItems[key] || change === 'removed') {
        removed.push({ current: it, previous });
      } else if (change === 'edited' || changedFromInitial) {
        edited.push({ current: it, previous });
      } else if (change === 'added' || (!it.id && status === 'pending' && !isBookedBaseService)) {
        added.push({ current: it });
      }
    });

    return { added, edited, removed };
  }, [items, removedAcceptedItems, initialItemMap, bookedServiceIds]);

  const subtotal = useMemo(() => {
    const merged = mergeDraftIntoItems(items);
    return merged.reduce((sum, it, idx) => {
      const key = getItemKey(it, idx);
      if (removedAcceptedItems[key]) return sum;
      return sum + Number(it.quantity || 0) * Number(it.unit_price || 0);
    }, 0);
  }, [items, removedAcceptedItems, quantityText, unitPriceText]);
  const totalAmount = useMemo(() => subtotal, [subtotal]);

  const currentSaveSignature = useMemo(
    () => JSON.stringify(buildSavableItems(mergeDraftIntoItems(items), removedAcceptedItems)),
    [items, removedAcceptedItems, quantityText, unitPriceText]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (initialSaveSignature == null) return false;
    return currentSaveSignature !== initialSaveSignature;
  }, [currentSaveSignature, initialSaveSignature]);

  const handleSave = async () => {
    if (isReadOnly) {
      console.warn(LOG, 'save blocked: booking completed (read-only)');
      return;
    }
    if (!hasUnsavedChanges) return;
    setSaveError(null);
    setShowSaveReviewModal(true);
  };

  const confirmSaveQuotation = async () => {
    if (isReadOnly) {
      console.warn(LOG, 'confirm save blocked: read-only');
      setShowSaveReviewModal(false);
      return;
    }
    if (!bookingId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rowsToSave = mergeDraftIntoItems(items);
      const payload = {
        items: buildSavableItems(rowsToSave, removedAcceptedItems),
      };
      const url = isShopOwnerSource
        ? `${API_URL}/bookings/shopowner/bookings/${bookingId}/quotation/`
        : `${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/`;
      const res = await fetchWithAuthRetry(url, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      }, authJsonHeaders);
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        console.error(LOG, 'quotation POST rejected', url, res.status, body);
        const parts = [body?.error, body?.details, body?.detail].filter(Boolean).map(String);
        throw new Error(parts.length ? parts.join(' — ') : 'Failed to save quotation');
      }
      const savedId = Number(body?.id);
      if (body == null || !Number.isFinite(savedId)) {
        console.error(LOG, 'quotation POST bad response (expected JSON with numeric id)', url, res.status, body);
        throw new Error(
          body?.detail ||
            body?.error ||
            'Server did not return a saved quotation. Check API URL and that this request hit your Django server.',
        );
      }
      console.log(LOG, 'quotation POST ok', { bookingId, quotationId: savedId, itemCount: payload.items.length });
      const fromServer = buildMappedItemsFromApiData(body, isAcceptedBackjob, bookedServices, currentBackjob);
      setHasQuotationOnServer(fromServer.serverHasQuotation);
      setItems(fromServer.mappedItems);
      const postSaveMap: Record<string, QuotationItem> = {};
      fromServer.mappedItems.forEach((it: QuotationItem) => {
        if (it.id != null) postSaveMap[String(it.id)] = { ...it };
      });
      setInitialItemMap(postSaveMap);
      initializeInputText(fromServer.mappedItems);
      setInitialSaveSignature(JSON.stringify(buildSavableItems(fromServer.mappedItems, {})));
      setRemovedAcceptedItems({});
      const postExpanded: Record<string, boolean> = {};
      fromServer.mappedItems.forEach((it: QuotationItem, idx: number) => {
        const k = getItemKey(it, idx);
        const acc = String(it.status || '').toLowerCase() === 'accepted';
        postExpanded[k] = !acc;
      });
      setExpandedItems(postExpanded);
      setShowSaveReviewModal(false);
      try {
        // Ensure chat conversation is created and messages are fetched so chat UI sees the new quotation
        const convRes = await fetchWithAuthRetry(`${API_URL}/chat/booking/${bookingId}/`, {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({}),
        }, authJsonHeaders);
        if (convRes.ok) {
          const convData = await convRes.json().catch(() => null);
          const convId = convData?.id;
          if (convId) {
            await fetchWithAuthRetry(`${API_URL}/chat/${convId}/messages/?mark_read=1`, {
              method: 'GET',
              credentials: 'include',
            }, authJsonHeaders);
          }
        }
      } catch (e) {
        // best-effort
      }
      router.back();
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Save failed';
      setSaveError(msg);
      console.error(LOG, 'quotation save error', msg, e);
    } finally {
      setSaving(false);
    }
  };

  const uploadItemReceipt = async (item: QuotationItem, key: string) => {
    if (isReadOnly) {
      console.warn(LOG, 'receipt upload blocked: read-only');
      return;
    }
    if (!bookingId || !item.id) {
      console.warn(LOG, 'receipt upload blocked: save item first (no id)');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        console.warn(LOG, 'receipt upload blocked: gallery permission denied');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
      const fileName = uri.split('/').pop() || `receipt-${item.id}.jpg`;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

      const formData = new FormData();
      formData.append('receipt_image', { uri, name: fileName, type: mime } as any);
      formData.append('actual_unit_price', String(Math.max(0, Number(item.unit_price || 0))));

      setReceiptUploadingKey(key);
      const res = await fetchWithAuthRetry(`${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/items/${item.id}/receipt/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      }, authHeadersMultipart);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to upload receipt');

      console.log(LOG, 'receipt upload ok', payload?.message || 'Receipt uploaded');
      router.replace({
        pathname: '/mechanic/booking/quotation_edit',
        params: { bookingId: String(bookingId), ...(isShopOwnerSource ? { source: 'shopowner' } : {}) },
      });
    } catch (e: any) {
      console.error(LOG, 'receipt upload failed', e?.message || e, e);
    } finally {
      setReceiptUploadingKey(null);
    }
  };

  if (loading || !roleChecked) {
    return (
      <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
          <Text style={styles.headerTitle}>{isReadOnly ? 'View Quotation' : 'Edit Quotation'}</Text>
        <View style={{ width: 40 }} />
      </View>
        <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isReadOnly ? 'View Quotation' : 'Edit Quotation'}</Text>
        {!isReadOnly ? (
          <TouchableOpacity style={styles.selectModeButton} onPress={toggleSelectMode}>
            <Text style={styles.selectModeButtonText}>{selectMode ? 'Done' : 'Select'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Service & item quotations</Text>
          <Text style={{ color: '#6FE29D', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
            Booked service quote is shown below.
          </Text>
          <Text style={{ color: '#8E8E93', fontSize: 12, marginTop: 4 }}>
            {isReadOnly
              ? 'Booking is completed. Pricing is frozen and shown as reference only.'
              : 'You can review and edit booked service, plus add new service or item lines.'}
          </Text>
        </View>

        {items.map((it, idx) => (
          (() => {
            const key = getItemKey(it, idx);
            const isAccepted = String(it.status || '').toLowerCase() === 'accepted';
            const isEditing = !!editingItems[key];
            const isDeleteArmed = !!deleteArmedItems[key];
            const isRemovedGhost = !!removedAcceptedItems[key];
            const usesEditFlow = isAccepted || isRemovedGhost;
            const isEditable = !isReadOnly && (!usesEditFlow || isEditing);
            const isExpanded = expandedItems[key] ?? !isAccepted;
            const isServiceLine = it.line_kind === 'service';
            const sid = Number(it.service || 0);
            const isBookedServiceLine = isServiceLine && Number.isFinite(sid) && bookedServiceIds.includes(sid);
            const isPending = String(it.status || '').toLowerCase() === 'pending';
            const canQuickRemove = !it.id && isPending && !isRemovedGhost;
            const titleText = clampLabel(it.description || `Quotation #${idx + 1}`, 24);
            return (
              <View key={key} style={styles.itemSelectableRow}>
                <View style={[styles.itemCard, styles.itemCardFlex, isAccepted ? styles.acceptedItemCard : null, isEditing ? styles.editingItemCard : null, isRemovedGhost ? styles.removedGhostItemCard : null]}>
                  {canQuickRemove && !isReadOnly ? (
                    <TouchableOpacity
                      onPress={() => removeItem(idx)}
                      style={styles.quickRemoveOverlayButton}
                      activeOpacity={0.85}
                    >
                      <FontAwesome name="times" size={10} color="#FFB4B0" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.itemAccordionHeader, canQuickRemove ? styles.itemAccordionHeaderWithQuickRemove : null]}
                    onPress={() => toggleExpand(key)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.accordionIconWrap}>
                      <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#C9CDD2" />
                    </View>
                    <View style={styles.itemAccordionLeftBlock}>
                      <View style={styles.itemAccordionTitleRow}>
                        <Text style={styles.itemAccordionTitle} numberOfLines={1}>{titleText}</Text>
                      </View>
                      <View style={styles.itemAccordionBadgeRow}>
                        {isBookedServiceLine ? (
                          <View style={[styles.acceptedBadge, { backgroundColor: 'rgba(111,226,157,0.18)', borderColor: 'rgba(111,226,157,0.4)' }]}>
                            <Text style={styles.acceptedBadgeText}>Booked Service</Text>
                          </View>
                        ) : null}
                        {isRemovedGhost ? (
                          <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                        ) : isAccepted ? (
                          <View style={styles.acceptedBadge}><Text style={styles.acceptedBadgeText}>Accepted</Text></View>
                        ) : (
                          <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                        )}
                      </View>
                      <Text style={styles.itemAccordionMeta}>
                        {isServiceLine
                          ? `Service${isExpanded ? '' : ` • PHP ${formatMoney(Number(it.unit_price || 0))}`}`
                          : `${isExpanded ? `Qty ${it.quantity || 1}` : `Qty ${it.quantity || 1} × PHP ${formatMoney(Number(it.unit_price || 0))}`} • ${getSourceLabel(it.source)}`}
                      </Text>
                    </View>
                    <View style={styles.itemAccordionRight}>
                      {it.change_type === 'edited' ? (
                        <View style={styles.changeTypeBadge}><Text style={styles.changeTypeBadgeText}>Edited</Text></View>
                      ) : null}
                      {it.change_type === 'removed' || isRemovedGhost ? (
                        <View style={styles.changeTypeBadgeDanger}><Text style={styles.changeTypeBadgeDangerText}>Removed</Text></View>
                      ) : null}
                      {!isExpanded ? (
                        <Text style={styles.itemAccordionTotal}>PHP {formatMoney(Number(it.quantity || 0) * Number(it.unit_price || 0))}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.itemAccordionBody}>
                    <View style={styles.itemCardTopRow}>
                      <Text style={styles.itemLabel}>{isServiceLine ? 'Service line' : 'Item line'}</Text>
                      <View style={styles.itemActionRow}>
                        {isReadOnly ? (
                          <View style={styles.acceptedBadge}><Text style={styles.acceptedBadgeText}>Read-Only</Text></View>
                        ) : (
                          <>
                            {isEditing ? (
                              <View style={styles.editingPill}><Text style={styles.editingPillText}>Editing</Text></View>
                            ) : null}

                            {!isEditing ? (
                              <TouchableOpacity onPress={() => startItemEdit(key, it)} style={styles.iconActionButton}>
                                <FontAwesome name="pencil" size={12} color="#FFB357" />
                              </TouchableOpacity>
                            ) : (
                              <>
                                <TouchableOpacity onPress={() => confirmItemEdit(key, idx)} style={styles.iconActionButton}>
                                  <FontAwesome name="check" size={13} color="#6FE29D" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => cancelItemEdit(key, idx)} style={styles.iconActionButton}>
                                  <FontAwesome name="times" size={13} color="#C9CDD2" />
                                </TouchableOpacity>
                              </>
                            )}

                            {!isDeleteArmed ? (
                              <TouchableOpacity onPress={() => armDelete(key)} style={styles.iconActionButtonDanger}>
                                <FontAwesome name="trash" size={13} color="#FF8A8A" />
                              </TouchableOpacity>
                            ) : (
                              <>
                                <TouchableOpacity onPress={() => confirmDelete(key, idx)} style={styles.iconActionButtonDanger}>
                                  <FontAwesome name="trash" size={13} color="#FF8A8A" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => cancelDelete(key)} style={styles.iconActionButtonDanger}>
                                  <FontAwesome name="times" size={13} color="#D9DDE2" />
                                </TouchableOpacity>
                              </>
                            )}
                          </>
                        )}
                      </View>
                    </View>

                    <View style={[styles.lineKindBadge, isServiceLine ? styles.lineKindBadgeService : null]}>
                      <Text style={styles.lineKindBadgeText}>{isServiceLine ? 'Service' : 'Item / part'}</Text>
                    </View>

                    {isReadOnly ? (
                      <Text style={styles.itemNameInput}>{it.description || '-'}</Text>
                    ) : (
                      <TextInput
                        placeholder={isServiceLine ? 'Service name' : 'Item name'}
                        placeholderTextColor="#8E8E93"
                        value={it.description}
                        editable={isEditable && !isRemovedGhost}
                        onChangeText={(t) => updateItem(idx, { description: t, change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type })}
                        style={[styles.itemNameInput, !isEditable ? styles.readonlyInput : null]}
                      />
                    )}

                    {isServiceLine ? (
                      <View style={styles.itemFieldsRow}>
                        <View style={[styles.fieldCol, { flex: 1 }]}>
                          <Text style={styles.itemLabel}>Price</Text>
                          {isReadOnly ? (
                            <Text style={styles.numericInput}>PHP {formatMoney(Number(it.unit_price || 0))}</Text>
                          ) : (
                            <TextInput
                              placeholder="0"
                              placeholderTextColor="#8E8E93"
                              value={unitPriceText[key] ?? String(it.unit_price)}
                              editable={isEditable}
                              keyboardType="numeric"
                              onChangeText={(t) => {
                                if (!/^(\d+)?(\.\d{0,2})?$/.test(t)) return;
                                setUnitPriceText(prev => ({ ...prev, [key]: t }));
                                if (t === '') return;
                                const parsed = Number(t);
                                if (Number.isFinite(parsed)) {
                                  updateItem(idx, {
                                    unit_price: Math.max(0, parsed),
                                    quantity: 1,
                                    change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type,
                                  });
                                }
                              }}
                              onBlur={() => {
                                const raw = unitPriceText[key];
                                const parsed = Number(raw);
                                const finalValue = Number.isFinite(parsed) && raw !== '' ? Math.max(0, parsed) : 0;
                                updateItem(idx, { unit_price: finalValue, quantity: 1 });
                                setUnitPriceText(prev => ({ ...prev, [key]: String(finalValue) }));
                                setQuantityText(prev => ({ ...prev, [key]: '1' }));
                              }}
                              style={[styles.numericInput, !isEditable || isRemovedGhost ? styles.readonlyInput : null]}
                            />
                          )}
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.itemFieldsRow}>
                          <View style={styles.fieldCol}>
                            <Text style={styles.itemLabel}>Qty</Text>
                            {isReadOnly ? (
                              <Text style={styles.numericInput}>{Number(it.quantity || 1)}</Text>
                            ) : (
                              <TextInput
                                placeholder="1"
                                placeholderTextColor="#8E8E93"
                                value={quantityText[key] ?? String(it.quantity)}
                                editable={isEditable}
                                keyboardType="numeric"
                                onChangeText={(t) => {
                                  if (!/^\d*$/.test(t)) return;
                                  setQuantityText(prev => ({ ...prev, [key]: t }));
                                  if (t === '') return;
                                  const parsed = Number(t);
                                  if (Number.isFinite(parsed)) updateItem(idx, { quantity: Math.max(1, parsed), change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type });
                                }}
                                onBlur={() => {
                                  const raw = quantityText[key];
                                  const parsed = Number(raw);
                                  const finalValue = Number.isFinite(parsed) && raw !== '' ? Math.max(1, parsed) : 1;
                                  updateItem(idx, { quantity: finalValue });
                                  setQuantityText(prev => ({ ...prev, [key]: String(finalValue) }));
                                }}
                                style={[styles.numericInput, !isEditable || isRemovedGhost ? styles.readonlyInput : null]}
                              />
                            )}
                          </View>
                          <View style={styles.fieldCol}>
                            <Text style={styles.itemLabel}>Unit Price</Text>
                            {isReadOnly ? (
                              <Text style={styles.numericInput}>PHP {formatMoney(Number(it.unit_price || 0))}</Text>
                            ) : (
                              <TextInput
                                placeholder="0"
                                placeholderTextColor="#8E8E93"
                                value={unitPriceText[key] ?? String(it.unit_price)}
                                editable={isEditable}
                                keyboardType="numeric"
                                onChangeText={(t) => {
                                  if (!/^(\d+)?(\.\d{0,2})?$/.test(t)) return;
                                  setUnitPriceText(prev => ({ ...prev, [key]: t }));
                                  if (t === '') return;
                                  const parsed = Number(t);
                                  if (Number.isFinite(parsed)) updateItem(idx, { unit_price: Math.max(0, parsed), change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type });
                                }}
                                onBlur={() => {
                                  const raw = unitPriceText[key];
                                  const parsed = Number(raw);
                                  const finalValue = Number.isFinite(parsed) && raw !== '' ? Math.max(0, parsed) : 0;
                                  updateItem(idx, { unit_price: finalValue });
                                  setUnitPriceText(prev => ({ ...prev, [key]: String(finalValue) }));
                                }}
                                style={[styles.numericInput, !isEditable || isRemovedGhost ? styles.readonlyInput : null]}
                              />
                            )}
                          </View>
                        </View>

                        <View style={styles.sourceChipsWrap}>
                          <Text style={styles.sourceChipsLabel}>Source</Text>
                          {isReadOnly ? (
                            <Text style={styles.numericInput}>{getSourceLabel(it.source)}</Text>
                          ) : (
                            <View style={styles.sourceChipsRow}>
                              {ITEM_SOURCES.map((opt) => (
                                <TouchableOpacity
                                  key={opt.value}
                                  onPress={() => {
                                    if (!isEditable || isRemovedGhost) return;
                                    updateItem(idx, {
                                      source: opt.value,
                                      change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type,
                                    });
                                  }}
                                  style={[styles.sourceChip, it.source === opt.value ? styles.sourceChipActive : null]}
                                  disabled={!isEditable || isRemovedGhost}
                                >
                                  <Text style={[styles.sourceChipText, it.source === opt.value ? styles.sourceChipTextActive : null]} numberOfLines={2}>
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>

                        {it.source === 'to_be_purchased' && !isReadOnly ? (
                          <View style={styles.receiptRowWrap}>
                            <TouchableOpacity
                              style={[styles.receiptButton, (!it.id || receiptUploadingKey === key) ? styles.receiptButtonDisabled : null]}
                              onPress={() => uploadItemReceipt(it, key)}
                              disabled={!it.id || receiptUploadingKey === key}
                            >
                              {receiptUploadingKey === key ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <>
                                  <FontAwesome name="upload" size={12} color="#fff" />
                                  <Text style={styles.receiptButtonText}>Upload receipt & request price update</Text>
                                </>
                              )}
                            </TouchableOpacity>
                            {!it.id ? (
                              <Text style={styles.receiptHintText}>Save quotation first before uploading receipt.</Text>
                            ) : null}
                            {it.purchase_receipt_image ? (
                              <Text style={styles.receiptHintText}>Receipt uploaded.</Text>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    )}

                    <View style={styles.itemTotalRow}>
                      <Text style={styles.itemTotalLabel}>Line Total</Text>
                      <Text style={styles.itemTotalValue}>PHP {formatMoney(Number(it.quantity || 0) * Number(it.unit_price || 0))}</Text>
                    </View>
                    </View>
                  )}
                </View>

                {selectMode && !isReadOnly ? (
                  <TouchableOpacity
                    onPress={() => toggleSelectItem(key)}
                    style={[styles.sideSelectButton, selectedItems[key] ? styles.sideSelectButtonActive : null]}
                    activeOpacity={0.85}
                  >
                    <FontAwesome name={selectedItems[key] ? 'check-square-o' : 'square-o'} size={15} color={selectedItems[key] ? '#6FE29D' : '#C9CDD2'} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })()
        ))}

        {!isReadOnly ? (
          <View style={styles.addLineButtonsRow}>
            <TouchableOpacity onPress={addServiceLine} style={styles.addServiceButtonSmall}>
              <FontAwesome name="plus" size={12} color="#9ECFB0" />
              <Text style={styles.addServiceButtonSmallText}>Add service line</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={addItem} style={styles.addItemButtonSmall}>
              <FontAwesome name="plus" size={12} color="#D6D6D6" />
              <Text style={styles.addItemButtonSmallText}>Add item / part</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>PHP {formatMoney(subtotal)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>PHP {formatMoney(totalAmount)}</Text>
          </View>
        </View>

        {!isReadOnly ? (
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveButton, (!hasUnsavedChanges || saving) ? styles.saveButtonDisabled : null]}
            disabled={saving || !hasUnsavedChanges}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Quotation</Text>}
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {selectMode && selectedCount > 0 && !isReadOnly ? (
        <View style={styles.stickySelectionBar}>
          <TouchableOpacity onPress={clearAllSelected} style={styles.stickySecondaryButton}>
            <FontAwesome name="times" size={12} color="#D0D5DB" />
            <Text style={styles.stickySecondaryButtonText}>Deselect All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={bulkDeleteSelected} style={styles.stickyDangerButton}>
            <FontAwesome name="trash" size={12} color="#FFB4B0" />
            <Text style={styles.stickyDangerButtonText}>Delete Selected ({selectedCount})</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={showSaveReviewModal && !isReadOnly} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Quotation Changes</Text>
            <Text style={styles.modalText}>Review the updates before sending this quotation request.</Text>
            {saveError ? (
              <Text style={{ color: '#FF8A8A', fontSize: 13, marginBottom: 10 }}>{saveError}</Text>
            ) : null}

            <View style={styles.modalBreakdownRow}>
              <Text style={styles.modalBreakdownLabel}>Added</Text>
              <Text style={styles.modalBreakdownValue}>{changeBreakdown.added.length}</Text>
            </View>
            <View style={styles.modalBreakdownRow}>
              <Text style={styles.modalBreakdownLabel}>Edited</Text>
              <Text style={styles.modalBreakdownValue}>{changeBreakdown.edited.length}</Text>
            </View>
            <View style={styles.modalBreakdownRow}>
              <Text style={styles.modalBreakdownLabel}>Removed</Text>
              <Text style={styles.modalBreakdownValue}>{changeBreakdown.removed.length}</Text>
            </View>

            <ScrollView style={styles.modalChangeList}>
              {changeBreakdown.added.map(({ current: it }, idx) => (
                <View key={`added-${idx}`} style={styles.modalChangeItemRow}>
                  <Text style={styles.modalChangeTypeAdd}>ADDED</Text>
                  <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Quotation #${idx + 1}`}</Text>
                </View>
              ))}
              {changeBreakdown.edited.map(({ current: it, previous }, idx) => (
                <View key={`edited-${idx}`} style={styles.modalChangeItemBlock}>
                  <View style={styles.modalChangeItemRow}>
                    <Text style={styles.modalChangeTypeEdit}>EDITED</Text>
                    <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Quotation #${idx + 1}`}</Text>
                  </View>
                  {previous ? (
                    <>
                      <Text style={styles.modalChangeSubText}>Before: {previous.description || `Quotation #${idx + 1}`} • Qty {previous.quantity || 1} • PHP {formatMoney(Number(previous.unit_price || 0))}{previous.line_kind === 'item' ? ` • ${getSourceLabel(previous.source)}` : ''}</Text>
                      <Text style={styles.modalChangeSubText}>After: {it.description || `Quotation #${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}{it.line_kind === 'item' ? ` • ${getSourceLabel(it.source)}` : ''}</Text>
                    </>
                  ) : (
                    <Text style={styles.modalChangeSubText}>After: {it.description || `Quotation #${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}{it.line_kind === 'item' ? ` • ${getSourceLabel(it.source)}` : ''}</Text>
                  )}
                </View>
              ))}
              {changeBreakdown.removed.map(({ current: it }, idx) => (
                <View key={`removed-${idx}`} style={styles.modalChangeItemRow}>
                  <Text style={styles.modalChangeTypeDelete}>REMOVED</Text>
                  <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Quotation #${idx + 1}`}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => {
                  setShowSaveReviewModal(false);
                  setSaveError(null);
                }}
                disabled={saving}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={confirmSaveQuotation} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnPrimaryText}>Confirm Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
