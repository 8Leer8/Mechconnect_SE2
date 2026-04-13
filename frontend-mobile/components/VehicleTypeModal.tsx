import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { VEHICLE_TYPES, getVehicleBrands, getVehicleModels } from '@/lib/vehicleOptions';

type SelectorField = 'type' | 'brand' | 'model';

type VehicleTypeModalProps = {
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  onVehicleTypeChange: (value: string) => void;
  onVehicleBrandChange: (value: string) => void;
  onVehicleModelChange: (value: string) => void;
  disabled?: boolean;
};

export default function VehicleTypeModal({
  vehicleType,
  vehicleBrand,
  vehicleModel,
  onVehicleTypeChange,
  onVehicleBrandChange,
  onVehicleModelChange,
  disabled = false,
}: VehicleTypeModalProps) {
  const [activeField, setActiveField] = useState<SelectorField | null>(null);

  const brandOptions = useMemo(() => (vehicleType ? getVehicleBrands(vehicleType) : []), [vehicleType]);
  const modelOptions = useMemo(
    () => (vehicleType && vehicleBrand ? getVehicleModels(vehicleType, vehicleBrand) : []),
    [vehicleType, vehicleBrand]
  );

  const options = useMemo(() => {
    if (activeField === 'type') return VEHICLE_TYPES;
    if (activeField === 'brand') return brandOptions;
    if (activeField === 'model') return modelOptions;
    return [];
  }, [activeField, brandOptions, modelOptions]);

  const openField = (field: SelectorField) => {
    if (disabled) return;
    if (field === 'brand' && !vehicleType) return;
    if (field === 'model' && (!vehicleType || !vehicleBrand)) return;
    setActiveField(field);
  };

  const closeModal = () => setActiveField(null);

  const handleSelect = (value: string) => {
    if (activeField === 'type') {
      onVehicleTypeChange(value);
      onVehicleBrandChange('');
      onVehicleModelChange('');
    } else if (activeField === 'brand') {
      onVehicleBrandChange(value);
      onVehicleModelChange('');
    } else if (activeField === 'model') {
      onVehicleModelChange(value);
    }
    closeModal();
  };

  const modalTitle =
    activeField === 'type'
      ? 'Select Vehicle Type'
      : activeField === 'brand'
      ? 'Select Brand'
      : 'Select Model';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.fieldButton, disabled && styles.fieldDisabled]}
        onPress={() => openField('type')}
        activeOpacity={0.75}
      >
        <View>
          <ThemedText style={styles.fieldLabel}>Vehicle Type *</ThemedText>
          <ThemedText style={[styles.fieldValue, !vehicleType && styles.placeholder]}>
            {vehicleType || 'Select vehicle type'}
          </ThemedText>
        </View>
        <FontAwesome name="chevron-down" size={12} color="#FF8C00" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.fieldButton, (!vehicleType || disabled) && styles.fieldDisabled]}
        onPress={() => openField('brand')}
        activeOpacity={0.75}
      >
        <View>
          <ThemedText style={styles.fieldLabel}>Brand *</ThemedText>
          <ThemedText style={[styles.fieldValue, !vehicleBrand && styles.placeholder]}>
            {vehicleBrand || 'Select brand'}
          </ThemedText>
        </View>
        <FontAwesome name="chevron-down" size={12} color="#FF8C00" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.fieldButton, (!vehicleBrand || disabled) && styles.fieldDisabled]}
        onPress={() => openField('model')}
        activeOpacity={0.75}
      >
        <View>
          <ThemedText style={styles.fieldLabel}>Model *</ThemedText>
          <ThemedText style={[styles.fieldValue, !vehicleModel && styles.placeholder]}>
            {vehicleModel || 'Select model'}
          </ThemedText>
        </View>
        <FontAwesome name="chevron-down" size={12} color="#FF8C00" />
      </TouchableOpacity>

      <Modal visible={!!activeField} animationType="fade" transparent onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{modalTitle}</ThemedText>
              <TouchableOpacity onPress={closeModal}>
                <FontAwesome name="times" size={18} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {options.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.optionButton}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.75}
                >
                  <ThemedText style={styles.optionText}>{item}</ThemedText>
                </TouchableOpacity>
              ))}
              {options.length === 0 && (
                <View style={styles.emptyState}>
                  <ThemedText style={styles.emptyText}>No options available</ThemedText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  fieldButton: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldDisabled: {
    opacity: 0.45,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    color: '#ECEDEE',
    maxWidth: 260,
  },
  placeholder: {
    color: '#8E8E93',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#151719',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  optionsList: {
    maxHeight: 420,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#242628',
  },
  optionText: {
    color: '#ECEDEE',
    fontSize: 14,
  },
  emptyState: {
    paddingHorizontal: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#8E8E93',
  },
});
