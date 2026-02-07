import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { styles } from '../../style/auth/registerStyles';

// For Android Emulator use: http://10.0.2.2:8000/api/users
// For iOS Simulator use: http://localhost:8000/api/users
// For Real Device: Get your IP with 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PSGC_API_BASE = 'https://psgc.gitlab.io/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    middlename: '',
    email: '',
    username: '',
    password: '',
    confirm_password: '',
    date_of_birth: '',
    gender: '',
    role: 'client',
    street_name: '',
    barangay: '',
    city_municipality: '',
    province: '',
    region: '',
    contact_number: '',
  });
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentStage, setCurrentStage] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const totalStages = 4;
  
  // Location data from PSGC API
  const [regions, setRegions] = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [barangays, setBarangays] = useState<any[]>([]);
  
  // Selected codes for cascading
  const [selectedRegionCode, setSelectedRegionCode] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState('');

  // Fetch regions on component mount
  useEffect(() => {
    fetchRegions();
  }, []);

  // Fetch provinces when region is selected
  useEffect(() => {
    if (selectedRegionCode) {
      fetchProvinces(selectedRegionCode);
      // Reset dependent fields
      setProvinces([]);
      setCities([]);
      setBarangays([]);
      setSelectedProvinceCode('');
      setSelectedCityCode('');
      updateField('province', '');
      updateField('city_municipality', '');
      updateField('barangay', '');
    }
  }, [selectedRegionCode]);

  // Fetch cities when province is selected
  useEffect(() => {
    if (selectedProvinceCode) {
      fetchCities(selectedProvinceCode);
      // Reset dependent fields
      setCities([]);
      setBarangays([]);
      setSelectedCityCode('');
      updateField('city_municipality', '');
      updateField('barangay', '');
    }
  }, [selectedProvinceCode]);

  // Fetch barangays when city is selected
  useEffect(() => {
    if (selectedCityCode) {
      fetchBarangays(selectedCityCode);
      // Reset dependent field
      setBarangays([]);
      updateField('barangay', '');
    }
  }, [selectedCityCode]);

  const fetchRegions = async () => {
    try {
      const response = await fetch(`${PSGC_API_BASE}/regions`);
      const data = await response.json();
      const sorted = data.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setRegions(sorted);
    } catch (error) {
      console.error('Error fetching regions:', error);
      Alert.alert('Error', 'Failed to load regions');
    }
  };

  const fetchProvinces = async (regionCode: string) => {
    try {
      const response = await fetch(`${PSGC_API_BASE}/regions/${regionCode}/provinces`);
      const data = await response.json();
      const sorted = data.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setProvinces(sorted);
    } catch (error) {
      console.error('Error fetching provinces:', error);
      Alert.alert('Error', 'Failed to load provinces');
    }
  };

  const fetchCities = async (provinceCode: string) => {
    try {
      const response = await fetch(`${PSGC_API_BASE}/provinces/${provinceCode}/cities-municipalities`);
      const data = await response.json();
      const sorted = data.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setCities(sorted);
    } catch (error) {
      console.error('Error fetching cities:', error);
      Alert.alert('Error', 'Failed to load cities/municipalities');
    }
  };

  const fetchBarangays = async (cityCode: string) => {
    try {
      const response = await fetch(`${PSGC_API_BASE}/cities-municipalities/${cityCode}/barangays`);
      const data = await response.json();
      const sorted = data.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setBarangays(sorted);
    } catch (error) {
      console.error('Error fetching barangays:', error);
      Alert.alert('Error', 'Failed to load barangays');
    }
  };

  const handleRegionChange = (name: string, code: string) => {
    setSelectedRegionCode(code);
    updateField('region', name);
  };

  const handleProvinceChange = (name: string, code: string) => {
    setSelectedProvinceCode(code);
    updateField('province', name);
  };

  const handleCityChange = (name: string, code: string) => {
    setSelectedCityCode(code);
    updateField('city_municipality', name);
  };

  const handleBarangayChange = (name: string) => {
    updateField('barangay', name);
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      updateField('date_of_birth', formattedDate);
    }
  };

  const handleRegister = async () => {
    // Basic validation
    if (!formData.firstname || !formData.lastname || !formData.email || 
        !formData.username || !formData.password || !formData.confirm_password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // Location validation
    if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) {
      Alert.alert('Error', 'Please select your complete address (Region, Province, City/Municipality, and Barangay)');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', 'Registration successful! Please login.', [
          { text: 'OK', onPress: () => router.replace('../(auth)/login' as any) }
        ]);
      } else {
        const errorMessages = Object.entries(data)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value[0] : value}`)
          .join('\n');
        Alert.alert('Error', errorMessages);
      }
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'Connection failed. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStage === 1) {
      if (!formData.firstname || !formData.lastname || !formData.email || !formData.username) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }
    } else if (currentStage === 2) {
      if (!formData.password || !formData.confirm_password) {
        Alert.alert('Error', 'Please fill in password fields');
        return;
      }
      if (formData.password !== formData.confirm_password) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    } else if (currentStage === 4) {
      if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) {
        Alert.alert('Error', 'Please select your complete address');
        return;
      }
    }
    setCurrentStage(prev => Math.min(prev + 1, totalStages));
  };

  const handlePrevious = () => {
    setCurrentStage(prev => Math.max(prev - 1, 1));
  };

  const getProgressWidth = () => {
    if (currentStage === 1) return 0;
    return ((currentStage - 1) / (totalStages - 1)) * 100;
  };

  const renderStepIndicator = (stepNum: number, label: string) => {
    const isActive = currentStage === stepNum;
    const isCompleted = currentStage > stepNum;
    
    return (
      <View key={stepNum} style={styles.stepContainer}>
        <View style={[
          styles.step,
          isActive && styles.stepActive,
          isCompleted && styles.stepCompleted
        ]}>
          <Text style={[
            styles.stepNumber,
            (isActive || isCompleted) && styles.stepNumberActive
          ]}>
            {stepNum}
          </Text>
        </View>
        <Text style={[
          styles.stepLabel,
          isActive && styles.stepLabelActive
        ]}>
          {label}
        </Text>
      </View>
    );
  };

  const renderStage = () => {
    switch (currentStage) {
      case 1:
        return (
          <>
            <Text style={styles.sectionTitle}>1. PERSONAL IDENTIFICATION</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>First Name <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter first name"
                  placeholderTextColor="#999"
                  value={formData.firstname}
                  onChangeText={(value) => updateField('firstname', value)}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Last Name <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter last name"
                  placeholderTextColor="#999"
                  value={formData.lastname}
                  onChangeText={(value) => updateField('lastname', value)}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Middle Name <Text style={styles.optional}>(Optional)</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter middle name (optional)"
                  placeholderTextColor="#999"
                  value={formData.middlename}
                  onChangeText={(value) => updateField('middlename', value)}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter email"
                  placeholderTextColor="#999"
                  value={formData.email}
                  onChangeText={(value) => updateField('email', value)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  placeholderTextColor="#999"
                  value={formData.username}
                  onChangeText={(value) => updateField('username', value)}
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </View>
          </>
        );

      case 2:
        return (
          <>
            <Text style={styles.sectionTitle}>2. SECURITY & AUTHENTICATION</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="#999"
                  value={formData.password}
                  onChangeText={(value) => updateField('password', value)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <FontAwesome 
                    name={showPassword ? "eye-slash" : "eye"} 
                    size={16} 
                    color="#6c757d" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor="#999"
                  value={formData.confirm_password}
                  onChangeText={(value) => updateField('confirm_password', value)}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity 
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <FontAwesome 
                    name={showConfirmPassword ? "eye-slash" : "eye"} 
                    size={16} 
                    color="#6c757d" 
                  />
                </TouchableOpacity>
              </View>
            </View>
          </>
        );

      case 3:
        return (
          <>
            <Text style={styles.sectionTitle}>3. PERSONAL DEMOGRAPHICS</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Contact Number <Text style={styles.optional}>(Optional)</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter contact number"
                  placeholderTextColor="#999"
                  value={formData.contact_number}
                  onChangeText={(value) => updateField('contact_number', value)}
                  keyboardType="phone-pad"
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Date of Birth <Text style={styles.optional}>(Optional)</Text></Text>
              <TouchableOpacity 
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                disabled={loading}
              >
                <Text style={formData.date_of_birth ? styles.dateText : styles.placeholderText}>
                  {formData.date_of_birth || 'Select Date of Birth'}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                />
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Gender <Text style={styles.optional}>(Optional)</Text></Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.gender}
                  onValueChange={(itemValue) => updateField('gender', itemValue)}
                  enabled={!loading}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Gender" value="" />
                  <Picker.Item label="Male" value="Male" />
                  <Picker.Item label="Female" value="Female" />
                  <Picker.Item label="Others" value="Others" />
                </Picker>
              </View>
            </View>
          </>
        );

      case 4:
        return (
          <>
            <Text style={styles.sectionTitle}>4. GEOGRAPHICAL LOCATION</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Region <Text style={styles.required}>*</Text></Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedRegionCode}
                  onValueChange={(itemValue) => {
                    const selectedRegion = regions.find(r => r.code === itemValue);
                    if (selectedRegion) {
                      handleRegionChange(selectedRegion.name, itemValue);
                    }
                  }}
                  enabled={!loading}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Region" value="" />
                  {regions.map((region) => (
                    <Picker.Item key={region.code} label={region.name} value={region.code} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Province <Text style={styles.required}>*</Text></Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedProvinceCode}
                  onValueChange={(itemValue) => {
                    const selectedProvince = provinces.find(p => p.code === itemValue);
                    if (selectedProvince) {
                      handleProvinceChange(selectedProvince.name, itemValue);
                    }
                  }}
                  enabled={!loading && selectedRegionCode !== ''}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Province" value="" />
                  {provinces.map((province) => (
                    <Picker.Item key={province.code} label={province.name} value={province.code} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>City/Municipality <Text style={styles.required}>*</Text></Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedCityCode}
                  onValueChange={(itemValue) => {
                    const selectedCity = cities.find(c => c.code === itemValue);
                    if (selectedCity) {
                      handleCityChange(selectedCity.name, itemValue);
                    }
                  }}
                  enabled={!loading && selectedProvinceCode !== ''}
                  style={styles.picker}
                >
                  <Picker.Item label="Select City/Municipality" value="" />
                  {cities.map((city) => (
                    <Picker.Item key={city.code} label={city.name} value={city.code} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Barangay <Text style={styles.required}>*</Text></Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.barangay}
                  onValueChange={(itemValue) => handleBarangayChange(itemValue)}
                  enabled={!loading && selectedCityCode !== ''}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Barangay" value="" />
                  {barangays.map((barangay) => (
                    <Picker.Item key={barangay.code} label={barangay.name} value={barangay.name} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Street Name <Text style={styles.optional}>(Optional)</Text></Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter street name"
                  placeholderTextColor="#999"
                  value={formData.street_name}
                  onChangeText={(value) => updateField('street_name', value)}
                  editable={!loading}
                />
              </View>
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>MechConnect</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressSteps}>
            <View style={styles.progressLine} />
            <View style={[styles.progressBar, { width: `${getProgressWidth()}%` }]} />
            {renderStepIndicator(1, 'Personal')}
            {renderStepIndicator(2, 'Security')}
            {renderStepIndicator(3, 'Demographics')}
            {renderStepIndicator(4, 'Location')}
          </View>
        </View>

        <View style={styles.formContainer}>
          {renderStage()}

          <View style={styles.buttonContainer}>
            {currentStage > 1 && (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={handlePrevious}
                disabled={loading}
              >
                <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Previous</Text>
              </TouchableOpacity>
            )}
            {currentStage < totalStages ? (
              <TouchableOpacity
                style={styles.button}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.buttonText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.buttonSubmit, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.linkText}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.copyright}>
          <Text style={styles.copyrightText}>© 2025 MechConnect. All rights reserved.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
