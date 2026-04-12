import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { FeeBreakdown } from '@/utils/trafficutils';
import { PricingConfig } from '@/hooks/usePricing';

interface PriceSummarySheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  serviceType?: string;
  serviceAmount?: number;
  vehicleModel?: string;
  description?: string;
  locationAddress: string;
  radiusKm?: number;
  mechanicName?: string;
  shopName?: string;
  distanceKm?: number;
  distanceResolved?: boolean;
  showDistanceInDetails?: boolean;
  feeBreakdown: FeeBreakdown;
  pricingConfig: PricingConfig;
  serviceTypeItems?: string[];
  addOnItems?: string[];
}

const formatPeso = (value: number) => `\u20b1${value.toFixed(2)}`;

export default function PriceSummarySheet({
  visible,
  onClose,
  onConfirm,
  confirming = false,
  serviceType,
  serviceTypeItems,
  addOnItems,
  serviceAmount = 0,
  vehicleModel,
  description,
  locationAddress,
  radiusKm,
  mechanicName,
  shopName,
  distanceKm,
  distanceResolved = true,
  showDistanceInDetails = true,
  feeBreakdown,
  pricingConfig,
}: PriceSummarySheetProps) {
  const providerName = mechanicName || shopName;
  const hasStructuredItems = Boolean(serviceTypeItems?.length || addOnItems?.length);
  const serviceLines = useMemo(
    () => (serviceType ? serviceType.split(', ').map((item) => item.trim()).filter(Boolean) : []),
    [serviceType]
  );
  const serviceItems = useMemo(
    () => serviceLines.map((line) => {
      const match = line.match(/^(.*)\((\u20b1?[\d,]+(?:\.\d{1,2})?)\)$/);
      if (!match) {
        return { name: line, priceText: null };
      }
      const [, rawName, rawPrice] = match;
      return {
        name: rawName.trim(),
        priceText: rawPrice.startsWith('\u20b1') ? rawPrice : `\u20b1${rawPrice}`,
      };
    }),
    [serviceLines]
  );

  const feeView = useMemo(() => {
    const effectiveDistance = typeof distanceKm === 'number'
      ? Math.max(0, distanceKm)
      : (typeof radiusKm === 'number' ? Math.max(0, radiusKm / 2) : Math.max(0, feeBreakdown.distanceKm));

    const ratePerKm = Math.max(0, pricingConfig.price_per_km);
    const baseFee = Math.max(0, pricingConfig.base_distance_fee);
    const conveniencePercent = Math.max(0, pricingConfig.convenience_fee_percentage);
    const convenienceFixed = Math.max(0, pricingConfig.convenience_fee_fixed);

    const distanceFee = effectiveDistance * ratePerKm;
    const surchargeAmount = distanceFee * Math.max(0, feeBreakdown.traffic.surchargePercent);
    const serviceFee = Math.max(0, serviceAmount);
    const subtotal = serviceFee + baseFee + distanceFee + surchargeAmount;
    const convenienceFee = (subtotal * (conveniencePercent / 100)) + convenienceFixed;
    const totalFee = subtotal + convenienceFee;

    const minSubtotal = serviceFee + baseFee + distanceFee;
    const minTotal = minSubtotal + (minSubtotal * (conveniencePercent / 100)) + convenienceFixed;

    const maxSubtotal = serviceFee + baseFee + distanceFee + (distanceFee * 0.30);
    const maxTotal = maxSubtotal + (maxSubtotal * (conveniencePercent / 100)) + convenienceFixed;

    return {
      effectiveDistance,
      ratePerKm,
      serviceFee,
      baseFee,
      distanceFee,
      surchargeAmount,
      convenienceFee,
      totalFee,
      minTotal,
      maxTotal,
    };
  }, [distanceKm, radiusKm, feeBreakdown, pricingConfig, serviceAmount]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <ThemedText style={styles.title}>Request Summary</ThemedText>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Request Details</ThemedText>
              {!!serviceTypeItems?.length && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Service Type</ThemedText>
                  <View style={styles.serviceListWrap}>
                    {serviceTypeItems.map((item, index) => (
                      <ThemedText key={`service-type-item-${index}`} style={styles.detailValue}>{item}</ThemedText>
                    ))}
                  </View>
                </View>
              )}
              {!!addOnItems?.length && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Add-ons</ThemedText>
                  <View style={styles.serviceListWrap}>
                    {addOnItems.map((item, index) => (
                      <ThemedText key={`addon-item-${index}`} style={styles.detailValue}>{item}</ThemedText>
                    ))}
                  </View>
                </View>
              )}
              {!hasStructuredItems && !!serviceType && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Service Type</ThemedText>
                  {serviceItems.length > 0 ? (
                    <View style={styles.serviceListWrap}>
                      {serviceItems.map((item, index) => (
                        <View key={`service-item-${index}`} style={styles.serviceItemRow}>
                          <ThemedText style={styles.serviceItemName}>{item.name}</ThemedText>
                          {!!item.priceText && <ThemedText style={styles.serviceItemPrice}>{item.priceText}</ThemedText>}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ThemedText style={styles.detailValue}>{serviceType}</ThemedText>
                  )}
                </View>
              )}
              {!!vehicleModel && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Vehicle</ThemedText>
                  <ThemedText style={styles.detailValue}>{vehicleModel}</ThemedText>
                </View>
              )}
              {!!description && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Description</ThemedText>
                  <ThemedText style={styles.detailValue} numberOfLines={3}>{description}</ThemedText>
                </View>
              )}
              <View style={styles.detailBlock}>
                <ThemedText style={styles.detailLabel}>Location</ThemedText>
                <ThemedText style={styles.detailValue} numberOfLines={2}>{locationAddress}</ThemedText>
              </View>
              {!!providerName && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Provider</ThemedText>
                  <ThemedText style={styles.detailValue}>{providerName}</ThemedText>
                </View>
              )}
              {showDistanceInDetails && typeof distanceKm === 'number' && (
                <View style={styles.detailBlock}>
                  <ThemedText style={styles.detailLabel}>Distance</ThemedText>
                  <ThemedText style={styles.detailValue}>{distanceKm.toFixed(2)} km</ThemedText>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Price Estimate</ThemedText>
              <View style={styles.row}><ThemedText style={styles.label}>Service Price</ThemedText><ThemedText style={styles.value}>{formatPeso(feeView.serviceFee)}</ThemedText></View>
              <View style={styles.row}><ThemedText style={styles.label}>Base Fee</ThemedText><ThemedText style={styles.value}>{formatPeso(feeView.baseFee)}</ThemedText></View>
              <View style={styles.row}><ThemedText style={styles.label}>Distance Fee</ThemedText><ThemedText style={styles.value}>{formatPeso(feeView.distanceFee)}</ThemedText></View>
              <ThemedText style={styles.metaText}>
                {typeof radiusKm === 'number'
                  ? `(radius ${radiusKm.toFixed(1)} km -> median ${feeView.effectiveDistance.toFixed(2)} km \u00d7 ${formatPeso(feeView.ratePerKm)}/km)`
                  : (!distanceResolved
                    ? '(Location could not be determined)'
                    : `(${feeBreakdown.distanceKm.toFixed(2)} km \u00d7 ${formatPeso(feeView.ratePerKm)}/km)`) }
              </ThemedText>

              <View style={styles.row}>
                <ThemedText style={[styles.label, { color: feeBreakdown.traffic.color }]}>
                  Traffic Surcharge {feeBreakdown.traffic.emoji}
                </ThemedText>
                <ThemedText style={[styles.value, { color: feeBreakdown.traffic.color }]}>+{formatPeso(feeView.surchargeAmount)}</ThemedText>
              </View>
              <ThemedText style={styles.metaText}>{feeBreakdown.traffic.label} {feeBreakdown.traffic.surchargeLabel}</ThemedText>
              <ThemedText style={styles.metaText}>{feeBreakdown.traffic.timeNote}</ThemedText>

              <View style={styles.row}><ThemedText style={styles.label}>Convenience Fee</ThemedText><ThemedText style={styles.value}>{formatPeso(feeView.convenienceFee)}</ThemedText></View>
              <ThemedText style={styles.metaText}>
                ({pricingConfig.convenience_fee_percentage.toFixed(2)}% + {formatPeso(pricingConfig.convenience_fee_fixed)})
              </ThemedText>

              <View style={styles.divider} />
              <View style={styles.row}><ThemedText style={styles.totalLabel}>TOTAL ESTIMATE</ThemedText><ThemedText style={styles.totalValue}>{formatPeso(feeView.totalFee)}</ThemedText></View>
              <ThemedText style={styles.rangeText}>Range: {formatPeso(feeView.minTotal)} - {formatPeso(feeView.maxTotal)}</ThemedText>
              <ThemedText style={styles.disclaimer}>
                This is an estimate. Final fee may vary based on actual traffic and distance confirmed by your mechanic.
              </ThemedText>
            </View>
          </ScrollView>

          <View style={styles.buttonWrap}>
            <TouchableOpacity style={styles.editButton} onPress={onClose} activeOpacity={0.8}>
              <ThemedText style={styles.editButtonText}>Edit Request</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmButton, confirming && styles.disabledButton]} onPress={onConfirm} disabled={confirming} activeOpacity={0.8}>
              {confirming ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.confirmButtonText}>Confirm & Submit</ThemedText>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
    maxHeight: '88%',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4D50',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#ECEDEE',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 48,
  },
  content: {
    maxHeight: 480,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#111214',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTitle: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  detailBlock: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  detailLabel: {
    color: '#A1A3A8',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  serviceListWrap: {
    gap: 8,
  },
  serviceItemRow: {
    backgroundColor: '#17191C',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  serviceItemName: {
    flex: 1,
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  serviceItemPrice: {
    color: '#FFB257',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: '#8E8E93',
    fontSize: 13,
    paddingRight: 10,
    flex: 1,
  },
  value: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  metaText: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2C2E',
    marginVertical: 8,
  },
  totalLabel: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  totalValue: {
    color: '#FF8C00',
    fontSize: 18,
    fontWeight: '800',
  },
  rangeText: {
    marginTop: 6,
    color: '#AAB1BB',
    fontSize: 12,
  },
  disclaimer: {
    marginTop: 8,
    color: '#8E8E93',
    fontSize: 11,
    lineHeight: 16,
  },
  buttonWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  editButton: {
    borderWidth: 1,
    borderColor: '#ECEDEE',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#ECEDEE',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
