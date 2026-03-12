import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/bookingDetailsStyles';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function QuotationEdit() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [items, setItems] = useState<Array<any>>([]);
  
  const borderColor = useThemeColor({ light: '#eee', dark: '#2a2a2a' }, 'icon');
  const cardBackground = useThemeColor({ light: '#fff', dark: '#1a1a1a' }, 'background');
  const actionTint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const placeholderColor = useThemeColor({ light: '#9B9B9B', dark: '#6B6B6B' }, 'icon');
  const removeColor = useThemeColor({ light: '#FF3B30', dark: '#FF6B6B' }, 'tint');
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
        setItems((data.items || []).map((it: any) => ({ description: it.description || '', quantity: it.quantity || 1, unit_price: Number(it.unit_price || 0), service: it.service || null, service_add_on: it.service_add_on || null })));
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

  if (loading) return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Edit Quotation</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ padding: 24 }}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Edit Quotation</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ padding: 16 }}>
        <ThemedText style={{ marginBottom: 8 }}>Notes</ThemedText>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Notes for client" style={{ borderWidth: 1, borderColor: borderColor, padding: 8, borderRadius: 6, marginBottom: 12, backgroundColor: cardBackground }} multiline />

        <ThemedText style={{ marginBottom: 8 }}>Items</ThemedText>
        {items.map((it, idx) => (
          <View key={idx} style={{ borderWidth: 1, borderColor: borderColor, padding: 8, borderRadius: 6, marginBottom: 8, backgroundColor: cardBackground }}>
            <TextInput placeholder="Description" placeholderTextColor={placeholderColor} value={it.description} onChangeText={(t) => updateItem(idx, { description: t })} style={{ borderBottomWidth: 1, borderColor: borderColor, marginBottom: 8, color: textColor }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholder="Qty" placeholderTextColor={placeholderColor} value={String(it.quantity)} keyboardType="numeric" onChangeText={(t) => updateItem(idx, { quantity: Number(t || 0) })} style={{ flex: 1, borderWidth: 1, borderColor: borderColor, padding: 8, borderRadius: 6, color: textColor }} />
              <TextInput placeholder="Unit price" placeholderTextColor={placeholderColor} value={String(it.unit_price)} keyboardType="numeric" onChangeText={(t) => updateItem(idx, { unit_price: Number(t || 0) })} style={{ flex: 1, borderWidth: 1, borderColor: borderColor, padding: 8, borderRadius: 6, color: textColor }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <TouchableOpacity onPress={() => removeItem(idx)} style={{ padding: 8 }}>
                <ThemedText style={{ color: removeColor }}>Remove</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addItem} style={{ padding: 12, backgroundColor: cardBackground, borderRadius: 6, marginBottom: 16, borderWidth: 1, borderColor: borderColor }}>
          <ThemedText style={{ color: actionTint }}>+ Add item</ThemedText>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <ThemedText>Mark as final</ThemedText>
          <TouchableOpacity onPress={() => setIsFinal(v => !v)} style={{ padding: 8 }}>
            <FontAwesome name={isFinal ? 'check-square' : 'square-o'} size={20} color={isFinal ? '#34C759' : '#8E8E93'} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleSave} style={[styles.finishLargeButton, { alignItems: 'center' }]} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>Save Quotation</ThemedText>}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}
