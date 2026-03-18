import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '../../../style/mechanic/quotation_edit';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type QuotationItem = {
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
  const [notes, setNotes] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [items, setItems] = useState<QuotationItem[]>([]);

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
          setNotes('');
          setIsFinal(false);
          return;
        }
        const data = await res.json();
        setNotes(data.notes || '');
        setIsFinal(!!data.is_final);
        setItems(
          (data.items || []).map((it: any) => ({
            description: it.description || '',
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            service: it.service || null,
            service_add_on: it.service_add_on || null,
          }))
        );
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
        // If direct request, use the service
        if (details.service && items.length === 0) {
          const svc = details.service;
          const unit = Number(svc.minimum_price || booking.amount_fee || 0);
          setItems([{ description: svc.name || 'Service', quantity: 1, unit_price: unit, service: svc.id }]);
        }
        // For broadcast, there may be services array
        if (details.services && Array.isArray(details.services) && items.length === 0) {
          const primary = details.services[0];
          const unit = Number(primary.minimum_price || booking.amount_fee || 0);
          setItems([{ description: primary.name || 'Service', quantity: 1, unit_price: unit, service: primary.id }]);
        }
      } catch (e) {
        // ignore
      }
    };
    prefillFromBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bookingId]);

  const updateItem = (index: number, patch: any) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0),
    [items]
  );
  const totalAmount = useMemo(() => subtotal, [subtotal]);

  const handleSave = async () => {
    if (!bookingId) return;
    setSaving(true);
    try {
      const payload = { notes, is_final: isFinal, items };
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
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes for client"
            placeholderTextColor="#8E8E93"
            style={styles.notesInput}
            multiline
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Line Items</Text>
        </View>

        {items.map((it, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemCardTopRow}>
              <Text style={styles.itemLabel}>Item Name</Text>
              <TouchableOpacity onPress={() => removeItem(idx)} style={styles.removeButton}>
                <FontAwesome name="trash" size={14} color="#FF6B6B" />
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Enter item description"
              placeholderTextColor="#8E8E93"
              value={it.description}
              onChangeText={(t) => updateItem(idx, { description: t })}
              style={styles.itemNameInput}
            />

            <View style={styles.itemFieldsRow}>
              <View style={styles.fieldCol}>
                <Text style={styles.itemLabel}>Qty</Text>
                <TextInput
                  placeholder="1"
                  placeholderTextColor="#8E8E93"
                  value={String(it.quantity)}
                  keyboardType="numeric"
                  onChangeText={(t) => updateItem(idx, { quantity: Math.max(1, Number(t || 1)) })}
                  style={styles.numericInput}
                />
              </View>
              <View style={styles.fieldCol}>
                <Text style={styles.itemLabel}>Unit Price</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor="#8E8E93"
                  value={String(it.unit_price)}
                  keyboardType="numeric"
                  onChangeText={(t) => updateItem(idx, { unit_price: Number(t || 0) })}
                  style={styles.numericInput}
                />
              </View>
            </View>

            <View style={styles.itemTotalRow}>
              <Text style={styles.itemTotalLabel}>Line Total</Text>
              <Text style={styles.itemTotalValue}>PHP {formatMoney(Number(it.quantity || 0) * Number(it.unit_price || 0))}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addItem} style={styles.addItemButton}>
          <FontAwesome name="plus" size={14} color="#FFFFFF" />
          <Text style={styles.addItemButtonText}>Add Item</Text>
        </TouchableOpacity>

        <View style={styles.finalToggleRow}>
          <Text style={styles.finalToggleText}>Mark as final quotation</Text>
          <TouchableOpacity onPress={() => setIsFinal(v => !v)} style={styles.finalToggleIconWrap}>
            <FontAwesome name={isFinal ? 'check-square' : 'square-o'} size={20} color={isFinal ? '#22C55E' : '#8E8E93'} />
          </TouchableOpacity>
        </View>

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
    </View>
  );
}
