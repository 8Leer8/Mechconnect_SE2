import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Modal,
	Platform,
	ScrollView,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import VehicleTypeModal from '@/components/VehicleTypeModal';
import PriceSummarySheet from '@/components/PriceSummarySheet';
import { useNotification } from '@/hooks/useNotification';
import { usePricing } from '@/hooks/usePricing';
import { reverseGeocodeAddress } from '@/lib/locationAddress';
import { useLocation } from '../main_request_form/LocationContext';
import { styles } from '@/style/client/mechanicDirectRequestStyles';
import { calculateBroadcastFee, FeeBreakdown } from '@/utils/trafficutils';
import { AddressFields, geocodeAddressFields, haversineDistance } from '@/utils/geocodeAddress';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Service {
	id: number;
	name: string;
	description?: string;
	price: number;
}

interface AddOn {
	id: number;
	name: string;
	description: string;
	category?: string | null;
	price: number;
}

interface ServicesResponse {
	services: Service[];
}

interface AddOnsResponse {
	add_ons: AddOn[];
}

interface CreateRequestResponse {
	message?: string;
	error?: string;
}

function parseParamInt(value: string | string[] | undefined): number | null {
	if (!value) return null;
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function toNumberOrNull(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Number.isNaN(value) ? null : value;
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function parseParamFloat(value: string | string[] | undefined): number | null {
	if (!value) return null;
	const raw = Array.isArray(value) ? value[0] : value;
	const parsed = Number.parseFloat(raw);
	return Number.isNaN(parsed) ? null : parsed;
}

function parseParamString(value: string | string[] | undefined): string | null {
	if (!value) return null;
	const raw = Array.isArray(value) ? value[0] : value;
	const clean = raw.trim();
	return clean.length ? clean : null;
}

export default function MechanicDirectRequestScreen() {
	const { showNotification } = useNotification();
	const { selectedLocation, setSelectedLocation } = useLocation();
	const { pricing, loading: pricingLoading } = usePricing();
	const pathname = usePathname();
	const params = useLocalSearchParams<{
		id?: string | string[];
		mechanicId?: string | string[];
		providerId?: string | string[];
		providerName?: string | string[];
		distance_km?: string | string[];
		street_name?: string | string[];
		subdivision_village?: string | string[];
		barangay?: string | string[];
		city_municipality?: string | string[];
		province?: string | string[];
		region?: string | string[];
		providerStreet?: string | string[];
		providerSubdivision?: string | string[];
		providerBarangay?: string | string[];
		providerCity?: string | string[];
		providerProvince?: string | string[];
		providerRegion?: string | string[];
	}>();

	const routeMechanicId = parseParamInt(params.mechanicId) ?? parseParamInt(params.id);
	const routeProviderId = parseParamInt(params.providerId) ?? routeMechanicId;
	const routeProviderName = Array.isArray(params.providerName)
		? params.providerName[0]
		: params.providerName;
	const routeDistanceKm = parseParamFloat(params.distance_km);
	const providerAddress: AddressFields = {
		street_name: parseParamString(params.street_name) ?? parseParamString(params.providerStreet),
		subdivision_village: parseParamString(params.subdivision_village) ?? parseParamString(params.providerSubdivision),
		barangay: parseParamString(params.barangay) ?? parseParamString(params.providerBarangay),
		city_municipality: parseParamString(params.city_municipality) ?? parseParamString(params.providerCity),
		province: parseParamString(params.province) ?? parseParamString(params.providerProvince),
		region: parseParamString(params.region) ?? parseParamString(params.providerRegion),
	};

	const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
	const [selectedAddOnIds, setSelectedAddOnIds] = useState<number[]>([]);
	const [vehicleType, setVehicleType] = useState('');
	const [vehicleBrand, setVehicleBrand] = useState('');
	const [vehicleModel, setVehicleModel] = useState('');

	const [availableServices, setAvailableServices] = useState<Service[]>([]);
	const [availableAddOns, setAvailableAddOns] = useState<AddOn[]>([]);

	const [loading, setLoading] = useState(false);
	const [calculatingFee, setCalculatingFee] = useState(false);

	const [useCurrentTime, setUseCurrentTime] = useState(true);
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [selectedTime, setSelectedTime] = useState(new Date());
	const [showDatePicker, setShowDatePicker] = useState(false);
	const [showTimePicker, setShowTimePicker] = useState(false);

	const [landmark, setLandmark] = useState('');
	const [currentLatitude, setCurrentLatitude] = useState<number | null>(null);
	const [currentLongitude, setCurrentLongitude] = useState<number | null>(null);
	const [currentAddress, setCurrentAddress] = useState('');
	const [currentStreetName, setCurrentStreetName] = useState('');
	const [currentSubdivision, setCurrentSubdivision] = useState('');
	const [currentBarangay, setCurrentBarangay] = useState('');
	const [currentCity, setCurrentCity] = useState('');
	const [isFetchingCurrentLocation, setIsFetchingCurrentLocation] = useState(false);
	const [currentLocationError, setCurrentLocationError] = useState<string | null>(null);
	const [locationMode, setLocationMode] = useState<'current' | 'map'>('current');
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [hasFetchedCurrentLocation, setHasFetchedCurrentLocation] = useState(false);
	const isNavigatingToMapRef = useRef(false);
	const [showSummary, setShowSummary] = useState(false);
	const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
	const [computedDistanceKm, setComputedDistanceKm] = useState<number | undefined>(undefined);
	const [distanceResolved, setDistanceResolved] = useState(true);
  const providerCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
	const isMountedRef = useRef(true);
	const isFetchingLocationRef = useRef(false);

	const selectedProviderId = routeProviderId;

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		providerCoordsRef.current = null;
	}, [
		providerAddress.street_name,
		providerAddress.subdivision_village,
		providerAddress.barangay,
		providerAddress.city_municipality,
		providerAddress.province,
		providerAddress.region,
	]);

	useEffect(() => {
		let cancelled = false;

		const fetchServices = async () => {
			if (!selectedProviderId) {
				setAvailableServices([]);
				setSelectedServiceId(null);
				return;
			}

			try {
				const response = await fetch(
					`${API_URL}/bookings/direct/mechanics/${selectedProviderId}/services/`,
					{ credentials: 'include' }
				);
				if (cancelled) return;

				const data = (await response.json()) as ServicesResponse;
				if (response.ok) {
					setAvailableServices(data.services || []);
					return;
				}

				setAvailableServices([]);
			} catch {
				if (!cancelled) {
					setAvailableServices([]);
				}
			}
		};

		fetchServices();
		return () => {
			cancelled = true;
		};
	}, [selectedProviderId]);

	useEffect(() => {
		let cancelled = false;

		const fetchAddOns = async () => {
			if (!selectedServiceId) {
				setAvailableAddOns([]);
				setSelectedAddOnIds([]);
				return;
			}

			try {
				const response = await fetch(
					`${API_URL}/bookings/direct/services/${selectedServiceId}/addons/`,
					{ credentials: 'include' }
				);
				if (cancelled) return;

				const data = (await response.json()) as AddOnsResponse;
				if (response.ok) {
					setAvailableAddOns(data.add_ons || []);
					return;
				}

				setAvailableAddOns([]);
			} catch {
				if (!cancelled) {
					setAvailableAddOns([]);
				}
			}
		};

		fetchAddOns();
		return () => {
			cancelled = true;
		};
	}, [selectedServiceId]);

	useFocusEffect(
		React.useCallback(() => {
			isNavigatingToMapRef.current = false;

			if (!selectedLocation) return;

			setCurrentLatitude(selectedLocation.latitude);
			setCurrentLongitude(selectedLocation.longitude);
			setCurrentStreetName(selectedLocation.streetName || 'Selected map location');
			setCurrentSubdivision('');
			setCurrentBarangay(selectedLocation.barangay || '');
			setCurrentCity(selectedLocation.city || '');
			setCurrentAddress(selectedLocation.address || 'Selected map location');
			setHasFetchedCurrentLocation(false);
			setSelectedLocation(null);
		}, [selectedLocation, setSelectedLocation])
	);

	const getMapRoutePath = () => {
		if (pathname.includes('main_request_form/mechanic-profile/_direct-request')) {
			return '/client/request/main_request_form/mechanic-profile/_direct-request/map';
		}

		if (pathname.includes('/client/booking/mechanic-profile/_direct-request')) {
			return '/client/booking/mechanic-profile/_direct-request/map';
		}

		if (pathname.includes('/client/mechanic/_direct-request')) {
			return '/client/mechanic/_direct-request/map';
		}

		return '/client/request/direct/map';
	};

	const fetchCurrentLocation = async () => {
		if (!selectedProviderId) return;
		if (isFetchingLocationRef.current) return;
		isFetchingLocationRef.current = true;

		if (isMountedRef.current) {
			setIsFetchingCurrentLocation(true);
			setCurrentLocationError(null);
		}

		try {
			const permission = await Location.requestForegroundPermissionsAsync();
			if (!isMountedRef.current) return;

			if (permission.status !== 'granted') {
				setCurrentLocationError('Location permission denied');
				Alert.alert(
					'Permission Denied',
					'Location permission is required to fetch your current location. Please enable it in Settings.'
				);
				return;
			}

			const locationPromise = Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.Balanced,
			});
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Location timeout')), 15000);
			});

			const position = await Promise.race([locationPromise, timeoutPromise]);
			if (!isMountedRef.current) return;

			if (
				!position ||
				!position.coords ||
				typeof position.coords.latitude !== 'number' ||
				typeof position.coords.longitude !== 'number'
			) {
				throw new Error('Invalid location data received');
			}

			const { latitude, longitude } = position.coords;
			setCurrentLatitude(latitude);
			setCurrentLongitude(longitude);
			setHasFetchedCurrentLocation(true);

			try {
				const parsed = await reverseGeocodeAddress(latitude, longitude);
				if (!isMountedRef.current) return;
				setCurrentStreetName(parsed.streetName || 'Current location');
				setCurrentSubdivision(parsed.subdivision || '');
				setCurrentBarangay(parsed.region || parsed.barangay || '');
				setCurrentCity(parsed.city || '');
				setCurrentAddress(parsed.address || 'Current location');
				setCurrentLocationError(null);
			} catch (geocodeErr) {
				console.warn('Reverse geocode failed:', geocodeErr);
			}
		} catch (error: any) {
			if (!isMountedRef.current) return;
			const isTimeout = error?.message === 'Location timeout';
			setCurrentLocationError('Unable to fetch current location');
			Alert.alert(
				'Location Error',
				isTimeout
					? 'Location is taking too long. Please try again or select location manually.'
					: 'Could not fetch your location. Please try again or select location on map.'
			);
			console.error('Fetch location error:', error);
		} finally {
			if (isMountedRef.current) {
				setIsFetchingCurrentLocation(false);
			}
			isFetchingLocationRef.current = false;
		}
	};

	const toggleAddOn = (addOnId: number) => {
		setSelectedAddOnIds((prev) =>
			prev.includes(addOnId) ? prev.filter((id) => id !== addOnId) : [...prev, addOnId]
		);
	};

	const totalPrice = useMemo(() => {
		let total = 0;

		if (selectedServiceId) {
			const selectedService = availableServices.find((service) => service.id === selectedServiceId);
			if (selectedService) total += selectedService.price;
		}

		selectedAddOnIds.forEach((addOnId) => {
			const addOn = availableAddOns.find((item) => item.id === addOnId);
			if (addOn) total += addOn.price;
		});

		return total;
	}, [selectedServiceId, selectedAddOnIds, availableServices, availableAddOns]);

	const handleSelectLocation = () => {
		if (isNavigatingToMapRef.current) return;
		isNavigatingToMapRef.current = true;

		const mapPath = getMapRoutePath();

		if (currentLatitude !== null && currentLongitude !== null) {
			router.push({
				pathname: mapPath,
				params: {
					latitude: currentLatitude.toString(),
					longitude: currentLongitude.toString(),
				},
			});
			return;
		}

		router.push(mapPath);
	};

	const onDateChange = (_event: any, date?: Date) => {
		setShowDatePicker(Platform.OS === 'ios');
		if (date) setSelectedDate(date);
	};

	const onTimeChange = (_event: any, time?: Date) => {
		setShowTimePicker(Platform.OS === 'ios');
		if (time) setSelectedTime(time);
	};

	const formatDateTime = () => {
		const dateStr = selectedDate.toLocaleDateString();
		const timeStr = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		return `${dateStr} ${timeStr}`;
	};

	const handleSend = async () => {
		if (!selectedProviderId) {
			showNotification({ type: 'error', message: 'Please select a mechanic' });
			return;
		}

		if (!selectedServiceId) {
			showNotification({ type: 'error', message: 'Please select a service' });
			return;
		}

		if (!vehicleType || !vehicleBrand || !vehicleModel) {
			showNotification({ type: 'error', message: 'Please select your vehicle type, brand, and model' });
			return;
		}

		if (!currentAddress || currentLatitude === null || currentLongitude === null) {
			if (locationMode === 'current') {
				showNotification({ type: 'error', message: 'Please fetch your current location first' });
			} else {
				showNotification({ type: 'error', message: 'Please select location from the map' });
			}
			return;
		}

		const scheduledDateTime = new Date(selectedDate);
		scheduledDateTime.setHours(selectedTime.getHours());
		scheduledDateTime.setMinutes(selectedTime.getMinutes());
		scheduledDateTime.setSeconds(0);
		scheduledDateTime.setMilliseconds(0);

		if (!useCurrentTime && scheduledDateTime.getTime() <= Date.now()) {
			showNotification({ type: 'error', message: 'Please choose a future date and time' });
			return;
		}

		setLoading(true);

		try {
			const requestData = {
				provider_id: selectedProviderId,
				service_id: selectedServiceId,
				add_on_ids: selectedAddOnIds,
				vehicle_type: vehicleType,
				vehicle_brand: vehicleBrand,
				vehicle_model: vehicleModel,
				service_location: {
					street_name: currentStreetName || 'Selected map location',
					subdivision_village: currentSubdivision || undefined,
					barangay: currentBarangay || 'N/A',
					city_municipality: currentCity || 'N/A',
					landmark: landmark || undefined,
					latitude: currentLatitude,
					longitude: currentLongitude,
				},
				scheduled_time: useCurrentTime ? new Date().toISOString() : scheduledDateTime.toISOString(),
			};

			const response = await fetch(`${API_URL}/bookings/direct/mechanic/create/`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(requestData),
			});

			const data = (await response.json()) as CreateRequestResponse;
			if (response.ok) {
				showNotification({ type: 'success', message: data.message || 'Request created successfully' });
				const targetMechanicId = routeMechanicId ?? selectedProviderId;
				router.replace({
					pathname: '/client/mechanic/mechanicprofile',
					params: { mechanicId: String(targetMechanicId) },
				});
				return;
			}

			showNotification({ type: 'error', message: data.error || 'Failed to create request' });
		} catch {
			showNotification({ type: 'error', message: 'An error occurred while creating the request' });
		} finally {
			setLoading(false);
		}
	};

	const handleOpenConfirm = async () => {
		if (!selectedProviderId) {
			showNotification({ type: 'error', message: 'Provider not found' });
			return;
		}

		if (!selectedServiceId) {
			showNotification({ type: 'error', message: 'Please select a service' });
			return;
		}

		if (!vehicleType || !vehicleBrand || !vehicleModel) {
			showNotification({ type: 'error', message: 'Please select your vehicle type, brand, and model' });
			return;
		}

		if (!currentAddress || currentLatitude === null || currentLongitude === null) {
			if (locationMode === 'current') {
				showNotification({ type: 'error', message: 'Please fetch your current location first' });
			} else {
				showNotification({ type: 'error', message: 'Please select location from the map' });
			}
			return;
		}

		const scheduledDateTime = new Date(selectedDate);
		scheduledDateTime.setHours(selectedTime.getHours());
		scheduledDateTime.setMinutes(selectedTime.getMinutes());
		scheduledDateTime.setSeconds(0);
		scheduledDateTime.setMilliseconds(0);

		if (!useCurrentTime && scheduledDateTime.getTime() <= Date.now()) {
			showNotification({ type: 'error', message: 'Please choose a future date and time' });
			return;
		}

		if (!pricing || pricingLoading) {
			showNotification({ type: 'warning', message: 'Pricing configuration is still loading. Please try again.' });
			return;
		}

		console.log('=== FEE DEBUG (MECHANIC) ===');
		console.log('Service coords:', { lat: currentLatitude, lng: currentLongitude });
		console.log('Provider address params:', {
			street_name: providerAddress.street_name,
			subdivision_village: providerAddress.subdivision_village,
			barangay: providerAddress.barangay,
			city_municipality: providerAddress.city_municipality,
			province: providerAddress.province,
			region: providerAddress.region,
		});

		setCalculatingFee(true);
		try {
			let distanceKm = 0;
			let resolved = false;

			if (currentLatitude !== null && currentLongitude !== null) {
				if (!providerCoordsRef.current) {
					providerCoordsRef.current = await geocodeAddressFields(providerAddress);
				}

				const providerCoords = providerCoordsRef.current;
				if (providerCoords) {
					distanceKm = haversineDistance(
						currentLatitude,
						currentLongitude,
						providerCoords.latitude,
						providerCoords.longitude
					);
					resolved = true;
				}
			}

			if (!resolved && routeDistanceKm !== null) {
				distanceKm = Math.max(0, routeDistanceKm);
			}

			setComputedDistanceKm(distanceKm);
			setDistanceResolved(resolved);
			setFeeBreakdown(calculateBroadcastFee(distanceKm));
			setShowSummary(true);
		} catch {
			setComputedDistanceKm(0);
			setDistanceResolved(false);
			setFeeBreakdown(calculateBroadcastFee(0));
			setShowSummary(true);
		} finally {
			setCalculatingFee(false);
		}
	};

	const selectedService = availableServices.find((service) => service.id === selectedServiceId);
	const selectedAddOns = selectedAddOnIds
		.map((addOnId) => availableAddOns.find((item) => item.id === addOnId))
		.filter((item): item is AddOn => Boolean(item));
	const serviceTypeItems = selectedService ? [`${selectedService.name} (₱${selectedService.price.toFixed(2)})`] : [];
	const addOnItems = selectedAddOns.map((item) => `${item.name} (₱${item.price.toFixed(2)})`);
	const locationActionLabel = hasFetchedCurrentLocation ? 'Try Again' : 'Fetch Current Location';
	const locationActionIcon = hasFetchedCurrentLocation ? 'refresh' : 'location-arrow';
	const disabled = !selectedProviderId;

	const handleBack = () => {
		if (router.canGoBack()) {
			router.back();
			return;
		}

		router.replace('/(clientTabs)/main/discover');
	};

	return (
		<ThemedView style={styles.container}>
			<View style={styles.header}>
				<TouchableOpacity style={styles.backBtn} onPress={handleBack}>
					<FontAwesome name="chevron-left" size={16} color="#FF8C00" />
				</TouchableOpacity>
				<ThemedText style={styles.headerTitle}>Mechanic Direct Request</ThemedText>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="user" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Provider</ThemedText>
					</View>
					<View style={styles.mechanicDisplayContainer}>
						<ThemedText style={styles.mechanicDisplayText}>
							{routeProviderName || 'Selected mechanic'}
						</ThemedText>
					</View>
				</View>

				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="car" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Vehicle Information *</ThemedText>
					</View>
					<VehicleTypeModal
						vehicleType={vehicleType}
						vehicleBrand={vehicleBrand}
						vehicleModel={vehicleModel}
						onVehicleTypeChange={setVehicleType}
						onVehicleBrandChange={setVehicleBrand}
						onVehicleModelChange={setVehicleModel}
						disabled={disabled}
					/>
				</View>

				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="cog" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Select Service *</ThemedText>
					</View>
					<View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
						<Picker
							enabled={!!selectedProviderId}
							selectedValue={selectedServiceId}
							onValueChange={(value) => {
								setSelectedServiceId(toNumberOrNull(value));
								setSelectedAddOnIds([]);
							}}
							style={[styles.picker, disabled && styles.disabledPicker]}
							dropdownIconColor={selectedProviderId ? '#FF8C00' : '#555'}
						>
							<Picker.Item label="Choose a service..." value={null} />
							{availableServices.map((service) => (
								<Picker.Item key={service.id} label={`${service.name} - P${service.price.toFixed(2)}`} value={service.id} />
							))}
						</Picker>
					</View>
				</View>

				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="plus-circle" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Add-ons</ThemedText>
					</View>
					{availableAddOns.length > 0 ? (
						availableAddOns.map((addOn) => (
							<TouchableOpacity
								key={addOn.id}
								style={[styles.addOnItem, selectedAddOnIds.includes(addOn.id) && styles.addOnItemSelected, disabled && styles.disabledContainer]}
								onPress={() => toggleAddOn(addOn.id)}
								disabled={disabled}
								activeOpacity={0.7}
							>
								<View style={styles.addOnCheck}>
									<FontAwesome
										name={selectedAddOnIds.includes(addOn.id) ? 'check-square' : 'square-o'}
										size={18}
										color={selectedAddOnIds.includes(addOn.id) ? '#FF8C00' : '#555'}
									/>
								</View>
								<View style={styles.addOnInfo}>
									<ThemedText style={[styles.addOnName, disabled && styles.disabledText]}>{addOn.name}</ThemedText>
									{!!addOn.category && (
										<ThemedText style={[styles.addOnDescription, disabled && styles.disabledText]}>{addOn.category}</ThemedText>
									)}
									<ThemedText style={[styles.addOnDescription, disabled && styles.disabledText]}>{addOn.description}</ThemedText>
								</View>
								<ThemedText style={[styles.addOnPrice, disabled && styles.disabledText]}>P{addOn.price.toFixed(2)}</ThemedText>
							</TouchableOpacity>
						))
					) : (
						<View style={styles.emptyCard}>
							<FontAwesome name="info-circle" size={14} color="#555" />
							<ThemedText style={styles.emptyText}>
								{selectedServiceId ? 'No add-ons available for this service' : 'Select a service to view add-ons'}
							</ThemedText>
						</View>
					)}
				</View>

				<View style={[styles.summaryCard, disabled && styles.disabledContainer]}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="list-alt" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Summary</ThemedText>
					</View>
					{selectedService && (
						<View style={styles.summaryRow}>
							<ThemedText style={styles.summaryLabel}>{selectedService.name}</ThemedText>
							<ThemedText style={styles.summaryValue}>P{selectedService.price.toFixed(2)}</ThemedText>
						</View>
					)}
					{selectedAddOnIds.map((addOnId) => {
						const addOn = availableAddOns.find((item) => item.id === addOnId);
						return addOn ? (
							<View key={addOn.id} style={styles.summaryRow}>
								<ThemedText style={styles.summaryLabel}>{addOn.name}</ThemedText>
								<ThemedText style={styles.summaryValue}>P{addOn.price.toFixed(2)}</ThemedText>
							</View>
						) : null;
					})}
					<View style={styles.summaryDivider} />
					<View style={styles.summaryRow}>
						<ThemedText style={styles.totalText}>Total</ThemedText>
						<ThemedText style={styles.totalPrice}>P{totalPrice.toFixed(2)}</ThemedText>
					</View>
				</View>

				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="clock-o" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
					</View>
					<View style={styles.pillRow}>
						<TouchableOpacity
							style={[styles.pill, useCurrentTime && styles.pillSelected, disabled && styles.disabledContainer]}
							onPress={() => {
								if (!selectedProviderId) return;
								setUseCurrentTime(true);
								setShowDatePicker(false);
								setShowTimePicker(false);
							}}
							disabled={disabled}
							activeOpacity={0.7}
						>
							<FontAwesome name="bolt" size={12} color={useCurrentTime ? '#fff' : '#8E8E93'} />
							<ThemedText style={[styles.pillText, useCurrentTime && styles.pillTextSelected]}>Now</ThemedText>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.pill, !useCurrentTime && styles.pillSelected, disabled && styles.disabledContainer]}
							onPress={() => selectedProviderId && setUseCurrentTime(false)}
							disabled={disabled}
							activeOpacity={0.7}
						>
							<FontAwesome name="calendar" size={12} color={!useCurrentTime ? '#fff' : '#8E8E93'} />
							<ThemedText style={[styles.pillText, !useCurrentTime && styles.pillTextSelected]}>Custom</ThemedText>
						</TouchableOpacity>
					</View>
					{!useCurrentTime && (
						<View style={styles.dateTimeContainer}>
							<TouchableOpacity
								style={[styles.dateTimeBtn, disabled && styles.disabledContainer]}
								onPress={() => selectedProviderId && setShowDatePicker(true)}
								disabled={disabled}
								activeOpacity={0.7}
							>
								<FontAwesome name="calendar-o" size={14} color="#FF8C00" />
								<ThemedText style={styles.dateTimeText}>{selectedDate.toLocaleDateString()}</ThemedText>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.dateTimeBtn, disabled && styles.disabledContainer]}
								onPress={() => selectedProviderId && setShowTimePicker(true)}
								disabled={disabled}
								activeOpacity={0.7}
							>
								<FontAwesome name="clock-o" size={14} color="#FF8C00" />
								<ThemedText style={styles.dateTimeText}>{selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</ThemedText>
							</TouchableOpacity>
							{showDatePicker && (
								<DateTimePicker
									value={selectedDate}
									mode="date"
									display="default"
									themeVariant="dark"
									onChange={onDateChange}
									minimumDate={new Date()}
								/>
							)}
							{showTimePicker && (
								<DateTimePicker
									value={selectedTime}
									mode="time"
									display="default"
									themeVariant="dark"
									onChange={onTimeChange}
								/>
							)}
							<ThemedText style={styles.selectedDateTimeLabel}>Selected: {formatDateTime()}</ThemedText>
						</View>
					)}
				</View>

				<View style={styles.section}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="map-marker" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Service Location *</ThemedText>
					</View>

					<View style={styles.pillRow}>
						<TouchableOpacity
							style={[
								styles.pill,
								locationMode === 'current' && styles.pillSelected,
								disabled && styles.disabledContainer,
							]}
							onPress={() => {
								if (disabled) return;
								setLocationMode('current');
								setCurrentLocationError(null);
							}}
							disabled={disabled}
							activeOpacity={0.7}
						>
							<FontAwesome name="location-arrow" size={12} color={locationMode === 'current' ? '#fff' : '#8E8E93'} />
							<ThemedText style={[styles.pillText, locationMode === 'current' && styles.pillTextSelected]}>
								Current Location
							</ThemedText>
						</TouchableOpacity>

						<TouchableOpacity
							style={[
								styles.pill,
								locationMode === 'map' && styles.pillSelected,
								disabled && styles.disabledContainer,
							]}
							onPress={() => {
								if (disabled) return;
								setLocationMode('map');
								setHasFetchedCurrentLocation(false);
								setCurrentLocationError(null);
							}}
							disabled={disabled}
							activeOpacity={0.7}
						>
							<FontAwesome name="map" size={12} color={locationMode === 'map' ? '#fff' : '#8E8E93'} />
							<ThemedText style={[styles.pillText, locationMode === 'map' && styles.pillTextSelected]}>
								Select Location
							</ThemedText>
						</TouchableOpacity>
					</View>

					{locationMode === 'current' ? (
						<View style={styles.pillRow}>
							<TouchableOpacity
								style={[styles.pill, disabled && styles.disabledContainer]}
								onPress={fetchCurrentLocation}
								disabled={disabled || isFetchingCurrentLocation}
								activeOpacity={0.7}
							>
								{isFetchingCurrentLocation ? (
									<ActivityIndicator color="#8E8E93" size="small" />
								) : (
									<FontAwesome name={locationActionIcon} size={12} color="#8E8E93" />
								)}
								<ThemedText style={styles.pillText}>{locationActionLabel}</ThemedText>
							</TouchableOpacity>
						</View>
					) : null}

					{currentLocationError ? (
						<ThemedText style={styles.emptyText}>{currentLocationError}</ThemedText>
					) : null}

					{locationMode === 'map' ? (
						<TouchableOpacity style={[styles.selectLocationBtn, disabled && styles.disabledContainer]} onPress={handleSelectLocation} disabled={disabled} activeOpacity={0.7}>
							<FontAwesome name="map" size={14} color="#FF8C00" />
							<ThemedText style={[styles.selectLocationText, currentAddress && { color: '#fff' }]}>
								{currentAddress || 'Select Location on Map'}
							</ThemedText>
							<FontAwesome name="chevron-right" size={12} color="#8E8E93" />
						</TouchableOpacity>
					) : null}

					{currentAddress ? (
						<View style={styles.currentLocationDisplayCard}>
							<View style={styles.summaryRow}>
								<ThemedText style={styles.summaryLabel}>Street</ThemedText>
								<ThemedText style={styles.summaryValue}>{currentStreetName || 'N/A'}</ThemedText>
							</View>
							<View style={styles.summaryRow}>
								<ThemedText style={styles.summaryLabel}>Region</ThemedText>
								<ThemedText style={styles.summaryValue}>{currentBarangay || 'N/A'}</ThemedText>
							</View>
							<View style={styles.summaryRow}>
								<ThemedText style={styles.summaryLabel}>City</ThemedText>
								<ThemedText style={styles.summaryValue}>{currentCity || 'N/A'}</ThemedText>
							</View>
							<View style={styles.summaryRow}>
								<ThemedText style={styles.summaryLabel}>Coordinates</ThemedText>
								<ThemedText style={styles.summaryValue}>{currentLatitude?.toFixed(6)}, {currentLongitude?.toFixed(6)}</ThemedText>
							</View>
						</View>
					) : null}

					{currentAddress ? (
						<TextInput
							style={[styles.input, { marginTop: 12 }, disabled && styles.disabledInput]}
							placeholder="Landmark (Optional)"
							placeholderTextColor="#555"
							value={landmark}
							onChangeText={setLandmark}
							editable={!disabled}
						/>
					) : null}
				</View>

				<TouchableOpacity
					style={[styles.sendBtn, (disabled || loading || calculatingFee) && styles.sendBtnDisabled]}
					onPress={handleOpenConfirm}
					disabled={disabled || loading || calculatingFee}
					activeOpacity={0.7}
				>
					{loading || calculatingFee ? (
						<ActivityIndicator color="#fff" />
					) : (
						<>
							<FontAwesome name="paper-plane" size={16} color="#fff" />
							<ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
						</>
					)}
				</TouchableOpacity>

				<View style={{ height: 40 }} />
			</ScrollView>

			<Modal
				visible={confirmVisible}
				transparent
				animationType="fade"
				onRequestClose={() => !loading && setConfirmVisible(false)}
			>
				<View style={styles.modalBackdrop}>
					<View style={styles.modalCard}>
						<ThemedText style={styles.modalTitle}>Confirm Request</ThemedText>

						<View style={styles.modalSummarySection}>
							<View style={styles.modalSummaryRow}>
								<ThemedText style={styles.modalSummaryLabel}>Provider</ThemedText>
								<ThemedText style={styles.modalSummaryValue}>{routeProviderName || 'Selected mechanic'}</ThemedText>
							</View>
							<View style={styles.modalSummaryRow}>
								<ThemedText style={styles.modalSummaryLabel}>Service</ThemedText>
								<ThemedText style={styles.modalSummaryValue}>{selectedService?.name || '-'}</ThemedText>
							</View>
							{selectedAddOns.map((item) => (
								<View key={item.id} style={styles.modalSummaryRow}>
									<ThemedText style={styles.modalSummaryLabel}>{item.name}</ThemedText>
									<ThemedText style={styles.modalSummaryValue}>P{item.price.toFixed(2)}</ThemedText>
								</View>
							))}
							<View style={styles.modalSummaryRow}>
								<ThemedText style={styles.modalSummaryLabel}>Schedule</ThemedText>
								<ThemedText style={styles.modalSummaryValue}>
									{useCurrentTime ? 'Now' : formatDateTime()}
								</ThemedText>
							</View>
							<View style={styles.modalLocationBlock}>
								<ThemedText style={styles.modalSummaryLabel}>Location</ThemedText>
								<ThemedText style={styles.modalLocationValue}>{currentAddress || '-'}</ThemedText>
							</View>
							<View style={styles.summaryDivider} />
							<View style={styles.modalSummaryRow}>
								<ThemedText style={styles.totalText}>Total</ThemedText>
								<ThemedText style={styles.totalPrice}>P{totalPrice.toFixed(2)}</ThemedText>
							</View>
						</View>

						<View style={styles.modalActions}>
							<TouchableOpacity
								style={[styles.modalBtn, styles.modalCancelBtn]}
								onPress={() => setConfirmVisible(false)}
								disabled={loading}
							>
								<ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.modalBtn, styles.modalConfirmBtn, loading && styles.sendBtnDisabled]}
								onPress={async () => {
									setConfirmVisible(false);
									await handleSend();
								}}
								disabled={loading}
							>
								{loading ? (
									<ActivityIndicator color="#fff" size="small" />
								) : (
									<ThemedText style={styles.modalConfirmText}>Confirm</ThemedText>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</Modal>

			{showSummary && feeBreakdown && pricing ? (
				<PriceSummarySheet
					visible={showSummary}
					onClose={() => setShowSummary(false)}
					onConfirm={async () => {
						setShowSummary(false);
						await handleSend();
					}}
					confirming={loading}
					serviceTypeItems={serviceTypeItems}
					addOnItems={addOnItems}
					serviceAmount={totalPrice}
					vehicleModel={vehicleModel}
					description={selectedService?.description || ''}
					locationAddress={currentAddress || 'Selected map location'}
					mechanicName={routeProviderName || undefined}
					distanceKm={computedDistanceKm}
					distanceResolved={distanceResolved}
					showDistanceInDetails
					feeBreakdown={feeBreakdown}
					pricingConfig={pricing}
				/>
			) : null}
		</ThemedView>
	);
}
