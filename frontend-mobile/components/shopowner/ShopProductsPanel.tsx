import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Product {
  id: number;
  name: string;
  price: string;
  description: string;
}

export function ShopProductsPanel() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [availableServices, setAvailableServices] = useState<Array<{ service_id: number; name: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchMyServices = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/services/shop/my-services/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch your services');
      const data = await res.json();
      const servicesRaw = data?.services || [];
      const services = servicesRaw.map((s: any) => ({
        service_id: Number(s.id),
        name: String(s.name || ''),
      }));
      setAvailableServices(services);

      // Keep selected service valid when user switches accounts.
      setSelectedServiceId((prev) => {
        if (services.length === 0) return null;
        if (prev !== null && services.some((s) => s.service_id === prev)) return prev;
        return services[0].service_id;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load services');
      setAvailableServices([]);
      setSelectedServiceId(null);
      setProducts([]);
    }
  }, []);

  const fetchProducts = useCallback(async (serviceId: number) => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/services/shop/addons/?service_id=${serviceId}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      const addOns = (data?.add_ons || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        price: String(a.price),
        description: a.description || '',
      }));
      setProducts(addOns);
    } catch (e: any) {
      setError(e?.message || 'Failed to load products');
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    fetchMyServices();
  }, [fetchMyServices]);

  useEffect(() => {
    if (selectedServiceId !== null) {
      fetchProducts(selectedServiceId);
    } else {
      setProducts([]);
    }
  }, [selectedServiceId, fetchProducts]);

  const handleAddProduct = async () => {
    const trimmedName = name.trim();
    const trimmedPrice = price.trim();

    if (!selectedServiceId) {
      setError('Please select a service first.');
      return;
    }

    if (!trimmedName || !trimmedPrice) {
      setError('Please enter a product name and price.');
      return;
    }

    setError(null);
    try {
      const parsedPrice = Number(trimmedPrice);
      if (Number.isNaN(parsedPrice)) {
        setError('Price must be a valid number.');
        return;
      }

      const res = await fetch(`${API_URL}/services/shop/addons/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedServiceId,
          name: trimmedName,
          description: description.trim(),
          price: parsedPrice,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to add product');

      setName('');
      setPrice('');
      setDescription('');
      fetchProducts(selectedServiceId);
    } catch (e: any) {
      setError(e?.message || 'Failed to add product');
    }
  };

  const handleRemoveProduct = async (id: number) => {
    if (!selectedServiceId) return;
    setError(null);
    try {
      const res = await fetch(`${API_URL}/services/shop/addons/remove/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_add_on_id: id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to remove product');
      fetchProducts(selectedServiceId);
    } catch (e: any) {
      setError(e?.message || 'Failed to remove product');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <FontAwesome name="shopping-bag" size={18} color="#FF9500" />
            </View>
            <ThemedText style={styles.cardTitle}>Add Product</ThemedText>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Service *</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                enabled={availableServices.length > 0}
                selectedValue={
                  selectedServiceId !== null && availableServices.some((s) => s.service_id === selectedServiceId)
                    ? selectedServiceId
                    : null
                }
                onValueChange={(value) => {
                  if (value === null) setSelectedServiceId(null);
                  else {
                    const next = Number(value);
                    if (Number.isFinite(next)) setSelectedServiceId(next);
                    else setSelectedServiceId(null);
                  }
                }}
                dropdownIconColor={selectedServiceId ? '#FF8C00' : '#555'}
                style={styles.picker}
              >
                <Picker.Item label="Choose a service..." value={null} />
                {availableServices.map((s) => (
                  <Picker.Item key={s.service_id} label={s.name} value={s.service_id} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Product name</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g. Engine Oil"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <ThemedText style={styles.label}>Price (₱)</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText style={styles.label}>Description</ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Short description of the product"
              placeholderTextColor="#666"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8} onPress={handleAddProduct}>
            <FontAwesome name="plus" size={14} color="#fff" />
            <ThemedText style={styles.primaryButtonText}>Add Product</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>My Products</ThemedText>
          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome name="archive" size={20} color="#FF9500" />
              </View>
              <ThemedText style={styles.emptyTitle}>No products yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>Add products for the selected service above.</ThemedText>
            </View>
          ) : (
            products.map((product) => (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productHeader}>
                  <ThemedText style={styles.productName}>{product.name}</ThemedText>
                  <View style={styles.productHeaderRight}>
                    <ThemedText style={styles.productPrice}>₱{product.price}</ThemedText>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveProduct(product.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <FontAwesome name="trash-o" size={16} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
                {product.description ? (
                  <ThemedText style={styles.productDescription} numberOfLines={2}>
                    {product.description}
                  </ThemedText>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252525',
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF950018',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  input: {
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
  },
  pickerContainer: {
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  picker: {
    color: '#fff',
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: '#FF3B30',
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  emptyState: {
    borderRadius: 16,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF950018',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  productCard: {
    backgroundColor: '#151515',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252525',
    padding: 14,
    marginTop: 8,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  productHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9500',
  },
  removeButton: {
    padding: 6,
  },
  productDescription: {
    fontSize: 12,
    color: '#ccc',
  },
});
