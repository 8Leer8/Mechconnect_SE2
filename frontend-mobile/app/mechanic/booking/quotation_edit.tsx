import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Modal, LayoutAnimation, Platform, UIManager, FlatList, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { styles } from '../../../style/mechanic/quotation_edit';
import { directRequestServiceUnitPrice } from '@/lib/directRequestDisplay';
import { quotationReceiptDisplayUri } from '@/lib/imageUtils';

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

type ItemSourceValue = 'on_hand' | 'shop_supplied' | 'to_be_purchased' | 'already_purchased';

function buildItemSourceOptions(isShopJob: boolean): ReadonlyArray<{ value: ItemSourceValue; label: string }> {
  const tail: ReadonlyArray<{ value: ItemSourceValue; label: string }> = [
    { value: 'to_be_purchased', label: 'To be purchased' },
    { value: 'already_purchased', label: 'Already purchased' },
  ];
  if (isShopJob) {
    return [
      { value: 'shop_supplied', label: 'Shop supplied (from stock)' },
      { value: 'on_hand', label: 'Mechanic supplied (from stock)' },
      ...tail,
    ];
  }
  return [{ value: 'on_hand', label: 'Mechanic supplied (from stock)' }, ...tail];
}

/** Map API/source to a valid value for this booking (shop vs independent mechanic). */
function normalizeItemSource(raw: string | null | undefined, isShopJob: boolean): ItemSourceValue {
  const opts = buildItemSourceOptions(isShopJob);
  const allowed = new Set(opts.map((o) => o.value));
  const s = String(raw || '');
  if (s === 'mechanic_selling') return isShopJob ? 'shop_supplied' : 'on_hand';
  if (s === 'shop_supplied' && !isShopJob) return 'on_hand';
  if (allowed.has(s as ItemSourceValue)) return s as ItemSourceValue;
  return isShopJob ? 'shop_supplied' : 'on_hand';
}

function getSourceLabel(v: string | null | undefined, isShopJob: boolean): string {
  const s = v === 'mechanic_selling' ? (isShopJob ? 'shop_supplied' : 'on_hand') : String(v || '');
  const row = buildItemSourceOptions(isShopJob).find((x) => x.value === s);
  if (row) return row.label;
  const fallback = buildItemSourceOptions(!isShopJob).find((x) => x.value === s);
  return fallback?.label || String(v || '');
}

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
  /** shop_supplied = shop inventory (payout to shop); on_hand = mechanic inventory */
  source?: ItemSourceValue | null;
  description: string;
  quantity: number;
  unit_price: number;
  service?: number | null;
  service_add_on?: number | null;
  purchase_receipt_image?: string | null;
};

/** Receipt modal: new line picks local URI until save; existing line uploads right after pick. */
type ReceiptPickModalTarget =
  | { kind: 'deferred'; rowKey: string }
  | { kind: 'immediate'; rowKey: string; item: QuotationItem };

type BookedServiceInfo = {
  id: number;
  name: string;
  default_price: number;
};

/** Row from GET /services/mechanic/my-services/ or /services/shop/my-services/ (`id` is catalog Service id). */
type OfferedCatalogRow = {
  id: number;
  name: string;
  price: number;
  category: string | null;
};

