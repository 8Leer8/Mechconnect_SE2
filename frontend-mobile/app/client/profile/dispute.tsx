import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type DisputeItem = {
	id: number;
	booking_id: number;
	booking_status: string;
	booking_dispute_status: string;
	status: string;
	issue_description: string;
	amount_refunded?: number | null;
	created_at?: string;
	resolved_at?: string | null;
};

export default function MyDisputesScreen() {
	const [items, setItems] = useState<DisputeItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchDisputes = useCallback(async () => {
		try {
			setError(null);
			const response = await fetch(`${API_URL}/bookings/disputes/my/`, {
				method: 'GET',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
			});

			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error((data as any)?.error || 'Failed to load disputes');
			}

			setItems(Array.isArray((data as any).results) ? (data as any).results : []);
		} catch (err: any) {
			setError(err?.message || 'Failed to load disputes');
			setItems([]);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchDisputes();
	}, [fetchDisputes]);

	const onRefresh = () => {
		setRefreshing(true);
		fetchDisputes();
	};

	const statusColor = (value: string) => {
		const s = String(value || '').toLowerCase();
		if (s === 'pending' || s === 'active') return '#FF9500';
		if (s === 'refunded') return '#007AFF';
		if (s === 'solved' || s === 'resolved') return '#34C759';
		return '#8E8E93';
	};

	const formatDate = (value?: string | null) => {
		if (!value) return '-';
		try {
			return new Date(value).toLocaleString();
		} catch {
			return value;
		}
	};

	return (
		<ThemedView style={{ flex: 1, backgroundColor: '#111214' }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14 }}>
				<TouchableOpacity
					style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF8C0015', marginRight: 10 }}
					onPress={() => router.back()}
				>
					<FontAwesome name="chevron-left" size={15} color="#FF8C00" />
				</TouchableOpacity>
				<View style={{ flex: 1 }}>
					<ThemedText style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>My Disputes</ThemedText>
					<ThemedText style={{ color: '#8E8E93', marginTop: 2 }}>{items.length} case{items.length === 1 ? '' : 's'}</ThemedText>
				</View>
			</View>

			{loading ? (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
					<ActivityIndicator size="large" color="#FF8C00" />
					<ThemedText style={{ color: '#8E8E93' }}>Loading disputes...</ThemedText>
				</View>
			) : error ? (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
					<FontAwesome name="exclamation-circle" size={44} color="#FF3B30" />
					<ThemedText style={{ color: '#FF3B30', marginTop: 10, textAlign: 'center' }}>{error}</ThemedText>
					<TouchableOpacity
						style={{ marginTop: 14, borderRadius: 10, backgroundColor: '#FF8C00', paddingVertical: 10, paddingHorizontal: 18 }}
						onPress={fetchDisputes}
					>
						<ThemedText style={{ color: '#fff', fontWeight: '700' }}>Retry</ThemedText>
					</TouchableOpacity>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 6 }}
					refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
					showsVerticalScrollIndicator={false}
				>
					{items.length === 0 ? (
						<View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
							<FontAwesome name="flag-o" size={40} color="#666" />
							<ThemedText style={{ color: '#A0A0A0', marginTop: 12 }}>No disputes yet</ThemedText>
						</View>
					) : (
						items.map((item) => (
							<TouchableOpacity
								key={item.id}
								style={{
									backgroundColor: '#1A1C1E',
									borderRadius: 14,
									borderWidth: 1,
									borderColor: '#2A2C2E',
									padding: 14,
									marginBottom: 10,
								}}
								activeOpacity={0.8}
								onPress={() =>
									router.push({
										pathname: '/client/profile/booking-details/[id]',
										params: { id: String(item.booking_id) },
									})
								}
							>
								<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
									<ThemedText style={{ color: '#fff', fontWeight: '700' }}>Booking #{item.booking_id}</ThemedText>
									<View style={{ backgroundColor: `${statusColor(item.status)}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
										<ThemedText style={{ color: statusColor(item.status), fontSize: 11, fontWeight: '700' }}>
											{String(item.status || '').toUpperCase()}
										</ThemedText>
									</View>
								</View>

								<ThemedText style={{ color: '#D4D4D8', marginBottom: 8 }} numberOfLines={2}>
									{item.issue_description}
								</ThemedText>

								<View style={{ gap: 4 }}>
									<ThemedText style={{ color: '#8E8E93', fontSize: 12 }}>Created: {formatDate(item.created_at)}</ThemedText>
									<ThemedText style={{ color: '#8E8E93', fontSize: 12 }}>Resolved: {formatDate(item.resolved_at)}</ThemedText>
									{item.amount_refunded != null ? (
										<ThemedText style={{ color: '#34C759', fontSize: 12, fontWeight: '700' }}>
											Refunded: ₱{Number(item.amount_refunded || 0).toFixed(2)}
										</ThemedText>
									) : null}
								</View>
							</TouchableOpacity>
						))
					)}
				</ScrollView>
			)}
		</ThemedView>
	);
}
