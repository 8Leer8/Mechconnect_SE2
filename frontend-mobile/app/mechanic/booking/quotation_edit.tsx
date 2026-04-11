import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Modal, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '../../../style/mechanic/quotation_edit';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type QuotationItem = {
  id?: number;
  client_key?: string;
  created_at?: string;
  status?: string;
  change_type?: 'added' | 'edited' | 'removed' | null;
  description: string;
  quantity: number;
  unit_price: number;
  service?: number | null;
  service_add_on?: number | null;
};

const formatMoney = (amount: number) => {
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
};

export default function QuotationEdit() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [availedServiceIds, setAvailedServiceIds] = useState<number[]>([]);
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

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const getItemKey = (item: QuotationItem, idx: number) => String(item.id ?? item.client_key ?? `new-${idx}`);

  const makeClientKey = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const orderItems = (rawItems: QuotationItem[], serviceIds: number[]) => {
    if (!rawItems.length) return [];
    const serviceSet = new Set((serviceIds || []).map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0));
    return rawItems
      .map((it, index) => ({ ...it, _sourceIndex: index }))
      .sort((a: any, b: any) => {
        const aIsService = a.service != null && serviceSet.has(Number(a.service));
        const bIsService = b.service != null && serviceSet.has(Number(b.service));
        if (aIsService !== bIsService) return aIsService ? -1 : 1;

        const aId = Number(a.id);
        const bId = Number(b.id);
        if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;

        return (a._sourceIndex || 0) - (b._sourceIndex || 0);
      })
      .map(({ _sourceIndex, ...rest }: any) => rest);
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

  useEffect(() => {
    const fetchQuotation = async () => {
      if (!bookingId) return;
      try {
        const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = await res.json();
        const mappedItemsRaw = (data.items || []).map((it: any, index: number) => ({
            id: it.id,
            client_key: `existing-${it.id ?? index}`,
            created_at: it.created_at,
            status: it.status,
                change_type: null,
            description: it.description || '',
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            service: it.service || null,
            service_add_on: it.service_add_on || null,
          }));
        const mappedItems = orderItems(mappedItemsRaw, availedServiceIds);
        setItems(mappedItems);
        const initialMap: Record<string, QuotationItem> = {};
        mappedItems.forEach((it: QuotationItem) => {
          if (it.id != null) initialMap[String(it.id)] = { ...it };
        });
        setInitialItemMap(initialMap);
        initializeInputText(mappedItems);
        const nextExpanded: Record<string, boolean> = {};
        mappedItems.forEach((it: QuotationItem, idx: number) => {
          const key = getItemKey(it, idx);
          const isAccepted = String(it.status || '').toLowerCase() === 'accepted';
          nextExpanded[key] = !isAccepted;
        });
        setExpandedItems(nextExpanded);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchQuotation();
  }, [bookingId]);

  // If there is no existing quotation, prefill an item with the availed service from booking
  useEffect(() => {
    const prefillFromBooking = async () => {
      if (!bookingId) return;
      // only prefill when items are empty and not loading
      if (loading) return;
      try {
        // fetch booking detail
        const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const payload = await res.json();
        const booking = payload.booking || payload;
        // booking.request.request_details may contain service info for direct requests
        const details = booking.request?.request_details;
        if (!details) return;
        const ids: number[] = [];
        if (details.service?.id) ids.push(Number(details.service.id));
        if (Array.isArray(details.services)) {
          details.services.forEach((svc: any) => {
            const sid = Number(svc?.id);
            if (Number.isFinite(sid) && sid > 0) ids.push(sid);
          });
        }
        setAvailedServiceIds(Array.from(new Set(ids)));
        // If direct request, use the service
        if (details.service && items.length === 0) {
          const svc = details.service;
          const unit = Number(svc.minimum_price || booking.amount_fee || 0);
          const prefilled = [{ client_key: makeClientKey(), description: svc.name || 'Service', quantity: 1, unit_price: unit, service: svc.id } as QuotationItem];
          setItems(prefilled);
          initializeInputText(prefilled);
        }
        // For broadcast, there may be services array
        if (details.services && Array.isArray(details.services) && items.length === 0) {
          const primary = details.services[0];
          const unit = Number(primary.minimum_price || booking.amount_fee || 0);
          const prefilled = [{ client_key: makeClientKey(), description: primary.name || 'Service', quantity: 1, unit_price: unit, service: primary.id } as QuotationItem];
          setItems(prefilled);
          initializeInputText(prefilled);
        }
      } catch (e) {
        // ignore
      }
    };
    prefillFromBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bookingId]);

  useEffect(() => {
    if (!items.length || !availedServiceIds.length) return;
    setItems(prev => orderItems(prev, availedServiceIds));
    // keep existing text maps; keys are stable via id/client_key
  }, [availedServiceIds]);

  const updateItem = (index: number, patch: any) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const addItem = () => {
    const newItem: QuotationItem = { client_key: makeClientKey(), description: '', quantity: 1, unit_price: 0, status: 'pending', change_type: 'added' };
    setItems(prev => [...prev, newItem]);
    const newKey = getItemKey(newItem, items.length);
    setQuantityText(prev => ({ ...prev, [newKey]: '1' }));
    setUnitPriceText(prev => ({ ...prev, [newKey]: '0' }));
  };

  const removeItem = (index: number) => {
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
    setSelectedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectMode = () => {
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
    setItemSnapshots(prev => ({ ...prev, [key]: { ...item } }));
    setEditingItems(prev => ({ ...prev, [key]: true }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
  };

  const confirmItemEdit = (key: string, index: number) => {
    const snapshot = itemSnapshots[key];
    const current = items[index];
    const wasAccepted = String(snapshot?.status || '').toLowerCase() === 'accepted';
    const changed = !!snapshot && !!current && (
      String(snapshot.description || '') !== String(current.description || '') ||
      Number(snapshot.quantity || 0) !== Number(current.quantity || 0) ||
      Number(snapshot.unit_price || 0) !== Number(current.unit_price || 0) ||
      Number(snapshot.service || 0) !== Number(current.service || 0) ||
      Number(snapshot.service_add_on || 0) !== Number(current.service_add_on || 0)
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
    setEditingItems(prev => ({ ...prev, [key]: false }));
    setDeleteArmedItems(prev => ({ ...prev, [key]: true }));
  };

  const cancelDelete = (key: string) => {
    setDeleteArmedItems(prev => ({ ...prev, [key]: false }));
  };

  const confirmDelete = (key: string, index: number) => {
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
    setSelectedItems({});
  };

  const bulkDeleteSelected = () => {
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
      const previous = it.id != null ? (initialItemMap[String(it.id)] || null) : null;
      const changedFromInitial = !!previous && (
        String(previous.description || '') !== String(it.description || '') ||
        Number(previous.quantity || 0) !== Number(it.quantity || 0) ||
        Number(previous.unit_price || 0) !== Number(it.unit_price || 0)
      );

      if (removedAcceptedItems[key] || change === 'removed') {
        removed.push({ current: it, previous });
      } else if (change === 'edited' || changedFromInitial) {
        edited.push({ current: it, previous });
      } else if (change === 'added' || !it.id) {
        added.push({ current: it });
      }
    });

    return { added, edited, removed };
  }, [items, removedAcceptedItems, initialItemMap]);

  const subtotal = useMemo(
    () => items.reduce((sum, it, idx) => {
      const key = getItemKey(it, idx);
      if (removedAcceptedItems[key]) return sum;
      return sum + Number(it.quantity || 0) * Number(it.unit_price || 0);
    }, 0),
    [items, removedAcceptedItems]
  );
  const totalAmount = useMemo(() => subtotal, [subtotal]);

  const handleSave = async () => {
    setShowSaveReviewModal(true);
  };

  const confirmSaveQuotation = async () => {
    if (!bookingId) return;
    setSaving(true);
    try {
      const payload = {
        items: items
          .filter((it, idx) => {
            const key = getItemKey(it, idx);
            return !removedAcceptedItems[key];
          })
          .map(({ client_key, created_at, ...it }) => ({
            ...it,
            quantity: Math.max(1, Number(it.quantity || 1)),
            unit_price: Math.max(0, Number(it.unit_price || 0)),
          })),
      };
      const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to save quotation');
      }
      showNotification({ type: 'success', title: 'Saved', message: 'Quotation saved successfully' });
      setShowSaveReviewModal(false);
      try {
        // Ensure chat conversation is created and messages are fetched so chat UI sees the new quotation
        const convRes = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (convRes.ok) {
          const convData = await convRes.json().catch(() => null);
          const convId = convData?.id;
          if (convId) {
            await fetch(`${API_URL}/chat/${convId}/messages/?mark_read=1`, { method: 'GET', credentials: 'include' });
          }
        }
      } catch (e) {
        // best-effort
      }
      router.back();
    } catch (e: any) {
      showNotification({ type: 'error', message: e.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Quotation</Text>
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
        <Text style={styles.headerTitle}>Edit Quotation</Text>
        <TouchableOpacity style={styles.selectModeButton} onPress={toggleSelectMode}>
          <Text style={styles.selectModeButtonText}>{selectMode ? 'Done' : 'Select'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quoted Services & Add-ons</Text>
        </View>

        {items.map((it, idx) => (
          (() => {
            const key = getItemKey(it, idx);
            const isAccepted = String(it.status || '').toLowerCase() === 'accepted';
            const isEditing = !!editingItems[key];
            const isDeleteArmed = !!deleteArmedItems[key];
            const isRemovedGhost = !!removedAcceptedItems[key];
            const usesEditFlow = isAccepted || isRemovedGhost;
            const isEditable = !usesEditFlow || isEditing;
            const isExpanded = expandedItems[key] ?? !isAccepted;
            return (
              <View key={key} style={styles.itemSelectableRow}>
                <View style={[styles.itemCard, styles.itemCardFlex, isAccepted ? styles.acceptedItemCard : null, isEditing ? styles.editingItemCard : null, isRemovedGhost ? styles.removedGhostItemCard : null]}>
                  <TouchableOpacity style={styles.itemAccordionHeader} onPress={() => toggleExpand(key)} activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemAccordionTitleRow}>
                        <Text style={styles.itemAccordionTitle} numberOfLines={1}>{it.description || `Item ${idx + 1}`}</Text>
                        {isRemovedGhost ? (
                          <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                        ) : isAccepted ? (
                          <View style={styles.acceptedBadge}><Text style={styles.acceptedBadgeText}>Accepted</Text></View>
                        ) : (
                          <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>
                        )}
                      </View>
                      <Text style={styles.itemAccordionMeta}>Qty {it.quantity || 1} x PHP {formatMoney(Number(it.unit_price || 0))}</Text>
                    </View>
                    <View style={styles.itemAccordionRight}>
                      {it.change_type === 'edited' ? (
                        <View style={styles.changeTypeBadge}><Text style={styles.changeTypeBadgeText}>Edited</Text></View>
                      ) : null}
                      {it.change_type === 'removed' || isRemovedGhost ? (
                        <View style={styles.changeTypeBadgeDanger}><Text style={styles.changeTypeBadgeDangerText}>Removed</Text></View>
                      ) : null}
                      <Text style={styles.itemAccordionTotal}>PHP {formatMoney(Number(it.quantity || 0) * Number(it.unit_price || 0))}</Text>
                      <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#AFAFAF" />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.itemAccordionBody}>
                    <View style={styles.itemCardTopRow}>
                      <Text style={styles.itemLabel}>Item Details</Text>
                      <View style={styles.itemActionRow}>
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
                      </View>
                    </View>

                    <TextInput
                      placeholder="Enter item description"
                      placeholderTextColor="#8E8E93"
                      value={it.description}
                      editable={isEditable && !isRemovedGhost}
                      onChangeText={(t) => updateItem(idx, { description: t, change_type: String(it.status || '').toLowerCase() === 'accepted' ? 'edited' : it.change_type })}
                      style={[styles.itemNameInput, !isEditable ? styles.readonlyInput : null]}
                    />

                    <View style={styles.itemFieldsRow}>
                      <View style={styles.fieldCol}>
                        <Text style={styles.itemLabel}>Qty</Text>
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
                      </View>
                      <View style={styles.fieldCol}>
                        <Text style={styles.itemLabel}>Unit Price</Text>
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
                      </View>
                    </View>

                    <View style={styles.itemTotalRow}>
                      <Text style={styles.itemTotalLabel}>Line Total</Text>
                      <Text style={styles.itemTotalValue}>PHP {formatMoney(Number(it.quantity || 0) * Number(it.unit_price || 0))}</Text>
                    </View>
                    </View>
                  )}
                </View>

                {selectMode ? (
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

        <TouchableOpacity onPress={addItem} style={styles.addItemButtonSmall}>
          <FontAwesome name="plus" size={12} color="#D6D6D6" />
          <Text style={styles.addItemButtonSmallText}>Add Item</Text>
        </TouchableOpacity>

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

        <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Quotation</Text>}
        </TouchableOpacity>
      </ScrollView>

      {selectMode && selectedCount > 0 ? (
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

      <Modal visible={showSaveReviewModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Quotation Changes</Text>
            <Text style={styles.modalText}>Review the updates before sending this quotation request.</Text>

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
                  <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Item ${idx + 1}`}</Text>
                </View>
              ))}
              {changeBreakdown.edited.map(({ current: it, previous }, idx) => (
                <View key={`edited-${idx}`} style={styles.modalChangeItemBlock}>
                  <View style={styles.modalChangeItemRow}>
                    <Text style={styles.modalChangeTypeEdit}>EDITED</Text>
                    <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Item ${idx + 1}`}</Text>
                  </View>
                  {previous ? (
                    <>
                      <Text style={styles.modalChangeSubText}>Before: {previous.description || `Item ${idx + 1}`} • Qty {previous.quantity || 1} • PHP {formatMoney(Number(previous.unit_price || 0))}</Text>
                      <Text style={styles.modalChangeSubText}>After: {it.description || `Item ${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}</Text>
                    </>
                  ) : (
                    <Text style={styles.modalChangeSubText}>After: {it.description || `Item ${idx + 1}`} • Qty {it.quantity || 1} • PHP {formatMoney(Number(it.unit_price || 0))}</Text>
                  )}
                </View>
              ))}
              {changeBreakdown.removed.map(({ current: it }, idx) => (
                <View key={`removed-${idx}`} style={styles.modalChangeItemRow}>
                  <Text style={styles.modalChangeTypeDelete}>REMOVED</Text>
                  <Text style={styles.modalChangeItemText} numberOfLines={1}>{it.description || `Item ${idx + 1}`}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowSaveReviewModal(false)} disabled={saving}>
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
