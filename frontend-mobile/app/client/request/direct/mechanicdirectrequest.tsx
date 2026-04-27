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
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, usePathname } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import VehicleTypeModal from '@/components/VehicleTypeModal';
import PriceSummarySheet from '@/components/PriceSummarySheet';
import { useNotification } from '@/hooks/useNotification';
import { usePricing } from '@/hooks/usePricing';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { reverseGeocodeAddress } from '@/lib/locationAddress';
import { useLocation } from '@/context/LocationContext';
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

	const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
	const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);
	const [addonsByServiceId, setAddonsByServiceId] = useState<Record<string, AddOn[]>>({});
	const [addonsLoadingKey, setAddonsLoadingKey] = useState<string | null>(null);
	const [selectedAddOnsByService, setSelectedAddOnsByService] = useState<Record<string, number[]>>({});
	const [vehicleType, setVehicleType] = useState('');
	const [vehicleBrand, setVehicleBrand] = useState('');
	const [vehicleModel, setVehicleModel] = useState('');

	const [availableServices, setAvailableServices] = useState<Service[]>([]);

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
	const loadedAddonsRef = useRef<Set<string>>(new Set());
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
				setSelectedServiceIds([]);
				setExpandedServiceId(null);
				setAddonsByServiceId({});
				setSelectedAddOnsByService({});
				loadedAddonsRef.current = new Set();
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
					loadedAddonsRef.current = new Set();
					setAddonsByServiceId({});
					setSelectedServiceIds([]);
					setExpandedServiceId(null);
					setSelectedAddOnsByService({});
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

		const load = async () => {
			if (!expandedServiceId || !selectedProviderId) {
				return;
			}
			const key = String(expandedServiceId);
			if (loadedAddonsRef.current.has(key)) {
				return;
			}

			setAddonsLoadingKey(key);
			try {
				const providerQuery = `?provider_id=${selectedProviderId}&provider_type=mechanic`;
				const response = await fetch(
					`${API_URL}/bookings/direct/services/${expandedServiceId}/addons/${providerQuery}`,
					{ credentials: 'include' }
				);
				if (cancelled) return;

				const data = (await response.json()) as AddOnsResponse;
				const list = response.ok ? data.add_ons || [] : [];
				if (!cancelled) {
					loadedAddonsRef.current.add(key);
					setAddonsByServiceId((prev) => ({ ...prev, [key]: list }));
				}
			} catch {
				if (!cancelled) {
					loadedAddonsRef.current.add(key);
					setAddonsByServiceId((prev) => ({ ...prev, [key]: [] }));
				}
			} finally {
				if (!cancelled) {
					setAddonsLoadingKey((cur) => (cur === key ? null : cur));
				}
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, [expandedServiceId, selectedProviderId]);

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
			const permission = await ensureForegroundLocationAccess();
			if (!isMountedRef.current) return;

			if (!permission.granted) {
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
				setCurrentBarangay(parsed.barangay || '');
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

	const toggleServiceSelected = (serviceId: number) => {
		setSelectedServiceIds((prev) => {
			if (prev.includes(serviceId)) {
				const key = String(serviceId);
				setSelectedAddOnsByService((m) => {
					const copy = { ...m };
					delete copy[key];
					return copy;
				});
				return prev.filter((id) => id !== serviceId);
			}
			return [...prev, serviceId];
		});
	};

	const toggleExpandService = (serviceId: number) => {
		setExpandedServiceId((cur) => (cur === serviceId ? null : serviceId));
	};

	const toggleAddOnForService = (serviceId: number, addOnId: number) => {
		const key = String(serviceId);
		setSelectedAddOnsByService((prev) => {
			const list = prev[key] || [];
			const nextList = list.includes(addOnId) ? list.filter((id) => id !== addOnId) : [...list, addOnId];
			return { ...prev, [key]: nextList };
		});
	};

	const totalPrice = useMemo(() => {
		let total = 0;
		for (const sid of selectedServiceIds) {
			const svc = availableServices.find((s) => s.id === sid);
			if (svc) total += svc.price;
			const key = String(sid);
			const addonList = addonsByServiceId[key] || [];
			const picked = selectedAddOnsByService[key] || [];
			for (const aid of picked) {
				const addOn = addonList.find((a) => a.id === aid);
				if (addOn) total += addOn.price;
			}
		}
		return total;
	}, [selectedServiceIds, selectedAddOnsByService, availableServices, addonsByServiceId]);

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

		if (selectedServiceIds.length === 0) {
			showNotification({ type: 'error', message: 'Please select at least one service' });
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
			const service_lines = selectedServiceIds.map((sid) => ({
				service_id: sid,
				add_on_ids: selectedAddOnsByService[String(sid)] || [],
			}));

			const requestData = {
				provider_id: selectedProviderId,
				service_lines,
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

		if (selectedServiceIds.length === 0) {
			showNotification({ type: 'error', message: 'Please select at least one service' });
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

	const selectedServicesOrdered = useMemo(
		() =>
			selectedServiceIds
				.map((id) => availableServices.find((s) => s.id === id))
				.filter((s): s is Service => Boolean(s)),
		[selectedServiceIds, availableServices]
	);

	const serviceTypeItems = useMemo(
		() => selectedServicesOrdered.map((s) => `${s.name} (₱${s.price.toFixed(2)})`),
		[selectedServicesOrdered]
	);

	const addOnItems = useMemo(() => {
		const lines: string[] = [];
		for (const sid of selectedServiceIds) {
			const key = String(sid);
			const svc = availableServices.find((s) => s.id === sid);
			const name = svc?.name || 'Service';
			const list = addonsByServiceId[key] || [];
			for (const aid of selectedAddOnsByService[key] || []) {
				const addOn = list.find((a) => a.id === aid);
				if (addOn) {
					lines.push(`${name} — ${addOn.name} (₱${addOn.price.toFixed(2)})`);
				}
			}
		}
		return lines;
	}, [selectedServiceIds, selectedAddOnsByService, addonsByServiceId, availableServices]);

	const combinedServiceDescription = useMemo(
		() =>
			selectedServicesOrdered
				.map((s) => (s.description || '').trim())
				.filter(Boolean)
				.join(' · '),
		[selectedServicesOrdered]
	);

	const flatSelectedAddOns = useMemo(() => {
		const out: AddOn[] = [];
		for (const sid of selectedServiceIds) {
			const list = addonsByServiceId[String(sid)] || [];
			for (const aid of selectedAddOnsByService[String(sid)] || []) {
				const a = list.find((x) => x.id === aid);
				if (a) out.push(a);
			}
		}
		return out;
	}, [selectedServiceIds, selectedAddOnsByService, addonsByServiceId]);
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
						<ThemedText style={styles.sectionTitle}>Available Services *</ThemedText>
					</View>
					{availableServices.length === 0 ? (
						<View style={styles.emptyCard}>
							<FontAwesome name="info-circle" size={14} color="#555" />
							<ThemedText style={styles.emptyText}>
								{selectedProviderId ? 'No services listed for this mechanic' : 'Choose a mechanic first'}
							</ThemedText>
						</View>
					) : (
						availableServices.map((service) => {
							const isSelected = selectedServiceIds.includes(service.id);
							const isExpanded = expandedServiceId === service.id;
							const key = String(service.id);
							const rowAddons = addonsByServiceId[key];
							const picked = selectedAddOnsByService[key] || [];
							const loadingRow = addonsLoadingKey === key;

							return (
								<View
									key={service.id}
									style={[styles.accordionCard, isSelected && styles.accordionHeaderSelected]}
								>
									<View style={styles.accordionHeader}>
										<TouchableOpacity
											onPress={() => !disabled && toggleServiceSelected(service.id)}
											disabled={disabled}
											activeOpacity={0.7}
											style={styles.addOnCheck}
										>
											<FontAwesome
												name={isSelected ? 'check-square' : 'square-o'}
												size={20}
												color={isSelected ? '#FF8C00' : '#555'}
											/>
										</TouchableOpacity>
										<View style={styles.accordionTitleBlock}>
											<ThemedText style={[styles.accordionServiceName, disabled && styles.disabledText]}>
												{service.name}
											</ThemedText>
											<ThemedText style={[styles.accordionServicePrice, disabled && styles.disabledText]}>
												Base P{service.price.toFixed(2)}
											</ThemedText>
										</View>
										<TouchableOpacity
											style={styles.accordionChevronBtn}
											onPress={() => !disabled && toggleExpandService(service.id)}
											disabled={disabled}
											activeOpacity={0.7}
										>
											<FontAwesome
												name={isExpanded ? 'chevron-up' : 'chevron-down'}
												size={16}
												color="#FF8C00"
											/>
										</TouchableOpacity>
									</View>

									{isExpanded ? (
										<View style={styles.accordionBody}>
											{loadingRow && rowAddons === undefined ? (
												<ActivityIndicator color="#FF8C00" style={{ marginVertical: 12 }} />
											) : null}
											{!loadingRow && rowAddons !== undefined && rowAddons.length === 0 ? (
												<ThemedText style={styles.accordionHint}>No add-ons for this service</ThemedText>
											) : null}
											{rowAddons && rowAddons.length > 0
												? rowAddons.map((addOn) => (
														<TouchableOpacity
															key={addOn.id}
															style={[
																styles.addOnItem,
																picked.includes(addOn.id) && styles.addOnItemSelected,
																disabled && styles.disabledContainer,
															]}
															onPress={() => !disabled && toggleAddOnForService(service.id, addOn.id)}
															disabled={disabled}
															activeOpacity={0.7}
														>
															<View style={styles.addOnCheck}>
																<FontAwesome
																	name={picked.includes(addOn.id) ? 'check-square' : 'square-o'}
																	size={18}
																	color={picked.includes(addOn.id) ? '#FF8C00' : '#555'}
																/>
															</View>
															<View style={styles.addOnInfo}>
																<ThemedText style={[styles.addOnName, disabled && styles.disabledText]}>{addOn.name}</ThemedText>
																{!!addOn.category && (
																	<ThemedText style={[styles.addOnDescription, disabled && styles.disabledText]}>
																		{addOn.category}
																	</ThemedText>
																)}
																<ThemedText style={[styles.addOnDescription, disabled && styles.disabledText]}>
																	{addOn.description}
																</ThemedText>
															</View>
															<ThemedText style={[styles.addOnPrice, disabled && styles.disabledText]}>
																P{addOn.price.toFixed(2)}
															</ThemedText>
														</TouchableOpacity>
													))
												: null}
										</View>
									) : null}
								</View>
							);
						})
					)}
				</View>

				<View style={[styles.summaryCard, disabled && styles.disabledContainer]}>
					<View style={styles.sectionHeader}>
						<FontAwesome name="list-alt" size={14} color="#FF8C00" />
						<ThemedText style={styles.sectionTitle}>Summary</ThemedText>
					</View>
					{selectedServicesOrdered.map((svc) => (
						<View key={svc.id} style={styles.summaryRow}>
							<ThemedText style={styles.summaryLabel}>{svc.name}</ThemedText>
							<ThemedText style={styles.summaryValue}>P{svc.price.toFixed(2)}</ThemedText>
						</View>
					))}
					{flatSelectedAddOns.map((addOn) => (
						<View key={`${addOn.id}-${addOn.name}`} style={styles.summaryRow}>
							<ThemedText style={styles.summaryLabel}>{addOn.name}</ThemedText>
							<ThemedText style={styles.summaryValue}>P{addOn.price.toFixed(2)}</ThemedText>
						</View>
					))}
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
								<ThemedText style={styles.modalSummaryLabel}>Services</ThemedText>
								<ThemedText style={styles.modalSummaryValue}>
									{selectedServicesOrdered.map((s) => s.name).join(', ') || '-'}
								</ThemedText>
							</View>
							{flatSelectedAddOns.map((item) => (
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
					description={combinedServiceDescription}
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
