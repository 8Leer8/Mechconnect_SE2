import React, { useState } from 'react';
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
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { TopNav } from '@/components/navigation';

interface Product {
  id: number;
  name: string;
  price: string;
  description: string;
}

export default function ShopOwnerShop() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  const handleAddProduct = () => {
    const trimmedName = name.trim();
    const trimmedPrice = price.trim();

    if (!trimmedName || !trimmedPrice) {
      setError('Please enter a product name and price.');
      return;
    }

    const newProduct: Product = {
      id: Date.now(),
      name: trimmedName,
      price: trimmedPrice,
      description: description.trim(),
    };

    setProducts((prev) => [newProduct, ...prev]);
    setName('');
    setPrice('');
    setDescription('');
    setError(null);
  };

  const handleRemoveProduct = (id: number) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <ThemedText style={styles.title}>Shop</ThemedText>
            <ThemedText style={styles.subtitle}>Add and manage your products</ThemedText>
          </View>

          {/* Add Product Form */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <FontAwesome name="shopping-bag" size={18} color="#FF9500" />
              </View>
              <ThemedText style={styles.cardTitle}>Add Product</ThemedText>
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

            {error && (
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={handleAddProduct}
            >
              <FontAwesome name="plus" size={14} color="#fff" />
              <ThemedText style={styles.primaryButtonText}>Add Product</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Local product list (temporary) */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>My Products</ThemedText>
            {products.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <FontAwesome name="archive" size={20} color="#FF9500" />
                </View>
                <ThemedText style={styles.emptyTitle}>No products yet</ThemedText>
                <ThemedText style={styles.emptySubtitle}>
                  Start by adding a product above. This is a temporary list for now.
                </ThemedText>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#888',
  },
  header: {
    marginBottom: 18,
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