/** Row from GET .../my-addons/?service_id= or .../shop/addons/?service_id= (`id` is ServiceAddOn id). */
type AddonCatalogRow = {
  id: number;
  name: string;
  price: number;
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

/** QuotationItem.description max length on server (CharField). */
const MAX_QUOTATION_DESC = 255;

const buildAddonLineDescription = (serviceName: string, addonName: string) => {
  const base = `${String(serviceName || 'Service').trim()} Addon: ${String(addonName || 'Add-on').trim()}`;
  if (base.length <= MAX_QUOTATION_DESC) return base;
  return `${base.slice(0, MAX_QUOTATION_DESC - 3)}...`;
};

const hasValidId = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

/**
 * Mechanic booking payloads are not always shaped the same across endpoints.
 * Detect "shop job" using multiple known forms.
 */
const isShopLinkedBooking = (booking: any): boolean => {
  const req = booking?.request || {};
  const shop = req?.shop || booking?.shop || {};
  return Boolean(
    hasValidId(req?.shop_id) ||
      hasValidId(req?.shopId) ||
      hasValidId(shop?.id) ||
      hasValidId(shop) ||
      hasValidId(booking?.shop_id) ||
      hasValidId(booking?.shopId),
  );
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
  /** Local image URI for new "already purchased" lines; uploads right after quotation save (when line gets an id). */
  const [pendingReceiptUriByKey, setPendingReceiptUriByKey] = useState<Record<string, string>>({});
  /** Camera vs library modal: deferred (new line) or immediate upload (line already has server id). */
  const [receiptPickModalTarget, setReceiptPickModalTarget] = useState<ReceiptPickModalTarget | null>(null);
  const [hasQuotationOnServer, setHasQuotationOnServer] = useState<boolean | null>(null);
  const [bookedServiceIds, setBookedServiceIds] = useState<number[]>([]);
  const [bookedServices, setBookedServices] = useState<BookedServiceInfo[]>([]);
  const [initialSaveSignature, setInitialSaveSignature] = useState<string | null>(null);
  const [isAcceptedBackjob, setIsAcceptedBackjob] = useState(false);
  const [currentBackjob, setCurrentBackjob] = useState<any | null>(null);
  const [isBookingCompleted, setIsBookingCompleted] = useState(false);
  const [bookingContextLoaded, setBookingContextLoaded] = useState(false);
  /** Shop-owner route or booking tied to a shop — drives labels and shop_supplied source. */
  const [isShopQuotationJob, setIsShopQuotationJob] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [catalogStep, setCatalogStep] = useState<'services' | 'addons'>('services');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogList, setCatalogList] = useState<OfferedCatalogRow[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogAddonsLoading, setCatalogAddonsLoading] = useState(false);
  const [catalogAddonsError, setCatalogAddonsError] = useState<string | null>(null);
  const [pendingCatalogService, setPendingCatalogService] = useState<OfferedCatalogRow | null>(null);
  const [catalogAddonRows, setCatalogAddonRows] = useState<AddonCatalogRow[]>([]);
  const [catalogSelectedAddonIds, setCatalogSelectedAddonIds] = useState<Record<number, boolean>>({});
  const [catalogAddonFetchFor, setCatalogAddonFetchFor] = useState<OfferedCatalogRow | null>(null);
  const isReadOnly = isBookingCompleted;

  const catalogFiltered = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalogList;
    return catalogList.filter((row) => row.name.toLowerCase().includes(q));
  }, [catalogList, catalogSearch]);

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
        default_price: directRequestServiceUnitPrice(svc as Record<string, unknown>),
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
          source: line_kind === 'service' ? null : normalizeItemSource(it.source, isShopQuotationJob),
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
  const itemSourceOptions = useMemo(() => buildItemSourceOptions(isShopQuotationJob), [isShopQuotationJob]);

  const buildMappedItemsFromApiData = (
    data: any,
    acceptedBackjob: boolean,
    extracted: BookedServiceInfo[],
    activeBackjob: any | undefined,
    isShopJob: boolean,
  ): { mappedItems: QuotationItem[]; serverHasQuotation: boolean } => {
    const safe = data ?? {};
    const savedQuotationId = Number(safe.id);
    const rawItems = safe.items;
    const itemsArray = Array.isArray(rawItems) ? rawItems : [];

    const mappedItemsRaw = itemsArray.map((it: any, index: number) => {
      const lineKind =
        it.line_kind === 'service' || it.line_kind === 'item'
          ? it.line_kind
          : it.service_add_on
            ? 'item'
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
        change_type: it.change_type ?? null,
        description: it.description || '',
        quantity: Number(it.quantity || 1),
        unit_price: Number(it.unit_price || 0),
        service: it.service || null,
        service_add_on: it.service_add_on || null,
        line_kind: lineKind,
        source: lineKind === 'service' ? null : normalizeItemSource(it.source, isShopJob),
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
      setIsShopQuotationJob(isShopOwnerSource);
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
      let isShopJob = isShopOwnerSource;

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
          isShopJob = isShopOwnerSource || isShopLinkedBooking(booking);
          if (!cancelled) setIsShopQuotationJob(isShopJob);
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
              isShopJob,
            );
            setHasQuotationOnServer(fromBooking.serverHasQuotation);
            setItems(fromBooking.mappedItems);
            const initialMapFb: Record<string, QuotationItem> = {};
            fromBooking.mappedItems.forEach((it: QuotationItem) => {
              if (it.id != null) initialMapFb[String(it.id)] = { ...it };
            });
            setInitialItemMap(initialMapFb);
            initializeInputText(fromBooking.mappedItems);
            setInitialSaveSignature(`${JSON.stringify(buildSavableItems(fromBooking.mappedItems, {}))}|pr:`);
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
            const fromExtracted = buildMappedItemsFromApiData(
              {},
              acceptedBackjob,
              extracted,
              bookingPayload?.backjob,
              isShopJob,
            );
            if (fromExtracted.mappedItems.length > 0) {
              setHasQuotationOnServer(fromExtracted.serverHasQuotation);
              setItems(fromExtracted.mappedItems);
              const initialMapEx: Record<string, QuotationItem> = {};
              fromExtracted.mappedItems.forEach((it: QuotationItem) => {
                if (it.id != null) initialMapEx[String(it.id)] = { ...it };
              });
              setInitialItemMap(initialMapEx);
              initializeInputText(fromExtracted.mappedItems);
              setInitialSaveSignature(`${JSON.stringify(buildSavableItems(fromExtracted.mappedItems, {}))}|pr:`);
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
              setInitialSaveSignature(`${JSON.stringify(buildSavableItems([], {}))}|pr:`);
            }
          }
          return;
        }

        const data = await quotationRes.json();
        if (cancelled) return;
        let { mappedItems, serverHasQuotation } = buildMappedItemsFromApiData(
          data,
          acceptedBackjob,
          extracted,
          bookingPayload?.backjob,
          isShopJob,
        );
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
            isShopJob,
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
        setInitialSaveSignature(`${JSON.stringify(buildSavableItems(mappedItems, {}))}|pr:`);
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
          setInitialSaveSignature(`${JSON.stringify(buildSavableItems([], {}))}|pr:`);
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

  const openServiceCatalog = async () => {
    if (isReadOnly) return;
    setCatalogVisible(true);
    setCatalogStep('services');
    setCatalogAddonsError(null);
    setPendingCatalogService(null);
    setCatalogAddonRows([]);
    setCatalogSelectedAddonIds({});
    setCatalogAddonFetchFor(null);
    setCatalogSearch('');
    setCatalogError(null);
    setCatalogLoading(true);
    const url = isShopOwnerSource
      ? `${API_URL}/services/shop/my-services/`
      : `${API_URL}/services/mechanic/my-services/`;
    try {
      const res = await fetchWithAuthRetry(url, { method: 'GET', credentials: 'include' }, authJsonHeaders);
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        setCatalogList([]);
        setCatalogError(String(data?.error || data?.detail || 'Could not load your services.'));
        return;
      }
      const raw = Array.isArray(data.services) ? data.services : [];
      const rows: OfferedCatalogRow[] = [];
      raw.forEach((s: any) => {
        const id = Number(s.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const price = Number(s.price);
        rows.push({
          id,
          name: String(s.name || 'Service'),
          price: Number.isFinite(price) ? price : 0,
          category: s.category != null && s.category !== '' ? String(s.category) : null,
        });
      });
      setCatalogList(rows);
    } catch (e: any) {
      setCatalogList([]);
      setCatalogError(e?.message ? String(e.message) : 'Network error while loading services.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const closeServiceCatalog = () => {
    setCatalogVisible(false);
    setCatalogError(null);
    setCatalogStep('services');
    setCatalogAddonsError(null);
    setCatalogAddonsLoading(false);
    setPendingCatalogService(null);
    setCatalogAddonRows([]);
    setCatalogSelectedAddonIds({});
    setCatalogAddonFetchFor(null);
  };

  /** Adds one service line plus optional add-on lines (add-ons are saved as item rows with `service_add_on`). */
  const appendServiceAndAddonsFromCatalog = (
    serviceRow: OfferedCatalogRow,
    addonsToInclude: AddonCatalogRow[],
  ) => {
    if (isReadOnly) return;
    type Def = { key: string; item: QuotationItem };
    const defs: Def[] = [];
    const svcKey = makeClientKey();
    defs.push({
      key: svcKey,
      item: {
        client_key: svcKey,
        line_kind: 'service',
        description: serviceRow.name,
        quantity: 1,
        unit_price: serviceRow.price,
        service: serviceRow.id,
        service_add_on: null,
        status: 'pending',
        change_type: 'added',
      },
    });
    addonsToInclude.forEach((addon) => {
      const k = makeClientKey();
      defs.push({
        key: k,
        item: {
          client_key: k,
          line_kind: 'item',
          source: isShopQuotationJob ? 'shop_supplied' : 'on_hand',
          description: buildAddonLineDescription(serviceRow.name, addon.name),
          quantity: 1,
          unit_price: addon.price,
          service: serviceRow.id,
          service_add_on: addon.id,
          status: 'pending',
          change_type: 'added',
        },
      });
    });
    setItems((prev) => [...prev, ...defs.map((d) => d.item)]);
    setQuantityText((prev) => {
      const next = { ...prev };
      defs.forEach((d) => {
        next[d.key] = '1';
      });
      return next;
    });
    setUnitPriceText((prev) => {
      const next = { ...prev };
      defs.forEach((d) => {
        next[d.key] = String(d.item.unit_price);
      });
      return next;
    });
    setExpandedItems((prev) => {
      const next = { ...prev };
      defs.forEach((d) => {
        next[d.key] = true;
      });
      return next;
    });
    closeServiceCatalog();
  };

  const handleCatalogServicePress = async (row: OfferedCatalogRow) => {
    if (isReadOnly || catalogAddonsLoading) return;
    setCatalogAddonFetchFor(row);
    setCatalogAddonsError(null);
    setCatalogAddonsLoading(true);
    const base = isShopOwnerSource
      ? `${API_URL}/services/shop/addons/`
      : `${API_URL}/services/mechanic/my-addons/`;
    const url = `${base}?service_id=${row.id}`;
    try {
      const res = await fetchWithAuthRetry(url, { method: 'GET', credentials: 'include' }, authJsonHeaders);
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        setCatalogAddonsError(String(data?.error || data?.detail || 'Could not load add-ons.'));
        return;
      }
      const raw = Array.isArray(data.add_ons) ? data.add_ons : [];
      const mapped: AddonCatalogRow[] = [];
      raw.forEach((a: any) => {
        const id = Number(a.id);
        if (!Number.isFinite(id) || id <= 0) return;
        const price = Number(a.price);
        mapped.push({
          id,
          name: String(a.name || 'Add-on'),
          price: Number.isFinite(price) ? price : 0,
        });
      });
      if (mapped.length === 0) {
        appendServiceAndAddonsFromCatalog(row, []);
        return;
      }
      setPendingCatalogService(row);
      setCatalogAddonRows(mapped);
      setCatalogSelectedAddonIds({});
      setCatalogStep('addons');
    } catch (e: any) {
      setCatalogAddonsError(e?.message ? String(e.message) : 'Network error while loading add-ons.');
    } finally {
      setCatalogAddonsLoading(false);
    }
  };

  const backCatalogToServices = () => {
    setCatalogStep('services');
    setPendingCatalogService(null);
    setCatalogAddonRows([]);
    setCatalogSelectedAddonIds({});
    setCatalogAddonsError(null);
    setCatalogAddonFetchFor(null);
  };

  const confirmCatalogAddonsToQuotation = () => {
    if (!pendingCatalogService) return;
    const chosen = catalogAddonRows.filter((a) => catalogSelectedAddonIds[a.id]);
    appendServiceAndAddonsFromCatalog(pendingCatalogService, chosen);
  };

  const skipAddonsAfterFetchError = () => {
    const row = catalogAddonFetchFor;
    if (!row) return;
    setCatalogAddonsError(null);
    appendServiceAndAddonsFromCatalog(row, []);
  };

  const addItem = () => {
    if (isReadOnly) return;
    const newItem: QuotationItem = {
      client_key: makeClientKey(),
      line_kind: 'item',
      source: isShopQuotationJob ? 'shop_supplied' : 'on_hand',
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
    setPendingReceiptUriByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
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

  /** Matches `|pr:` suffix on `setInitialSaveSignature` so deferred receipt picks count as unsaved. */
  const currentSaveSignature = useMemo(() => {
    const base = JSON.stringify(buildSavableItems(mergeDraftIntoItems(items), removedAcceptedItems));
    const merged = mergeDraftIntoItems(items);
    const pr = merged
      .map((it, i) => {
        const k = getItemKey(it, i);
        return it.line_kind === 'item' && it.source === 'already_purchased' && pendingReceiptUriByKey[k] ? k : '';
      })
      .filter(Boolean)
      .sort()
      .join(',');
    return `${base}|pr:${pr}`;
  }, [items, removedAcceptedItems, quantityText, unitPriceText, pendingReceiptUriByKey]);

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

  const postQuotationItemReceiptMultipart = async (itemId: number, uri: string, unitPrice: number) => {
    if (!bookingId) return;
    const fileName = uri.split('/').pop() || `receipt-${itemId}.jpg`;
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const formData = new FormData();
    formData.append('receipt_image', { uri, name: fileName, type: mime } as any);
    formData.append('actual_unit_price', String(Math.max(0, unitPrice)));
    const receiptUrl = isShopOwnerSource
      ? `${API_URL}/bookings/shopowner/bookings/${bookingId}/quotation/items/${itemId}/receipt/`
      : `${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/items/${itemId}/receipt/`;
    const res = await fetchWithAuthRetry(receiptUrl, {
      method: 'POST',
      credentials: 'include',
      body: formData as any,
    }, authHeadersMultipart);
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || 'Failed to upload receipt');
  };

  const openDeferredReceiptPickerModal = (rowKey: string) => {
    if (isReadOnly) return;
    setReceiptPickModalTarget({ kind: 'deferred', rowKey });
  };

  /** Saved quotation line: pick camera or gallery, then upload receipt to server immediately. */
  const openImmediateReceiptPickerModal = (item: QuotationItem, rowKey: string) => {
    if (isReadOnly) return;
    if (!bookingId || !item.id) return;
    setReceiptPickModalTarget({ kind: 'immediate', rowKey, item });
  };

  const closeReceiptPickModal = () => {
    setReceiptPickModalTarget(null);
  };

  const completeReceiptPick = async (mode: 'camera' | 'library') => {
    const target = receiptPickModalTarget;
    if (!target) return;
    closeReceiptPickModal();
    const rowKey = target.rowKey;
    try {
      if (mode === 'library') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission needed', 'Allow photo library access to attach a receipt.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission needed', 'Allow camera access to take a receipt photo.');
          return;
        }
      }
      const launchOpts = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9 as const,
      };
      const result =
        mode === 'library'
          ? await ImagePicker.launchImageLibraryAsync(launchOpts)
          : await ImagePicker.launchCameraAsync(launchOpts);
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;

      if (target.kind === 'deferred') {
        setPendingReceiptUriByKey((prev) => ({ ...prev, [rowKey]: uri }));
        return;
      }

      setReceiptUploadingKey(rowKey);
      await postQuotationItemReceiptMultipart(
        Number(target.item.id),
        uri,
        Math.max(0, Number(target.item.unit_price || 0)),
      );
      router.replace({
        pathname: '/mechanic/booking/quotation_edit',
        params: { bookingId: String(bookingId), ...(isShopOwnerSource ? { source: 'shopowner' } : {}) },
      });
    } catch (e: any) {
      Alert.alert('Receipt', String(e?.message || e || 'Unknown error'));
      console.error(LOG, 'receipt pick/upload failed', e?.message || e, e);
    } finally {
      setReceiptUploadingKey(null);
    }
  };

  const clearDeferredReceiptForKey = (rowKey: string) => {
    setPendingReceiptUriByKey((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
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
      const fromServer = buildMappedItemsFromApiData(
        body,
        isAcceptedBackjob,
        bookedServices,
        currentBackjob,
        isShopQuotationJob,
      );
      const preSavePendingReceipts = rowsToSave
        .map((it, i) => ({ it, rowKey: getItemKey(it, i) }))
        .filter(
          ({ it, rowKey }) =>
            it.line_kind === 'item' &&
            it.source === 'already_purchased' &&
            Boolean(pendingReceiptUriByKey[rowKey]),
        )
        .map(({ it, rowKey }) => ({
          uri: pendingReceiptUriByKey[rowKey],
          description: String(it.description || ''),
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
        }));

      setHasQuotationOnServer(fromServer.serverHasQuotation);
      setItems(fromServer.mappedItems);
      const postSaveMap: Record<string, QuotationItem> = {};
      fromServer.mappedItems.forEach((it: QuotationItem) => {
        if (it.id != null) postSaveMap[String(it.id)] = { ...it };
      });
      setInitialItemMap(postSaveMap);
      initializeInputText(fromServer.mappedItems);
      setInitialSaveSignature(`${JSON.stringify(buildSavableItems(fromServer.mappedItems, {}))}|pr:`);
      setRemovedAcceptedItems({});
      const postExpanded: Record<string, boolean> = {};
      fromServer.mappedItems.forEach((it: QuotationItem, idx: number) => {
        const k = getItemKey(it, idx);
        const acc = String(it.status || '').toLowerCase() === 'accepted';
        postExpanded[k] = !acc;
      });
      setExpandedItems(postExpanded);
      setShowSaveReviewModal(false);
      setPendingReceiptUriByKey({});

      if (preSavePendingReceipts.length > 0) {
        const usedServerIds = new Set<number>();
        const receiptErrors: string[] = [];
        for (const p of preSavePendingReceipts) {
          const match = fromServer.mappedItems.find((srv) => {
            const sid = Number(srv.id || 0);
            if (!Number.isFinite(sid) || sid <= 0 || usedServerIds.has(sid)) return false;
            if (srv.line_kind !== 'item' || srv.source !== 'already_purchased') return false;
            if (String(srv.description || '') !== p.description) return false;
            if (Number(srv.quantity || 1) !== p.quantity) return false;
            if (Math.abs(Number(srv.unit_price || 0) - p.unit_price) > 0.0001) return false;
            return true;
          });
          if (match?.id) {
            usedServerIds.add(Number(match.id));
            try {
              await postQuotationItemReceiptMultipart(Number(match.id), p.uri, p.unit_price);
            } catch (reErr: any) {
              receiptErrors.push(String(reErr?.message || 'Receipt upload failed'));
            }
          }
        }
        if (receiptErrors.length > 0) {
          Alert.alert(
            'Some receipts did not upload',
            `${receiptErrors.join('\n')}\n\nYou can open this quotation again and use Upload receipt on each line.`,
          );
        }
      }

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
            const addOnId = Number(it.service_add_on || 0);
            const isAddonQuotationLine = !isServiceLine && Number.isFinite(addOnId) && addOnId > 0;
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
                        {isAddonQuotationLine ? (
                          <View style={styles.addonLineBadge}>
                            <Text style={styles.addonLineBadgeText}>Add-on</Text>
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
                          : `${isExpanded ? `Qty ${it.quantity || 1}` : `Qty ${it.quantity || 1} × PHP ${formatMoney(Number(it.unit_price || 0))}`} • ${getSourceLabel(it.source, isShopQuotationJob)}`}
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
                            <Text style={styles.numericInput}>{getSourceLabel(it.source, isShopQuotationJob)}</Text>
                          ) : (
                            <View style={styles.sourceChipsRow}>
                              {itemSourceOptions.map((opt) => (
                                <TouchableOpacity
                                  key={opt.value}
                                  onPress={() => {
                                    if (!isEditable || isRemovedGhost) return;
                                    const rowKey = getItemKey(it, idx);
                                    if (it.source === 'already_purchased' && opt.value !== 'already_purchased') {
                                      setPendingReceiptUriByKey((prev) => {
                                        const next = { ...prev };
                                        delete next[rowKey];
                                        return next;
                                      });
                                    }
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

                        {!isServiceLine &&
                        (it.source === 'to_be_purchased' || it.source === 'already_purchased') ? (() => {
                          const receiptUri =
                            pendingReceiptUriByKey[key] || quotationReceiptDisplayUri(it.purchase_receipt_image);
                          if (!receiptUri) return null;
                          return (
                            <View style={styles.receiptPreviewWrap}>
                              <Text style={styles.receiptPreviewLabel}>Purchase receipt</Text>
                              <Image
                                source={{ uri: receiptUri }}
                                style={styles.receiptPreviewImage}
                                contentFit="contain"
                                accessibilityLabel="Purchase receipt preview"
                              />
                              {pendingReceiptUriByKey[key] && !it.purchase_receipt_image ? (
                                <Text style={styles.receiptPreviewPendingNote}>
                                  Not on the server yet — save the quotation to upload this receipt.
                                </Text>
                              ) : it.purchase_receipt_image && String(it.status || '').toLowerCase() === 'pending' ? (
                                <Text style={styles.receiptPreviewPendingNote}>
                                  Sent with your quotation request — the client can review it when they respond.
                                </Text>
                              ) : null}
                            </View>
                          );
                        })() : null}

                        {it.source === 'to_be_purchased' && !isReadOnly ? (
                          <View style={styles.receiptRowWrap}>
                            <Text style={styles.receiptHelpTitle}>After you buy this part</Text>
                            <Text style={styles.receiptHintText}>
                              1) Save or update this quotation so the client sees the line.{'\n'}
                              2) Come back here and use Upload receipt to attach the store receipt and confirm the real unit price.
                            </Text>
                            {it.id ? (
                              <TouchableOpacity
                                style={[styles.receiptButton, receiptUploadingKey === key ? styles.receiptButtonDisabled : null]}
                                onPress={() => openImmediateReceiptPickerModal(it, key)}
                                disabled={receiptUploadingKey === key}
                              >
                                {receiptUploadingKey === key ? (
                                  <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                  <>
                                    <FontAwesome name="upload" size={12} color="#fff" />
                                    <Text style={styles.receiptButtonText}>Add or replace receipt</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}

                        {it.source === 'already_purchased' && !isReadOnly ? (
                          <View style={styles.receiptRowWrap}>
                            <Text style={styles.receiptHelpTitle}>You already bought this part</Text>
                            <Text style={styles.receiptHintText}>
                              Set the unit price to match the receipt, then attach the receipt. If this line is new, choose the photo first — it uploads automatically right after you save the quotation.
                            </Text>
                            {!it.id ? (
                              <>
                                <TouchableOpacity
                                  style={[styles.receiptButton, receiptUploadingKey === key ? styles.receiptButtonDisabled : null]}
                                  onPress={() => openDeferredReceiptPickerModal(key)}
                                  disabled={receiptUploadingKey === key}
                                >
                                  <FontAwesome name="picture-o" size={12} color="#fff" />
                                  <Text style={styles.receiptButtonText}>Choose purchase receipt</Text>
                                </TouchableOpacity>
                                {pendingReceiptUriByKey[key] ? (
                                  <TouchableOpacity
                                    style={styles.receiptRemovePhotoBtn}
                                    onPress={() => clearDeferredReceiptForKey(key)}
                                  >
                                    <Text style={styles.receiptClearLink}>Remove receipt photo</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </>
                            ) : (
                              <TouchableOpacity
                                style={[styles.receiptButton, receiptUploadingKey === key ? styles.receiptButtonDisabled : null]}
                                onPress={() => openImmediateReceiptPickerModal(it, key)}
                                disabled={receiptUploadingKey === key}
                              >
                                {receiptUploadingKey === key ? (
                                  <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                  <>
                                    <FontAwesome name="upload" size={12} color="#fff" />
                                    <Text style={styles.receiptButtonText}>Add or replace receipt</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
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
          <>
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
            <TouchableOpacity onPress={openServiceCatalog} style={styles.addFromCatalogButton} activeOpacity={0.85}>
              <FontAwesome name="th-list" size={13} color="#9ECFB0" />
              <Text style={styles.addFromCatalogButtonText}>
                {isShopOwnerSource ? 'Pick from shop services' : 'Pick from services I offer'}
              </Text>
            </TouchableOpacity>
          </>
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

      <Modal
        visible={receiptPickModalTarget != null}
        animationType="fade"
        transparent
        onRequestClose={closeReceiptPickModal}
      >
        <View style={styles.receiptSourceModalOverlay}>
          <View style={styles.receiptSourceModalCard}>
            <View style={styles.receiptSourceModalHeader}>
              <Text style={styles.receiptSourceModalTitle}>Add purchase receipt</Text>
              <TouchableOpacity
                onPress={closeReceiptPickModal}
                style={styles.receiptSourceModalCloseHit}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={18} color="#9FA5AD" />
              </TouchableOpacity>
            </View>
            <Text style={styles.receiptSourceModalSubtitle}>
              {receiptPickModalTarget?.kind === 'immediate'
                ? 'Take a new photo or pick from your gallery. It uploads to this line as soon as you confirm.'
                : 'How do you want to add the receipt photo? It will attach when you save the quotation.'}
            </Text>

            <TouchableOpacity
              style={styles.receiptSourceOptionRow}
              onPress={() => completeReceiptPick('camera')}
              activeOpacity={0.88}
            >
              <View style={[styles.receiptSourceOptionIconWrap, styles.receiptSourceOptionIconWrapCamera]}>
                <FontAwesome name="camera" size={22} color="#FFB357" />
              </View>
              <View style={styles.receiptSourceOptionTextCol}>
                <Text style={styles.receiptSourceOptionTitle}>Take photo</Text>
                <Text style={styles.receiptSourceOptionDesc}>Open the camera and snap the store receipt</Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#5C6168" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.receiptSourceOptionRow}
              onPress={() => completeReceiptPick('library')}
              activeOpacity={0.88}
            >
              <View style={[styles.receiptSourceOptionIconWrap, styles.receiptSourceOptionIconWrapGallery]}>
                <FontAwesome name="picture-o" size={22} color="#6FE29D" />
              </View>
              <View style={styles.receiptSourceOptionTextCol}>
                <Text style={styles.receiptSourceOptionTitle}>Photo library</Text>
                <Text style={styles.receiptSourceOptionDesc}>Choose a saved image or screenshot</Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#5C6168" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.receiptSourceCancelBtn} onPress={closeReceiptPickModal} activeOpacity={0.85}>
              <Text style={styles.receiptSourceCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={catalogVisible} animationType="fade" transparent onRequestClose={closeServiceCatalog}>
        <View style={styles.modalOverlay}>
          <View style={styles.catalogModalBox}>
            {catalogStep === 'addons' && pendingCatalogService ? (
              <>
                <TouchableOpacity style={styles.catalogBackRow} onPress={backCatalogToServices} activeOpacity={0.8}>
                  <FontAwesome name="chevron-left" size={12} color="#9ECFB0" />
                  <Text style={styles.catalogBackText}>All services</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{pendingCatalogService.name}</Text>
                <Text style={styles.modalText}>
                  Tick any add-on to include it as its own quotation line (same as an item line). Untick everything to add only the service.
                </Text>
                <FlatList
                  data={catalogAddonRows}
                  keyExtractor={(a) => String(a.id)}
                  style={styles.catalogList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: addon }) => {
                    const on = !!catalogSelectedAddonIds[addon.id];
                    return (
                      <TouchableOpacity
                        style={styles.catalogAddonPickRow}
                        onPress={() => setCatalogSelectedAddonIds((prev) => ({ ...prev, [addon.id]: !on }))}
                        activeOpacity={0.75}
                      >
                        <FontAwesome name={on ? 'check-square' : 'square-o'} size={20} color={on ? '#6FE29D' : '#8E8E93'} />
                        <View style={styles.catalogAddonPickMid}>
                          <Text style={styles.catalogRowTitle} numberOfLines={2}>{addon.name}</Text>
                          <Text style={styles.catalogFormatHint} numberOfLines={2}>
                            {buildAddonLineDescription(pendingCatalogService.name, addon.name)}
                          </Text>
                        </View>
                        <Text style={styles.catalogRowPrice}>PHP {formatMoney(addon.price)}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
                <View style={styles.catalogAddonActionsRow}>
                  <TouchableOpacity style={styles.catalogSecondaryButton} onPress={backCatalogToServices}>
                    <Text style={styles.catalogSecondaryButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.catalogConfirmButton} onPress={confirmCatalogAddonsToQuotation}>
                    <Text style={styles.catalogConfirmButtonText}>Add to quotation</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>
                  {isShopOwnerSource ? 'Shop services' : 'Services I offer'}
                </Text>
                <Text style={styles.modalText}>
                  Tap a service to add it with your saved price. If you have add-ons for that service, you can choose which ones to include next.
                </Text>
                <TextInput
                  style={styles.catalogSearchInput}
                  placeholder="Search by name…"
                  placeholderTextColor="#8E8E93"
                  value={catalogSearch}
                  onChangeText={setCatalogSearch}
                  editable={!catalogLoading && !catalogAddonsLoading}
                />
                {catalogAddonsError && catalogAddonFetchFor ? (
                  <View style={styles.catalogInlineErrorBox}>
                    <Text style={styles.catalogErrorText}>{catalogAddonsError}</Text>
                    <TouchableOpacity style={styles.catalogSkipAddonsButton} onPress={skipAddonsAfterFetchError}>
                      <Text style={styles.catalogSkipAddonsButtonText}>Add service without add-ons</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {catalogLoading ? (
                  <View style={styles.catalogCenterBlock}>
                    <ActivityIndicator color="#9ECFB0" size="large" />
                  </View>
                ) : catalogError ? (
                  <View style={styles.catalogCenterBlock}>
                    <Text style={styles.catalogErrorText}>{catalogError}</Text>
                  </View>
                ) : catalogAddonsLoading ? (
                  <View style={styles.catalogCenterBlock}>
                    <ActivityIndicator color="#9ECFB0" size="large" />
                    <Text style={styles.catalogLoadingSub}>Loading add-ons…</Text>
                  </View>
                ) : (
                  <FlatList
                    data={catalogFiltered}
                    keyExtractor={(row) => String(row.id)}
                    style={styles.catalogList}
                    contentContainerStyle={catalogFiltered.length === 0 ? styles.catalogListEmpty : undefined}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <Text style={styles.catalogEmptyHint}>
                        {catalogList.length === 0
                          ? 'No services on your profile yet. Add services under your profile first, then come back here.'
                          : 'No services match your search.'}
                      </Text>
                    }
                    renderItem={({ item: row }) => (
                      <TouchableOpacity
                        style={styles.catalogRow}
                        onPress={() => handleCatalogServicePress(row)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.catalogRowLeft}>
                          <Text style={styles.catalogRowTitle} numberOfLines={2}>{row.name}</Text>
                          {row.category ? (
                            <Text style={styles.catalogRowSub} numberOfLines={1}>{row.category}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.catalogRowPrice}>PHP {formatMoney(row.price)}</Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
                <TouchableOpacity style={styles.catalogCloseButton} onPress={closeServiceCatalog}>
                  <Text style={styles.catalogCloseButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
                      <Text style={styles.modalChangeSubText}>Before: {previous.description || `Quotation #${idx + 1}`} • Qty {previous.quantity || 1} • PHP {formatMoney(Number(previous.unit_price || 0))}{previous.line_kind === 'item' ? ` • ${getSourceLabel(previous.source, isShopQuotationJob)}` : ''}</Text>
                      <Text style={styles.modalChangeSubText}>After: {it.description || `Quotation #${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}{it.line_kind === 'item' ? ` • ${getSourceLabel(it.source, isShopQuotationJob)}` : ''}</Text>
                    </>
                  ) : (
                    <Text style={styles.modalChangeSubText}>After: {it.description || `Quotation #${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}{it.line_kind === 'item' ? ` • ${getSourceLabel(it.source, isShopQuotationJob)}` : ''}</Text>
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
