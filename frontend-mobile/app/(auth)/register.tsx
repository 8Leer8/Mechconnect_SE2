import React, { useState, useEffect, useRef } from 'react';
import {
  View, TextInput, TouchableOpacity, Text, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Toast from '@/components/gen/Toast';

const API_URL       = process.env.EXPO_PUBLIC_API_URL;
const PSGC_API_BASE = 'https://psgc.gitlab.io/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const ORANGE  = '#F97316';
const BG      = '#121212';
const SURFACE = '#1E1E1E';
const BORDER  = '#2C2C2C';
const TEXT    = '#F5F5F5';
const MUTED   = '#9A9A9A';

// ─── Static data ─────────────────────────────────────────────────────────────
const MONTH_ITEMS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
].map((name, i) => ({ label: name, value: String(i + 1).padStart(2, '0') }));

const DAY_ITEMS  = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return { label: d, value: d };
});

const CURRENT_YEAR = new Date().getFullYear();
const MAX_BIRTH_YEAR = CURRENT_YEAR - 18; // User must be at least 18 years old
const YEAR_ITEMS = Array.from({ length: MAX_BIRTH_YEAR - 1940 + 1 }, (_, i) => {
  const y = String(MAX_BIRTH_YEAR - i);
  return { label: y, value: y };
});

const GENDER_ITEMS = ['Male', 'Female', 'Others'].map(g => ({ label: g, value: g }));

const STAGE_LABELS: Record<number, string> = {
  1: '1/6 Personal', 2: '2/6 Contact', 3: '3/6 Verify',
  4: '4/6 Security', 5: '5/6 Demographics', 6: '6/6 Location',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PSGCLocation    { code: string; name: string; [key: string]: any }
interface RegisterResponse { [key: string]: string | string[] }

const validateEmail    = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validatePassword = (pw: string): string | null => {
  if (pw.length < 8)            return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw))        return 'Password needs at least 1 uppercase letter.';
  if (!/[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]/.test(pw))
    return 'Password needs at least 1 special character.';
  return null;
};
const isAtLeast18 = (dob: string): boolean => {
  const birth = new Date(dob);
  const now   = new Date();
  let age     = now.getFullYear() - birth.getFullYear();
  const m     = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 18;
};

// ─── Bottom Sheet Picker ──────────────────────────────────────────────────────
interface BSPickerProps {
  visible: boolean;
  title: string;
  items: { label: string; value: string }[];
  selectedValue: string;
  loading?: boolean;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (item: { label: string; value: string }) => void;
}
function BottomSheetPicker({ visible, title, items, selectedValue, loading, emptyMessage, onClose, onSelect }: BSPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={bs.overlay}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={bs.sheet}>
          <View style={bs.handle} />
          <Text style={bs.title}>{title}</Text>
          {loading ? (
            <View style={bs.loader}><ActivityIndicator color={ORANGE} size="large" /></View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item, index) => `${item.value}-${index}`}
              style={{ maxHeight: 380 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={bs.empty}>{emptyMessage || 'No items found'}</Text>}
              renderItem={({ item }) => {
                const active = item.value === selectedValue;
                return (
                  <TouchableOpacity
                    style={[bs.item, { borderBottomColor: BORDER }]}
                    onPress={() => { onSelect(item); onClose(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[bs.itemText, active && { color: ORANGE, fontWeight: '600' }]}>
                      {item.label}
                    </Text>
                    {active && <Feather name="check" size={14} color={ORANGE} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const bs = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderTopColor: '#2A2C2E',
    paddingBottom: 32,
  },
  handle: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: '#4A4D50',
    alignSelf: 'center', marginTop: 10, marginBottom: 12,
  },
  title:    { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', paddingBottom: 12, paddingHorizontal: 16 },
  loader:   { paddingVertical: 40, alignItems: 'center' },
  empty:    { textAlign: 'center', color: MUTED, fontSize: 14, paddingVertical: 32 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { fontSize: 14, fontWeight: '400', color: TEXT, flex: 1 },
});

// ─── Main Component ───────────────────────────────────────────────────────────
const RESEND_COOLDOWN = 60;

export default function RegisterScreen() {
  const router = useRouter();

  const [toast, setToast] = useState({ visible: false, message: '' });
  const showToast = (msg: string) => setToast({ visible: true, message: msg });
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  const [agreedToPolicies, setAgreedToPolicies] = useState(false);

  const [formData, setFormData] = useState({
    firstname: '', lastname: '', middlename: '',
    username: '', password: '', confirm_password: '',
    date_of_birth: '', gender: '', role: 'client',
    street_name: '', barangay: '', city_municipality: '',
    province: '', region: '', contact_number: '', email: '',
  });

  // Contact method state for Step 2 & 3
  const [contactMethod, setContactMethod] = useState<'mobile' | 'email'>('mobile');
  const [contactVerified, setContactVerified] = useState(false);
  const [verifiedIdentifier, setVerifiedIdentifier] = useState<string>('');

  const [phoneLocal, setPhoneLocal] = useState('');
  const [loading, setLoading]             = useState(false);
  const [currentStage, setCurrentStage]   = useState(1);

  const totalStages = 6;

  // ── Password visibility ───────────────────────────────────────────────────
  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Verification code state for Step 3
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode]     = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Date picker — separate month / day / year sheets
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay]     = useState('');
  const [dobYear, setDobYear]   = useState('');
  const [showMonthSheet, setShowMonthSheet] = useState(false);
  const [showDaySheet, setShowDaySheet]     = useState(false);
  const [showYearSheet, setShowYearSheet]   = useState(false);

  // Gender sheet
  const [showGenderSheet, setShowGenderSheet] = useState(false);

  // Location sheets
  const [showRegionSheet, setShowRegionSheet]     = useState(false);
  const [showProvinceSheet, setShowProvinceSheet] = useState(false);
  const [showCitySheet, setShowCitySheet]         = useState(false);
  const [showBarangaySheet, setShowBarangaySheet] = useState(false);

  // Location data
  const [regions, setRegions]     = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [cities, setCities]       = useState<any[]>([]);
  const [barangays, setBarangays] = useState<any[]>([]);
  const [selectedRegionCode, setSelectedRegionCode]     = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedCityCode, setSelectedCityCode]         = useState('');
  const [loadingRegions, setLoadingRegions]     = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities]       = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // Refs for OTP input auto-focus
  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  // Sync dob string whenever month/day/year change
  useEffect(() => {
    if (dobMonth && dobDay && dobYear) {
      updateField('date_of_birth', `${dobYear}-${dobMonth}-${dobDay}`);
    }
  }, [dobMonth, dobDay, dobYear]);

  useEffect(() => { fetchRegions(); }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setInterval(() => setResendCountdown(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(t);
  }, [resendCountdown]);

  useEffect(() => {
    if (!selectedRegionCode) return;
    setSelectedProvinceCode(''); setSelectedCityCode('');
    updateField('province', ''); updateField('city_municipality', ''); updateField('barangay', '');
    fetchProvinces(selectedRegionCode);
  }, [selectedRegionCode]);

  useEffect(() => {
    if (!selectedProvinceCode) return;
    setSelectedCityCode('');
    updateField('city_municipality', ''); updateField('barangay', '');
    fetchCities(selectedProvinceCode);
  }, [selectedProvinceCode]);

  useEffect(() => {
    if (!selectedCityCode) return;
    updateField('barangay', '');
    fetchBarangays(selectedCityCode);
  }, [selectedCityCode]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchRegions = async () => {
    setLoadingRegions(true);
    try {
      const res  = await fetch(`${PSGC_API_BASE}/regions`);
      const data = await res.json() as PSGCLocation[];
      setRegions(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { showToast('Failed to load regions.'); }
    finally { setLoadingRegions(false); }
  };
  const fetchProvinces = async (code: string) => {
    setLoadingProvinces(true); setCities([]); setBarangays([]);
    try {
      const res  = await fetch(`${PSGC_API_BASE}/regions/${code}/provinces`);
      const data = await res.json() as PSGCLocation[];
      setProvinces(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { showToast('Failed to load provinces.'); }
    finally { setLoadingProvinces(false); }
  };
  const fetchCities = async (code: string) => {
    setLoadingCities(true); setBarangays([]);
    try {
      const res  = await fetch(`${PSGC_API_BASE}/provinces/${code}/cities-municipalities`);
      const data = await res.json() as PSGCLocation[];
      setCities(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { showToast('Failed to load cities.'); }
    finally { setLoadingCities(false); }
  };
  const fetchBarangays = async (code: string) => {
    setLoadingBarangays(true);
    try {
      const res  = await fetch(`${PSGC_API_BASE}/cities-municipalities/${code}/barangays`);
      const data = await res.json() as PSGCLocation[];
      setBarangays(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch { showToast('Failed to load barangays.'); }
    finally { setLoadingBarangays(false); }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setPhoneLocal(digits);
    updateField('contact_number', digits ? '+63' + digits : '');
  };

  // ── OTP verification handlers ─────────────────────────────────────────────
  const handleSendVerificationCode = async () => {
    // Validate input before sending
    if (contactMethod === 'mobile') {
      if (!phoneLocal || phoneLocal.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      if (!formData.email || !validateEmail(formData.email)) {
        showToast('Please enter a valid email address.');
        return;
      }
    }

    setSendingCode(true);
    try {
      const identifier = contactMethod === 'mobile' ? '+63' + phoneLocal : formData.email;

      // Use different endpoints for mobile vs email
      const endpoint = contactMethod === 'mobile'
        ? `${API_URL}/users/send-otp/`
        : `${API_URL}/users/send-verification-code/`;

      const payload = contactMethod === 'mobile'
        ? { contact_number: identifier }
        : { email: identifier };

      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Verification code sent to your ${contactMethod === 'mobile' ? 'mobile number' : 'email'}.`);
        setResendCountdown(RESEND_COOLDOWN);
        setCurrentStage(3);
      } else {
        showToast(data.error || 'Failed to send verification code.');
      }
    } catch { showToast('Connection failed. Please check your network.'); }
    finally { setSendingCode(false); }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showToast('Please enter a valid 6-digit code.');
      return;
    }
    setVerifyingCode(true);
    try {
      const identifier = contactMethod === 'mobile' ? '+63' + phoneLocal : formData.email;

      // Use different endpoints for mobile vs email verification
      const endpoint = contactMethod === 'mobile'
        ? `${API_URL}/users/verify-otp/`
        : `${API_URL}/users/verify-code/`;

      const payload = contactMethod === 'mobile'
        ? { contact_number: identifier, otp_code: verificationCode }
        : { email: identifier, code: verificationCode };

      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setContactVerified(true);
        setVerifiedIdentifier(identifier); // Track the verified identifier
        // Save the verified contact info to formData
        if (contactMethod === 'mobile') {
          updateField('contact_number', identifier);
        } else {
          updateField('email', identifier);
        }
        showToast(`${contactMethod === 'mobile' ? 'Mobile number' : 'Email'} verified!`);
        setVerificationCode('');
        setCurrentStage(4);
      } else {
        showToast(data.error || 'Invalid or expired verification code.');
        setVerificationCode('');
      }
    } catch { showToast('Connection failed. Please check your network.'); }
    finally { setVerifyingCode(false); }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) return;
    setVerificationCode('');
    await handleSendVerificationCode();
  };

  const fmtCountdown = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNext = () => {
    if (currentStage === 1) {
      if (!formData.firstname || !formData.lastname || !formData.username) { showToast('Please fill in all required fields.'); return; }
      setCurrentStage(2); return;
    }
    if (currentStage === 2) {
      // Step 2 has its own Send Verification Code button
      return;
    }
    if (currentStage === 3) {
      // Step 3 has its own Verify button
      return;
    }
    if (currentStage === 4) {
      if (!formData.password || !formData.confirm_password) { showToast('Please fill in all password fields.'); return; }
      const pwErr = validatePassword(formData.password);
      if (pwErr) { showToast(pwErr); return; }
      if (formData.password !== formData.confirm_password) { showToast('Passwords do not match.'); return; }
    }
    if (currentStage === 5) {
      if (!formData.date_of_birth) { showToast('Please select your date of birth.'); return; }
      if (!isAtLeast18(formData.date_of_birth)) { showToast('You must be at least 18 years old to register.'); return; }
    }
    if (currentStage === 6) {
      if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) { showToast('Please complete your address.'); return; }
    }
    setCurrentStage(p => Math.min(p + 1, totalStages));
  };

  const handlePrevious = () => {
    if (currentStage === 4) { setCurrentStage(2); return; } // Skip Step 3 (OTP) when going back
    if (currentStage === 3) { setCurrentStage(2); return; }
    if (currentStage === 2) { setCurrentStage(1); return; }
    setCurrentStage(p => Math.max(p - 1, 1));
  };

  const handleRegister = async () => {
    if (!contactVerified) { showToast('Please verify your contact method first.'); return; }
    if (!agreedToPolicies) { showToast('Please agree to the Terms & Conditions and Privacy Policy.'); return; }
    if (!formData.firstname || !formData.lastname || !formData.username || !formData.password || !formData.confirm_password) { showToast('Please fill in all required fields.'); return; }
    if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) { showToast('Please complete your address.'); return; }
    if (formData.password !== formData.confirm_password) { showToast('Passwords do not match.'); return; }
    setLoading(true);
    try {
      // Construct payload based on verified contact method
      const payload: any = { ...formData };
      // Use the verified contact info from Step 2
      if (contactMethod === 'mobile') {
        payload.contact_number = verifiedIdentifier;
        // Clear email if mobile was used for verification (email not collected)
        payload.email = '';
      } else {
        // Email verification - contact_number comes from demographics (if any) or empty
        payload.contact_number = '';
      }
      const res  = await fetch(`${API_URL}/users/register/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as RegisterResponse;
      if (res.ok) { showToast('Registration successful! Please login.'); setTimeout(() => router.replace('../(auth)/login' as any), 1500); }
      else { const first = Object.values(data)[0]; showToast(Array.isArray(first) ? first[0] : String(first)); }
    } catch { showToast('Connection failed. Please check your network.'); }
    finally { setLoading(false); }
  };

  // ── Stages ────────────────────────────────────────────────────────────────
  const renderStage = () => {
    switch (currentStage) {
      case 1: return (
        <>
          <Text style={s.label}>First Name <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter first name" placeholderTextColor={MUTED}
              value={formData.firstname} onChangeText={v => updateField('firstname', v)} editable={!loading} />
          </View>
          <Text style={[s.label, s.mt]}>Middle Name <Text style={s.opt}>(Optional)</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter middle name" placeholderTextColor={MUTED}
              value={formData.middlename} onChangeText={v => updateField('middlename', v)} editable={!loading} />
          </View>
          <Text style={[s.label, s.mt]}>Last Name <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter last name" placeholderTextColor={MUTED}
              value={formData.lastname} onChangeText={v => updateField('lastname', v)} editable={!loading} />
          </View>
          <Text style={[s.label, s.mt]}>Username <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter username" placeholderTextColor={MUTED}
              value={formData.username} onChangeText={v => updateField('username', v)}
              autoCapitalize="none" editable={!loading} />
          </View>
        </>
      );

      case 2: return (
        <>
          <Text style={s.label}>Select Contact Method <Text style={s.req}>*</Text></Text>
          <View style={s.methodToggleRow}>
            <TouchableOpacity
              style={[s.methodCard, contactMethod === 'mobile' && s.methodCardActive]}
              onPress={() => setContactMethod('mobile')}
              activeOpacity={0.8}>
              <Feather name="smartphone" size={20} color={contactMethod === 'mobile' ? ORANGE : MUTED} />
              <Text style={[s.methodCardText, contactMethod === 'mobile' && s.methodCardTextActive]}>Mobile Number</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.methodCard, contactMethod === 'email' && s.methodCardActive]}
              onPress={() => setContactMethod('email')}
              activeOpacity={0.8}>
              <Feather name="mail" size={20} color={contactMethod === 'email' ? ORANGE : MUTED} />
              <Text style={[s.methodCardText, contactMethod === 'email' && s.methodCardTextActive]}>Email Address</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.label, s.mt]}>{contactMethod === 'mobile' ? 'Mobile Number' : 'Email Address'} <Text style={s.req}>*</Text></Text>
          {contactMethod === 'mobile' ? (
            <View style={s.inputWrapper}>
              <Text style={s.prefix}>+63</Text>
              <View style={s.prefixDivider} />
              <TextInput style={s.input} placeholder="9XX XXX XXXX" placeholderTextColor={MUTED}
                value={phoneLocal} onChangeText={handlePhoneChange}
                keyboardType="phone-pad" maxLength={10} editable={!sendingCode} />
            </View>
          ) : (
            <View style={s.inputWrapper}>
              <TextInput style={s.input} placeholder="Enter your email address" placeholderTextColor={MUTED}
                value={formData.email} onChangeText={v => updateField('email', v)}
                keyboardType="email-address" autoCapitalize="none" editable={!sendingCode} />
            </View>
          )}

          <TouchableOpacity style={[s.button, s.btnFull, sendingCode && s.btnDisabled, { marginTop: 24 }]}
            onPress={() => {
              const currentIdentifier = contactMethod === 'mobile' ? '+63' + phoneLocal : formData.email;
              if (contactVerified && verifiedIdentifier === currentIdentifier) {
                // Already verified this identifier, skip to Step 4
                setCurrentStage(4);
              } else {
                // Need to send verification code
                handleSendVerificationCode();
              }
            }} disabled={sendingCode}>
            {sendingCode ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>
              {(() => {
                const currentIdentifier = contactMethod === 'mobile' ? '+63' + phoneLocal : formData.email;
                return (contactVerified && verifiedIdentifier === currentIdentifier) ? 'Next' : 'Send Verification Code';
              })()}
            </Text>}
          </TouchableOpacity>
        </>
      );

      case 3: return (
        <>
          <Text style={s.label}>Enter Verification Code <Text style={s.req}>*</Text></Text>
          <Text style={s.verifyHint}>We sent a 6-digit code to {contactMethod === 'mobile' ? '+63' + phoneLocal : formData.email}</Text>

          <View style={s.otpContainer}>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <TextInput
                key={index}
                ref={el => { otpInputRefs.current[index] = el; }}
                style={s.otpDigit}
                maxLength={1}
                keyboardType="number-pad"
                value={verificationCode[index] || ''}
                onChangeText={(digit) => {
                  const newCode = verificationCode.split('');
                  newCode[index] = digit;
                  setVerificationCode(newCode.join(''));
                  // Auto-focus next input
                  if (digit && index < 5) {
                    const nextInput = otpInputRefs.current[index + 1];
                    nextInput?.focus();
                  }
                }}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace' && !verificationCode[index] && index > 0) {
                    const prevInput = otpInputRefs.current[index - 1];
                    prevInput?.focus();
                  }
                }}
                editable={!verifyingCode}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity style={[s.button, s.btnFull, verifyingCode && s.btnDisabled, { marginTop: 24 }]}
            onPress={handleVerifyCode} disabled={verifyingCode || verificationCode.length !== 6}>
            {verifyingCode ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Verify</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[s.buttonOutline, s.btnFull, { marginTop: 12 }]}
            onPress={handleResendCode} disabled={sendingCode || resendCountdown > 0}>
            {sendingCode ? <ActivityIndicator color={ORANGE} />
              : <Text style={s.btnOutlineText}>{resendCountdown > 0 ? `Resend in ${fmtCountdown(resendCountdown)}` : 'Resend Code'}</Text>}
          </TouchableOpacity>
        </>
      );

      // ── Stage 4: Security (passwords with show/hide toggles) ──────────────
      case 4: return (
        <>
          <Text style={s.label}>Password <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="Enter password"
              placeholderTextColor={MUTED}
              value={formData.password}
              onChangeText={v => updateField('password', v)}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity style={s.eye} onPress={() => setShowPassword(p => !p)} activeOpacity={0.7}>
              <Feather name={showPassword ? 'eye' : 'eye-off'} size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Min 8 chars · 1 uppercase · 1 special character</Text>
          <Text style={[s.label, s.mt]}>Confirm Password <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput
              style={s.input}
              placeholder="Re-enter password"
              placeholderTextColor={MUTED}
              value={formData.confirm_password}
              onChangeText={v => updateField('confirm_password', v)}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity style={s.eye} onPress={() => setShowConfirmPassword(p => !p)} activeOpacity={0.7}>
              <Feather name={showConfirmPassword ? 'eye' : 'eye-off'} size={16} color={MUTED} />
            </TouchableOpacity>
          </View>
        </>
      );

      // ── Stage 5: Demographics (DOB, Gender) ───────────────
      case 5: return (
        <>
          {/* Date of Birth — 3 column row */}
          <Text style={[s.label, s.mt]}>Date of Birth <Text style={s.req}>*</Text></Text>
          <View style={s.dobRow}>
            <TouchableOpacity style={[s.inputWrapper, { flex: 1.6 }]} onPress={() => setShowMonthSheet(true)}>
              <Text style={[s.input, !dobMonth && { color: MUTED }]}>
                {dobMonth ? MONTH_ITEMS.find(m => m.value === dobMonth)?.label : 'Month'}
              </Text>
              <Feather name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.inputWrapper, { flex: 1 }]} onPress={() => setShowDaySheet(true)}>
              <Text style={[s.input, !dobDay && { color: MUTED }]}>{dobDay || 'Day'}</Text>
              <Feather name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.inputWrapper, { flex: 1.2 }]} onPress={() => setShowYearSheet(true)}>
              <Text style={[s.input, !dobYear && { color: MUTED }]}>{dobYear || 'Year'}</Text>
              <Feather name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Gender */}
          <Text style={[s.label, s.mt]}>Gender <Text style={s.opt}>(Optional)</Text></Text>
          <TouchableOpacity style={s.inputWrapper} onPress={() => setShowGenderSheet(true)} disabled={loading}>
            <Text style={[s.input, !formData.gender && { color: MUTED }]}>{formData.gender || 'Select Gender'}</Text>
            <Feather name="chevron-down" size={16} color={MUTED} />
          </TouchableOpacity>
        </>
      );

      // ── Stage 6: Location ─────────────────────────────────────────────────
      case 6: return (
        <>
          <Text style={s.label}>Region <Text style={s.req}>*</Text></Text>
          <TouchableOpacity style={s.inputWrapper} onPress={() => setShowRegionSheet(true)} disabled={loading || loadingRegions}>
            <Text style={[s.input, !formData.region && { color: MUTED }]}>{loadingRegions ? 'Loading...' : (formData.region || 'Select Region')}</Text>
            {loadingRegions ? <ActivityIndicator size="small" color={ORANGE} /> : <Feather name="chevron-down" size={16} color={MUTED} />}
          </TouchableOpacity>
          <Text style={[s.label, s.mt]}>Province <Text style={s.req}>*</Text></Text>
          <TouchableOpacity style={[s.inputWrapper, !selectedRegionCode && s.inputDimmed]}
            onPress={() => setShowProvinceSheet(true)} disabled={loading || !selectedRegionCode || loadingProvinces}>
            <Text style={[s.input, !formData.province && { color: MUTED }]}>{loadingProvinces ? 'Loading...' : (formData.province || (!selectedRegionCode ? 'Select region first' : 'Select Province'))}</Text>
            {loadingProvinces ? <ActivityIndicator size="small" color={ORANGE} /> : <Feather name="chevron-down" size={16} color={MUTED} />}
          </TouchableOpacity>
          <Text style={[s.label, s.mt]}>City / Municipality <Text style={s.req}>*</Text></Text>
          <TouchableOpacity style={[s.inputWrapper, !selectedProvinceCode && s.inputDimmed]}
            onPress={() => setShowCitySheet(true)} disabled={loading || !selectedProvinceCode || loadingCities}>
            <Text style={[s.input, !formData.city_municipality && { color: MUTED }]}>{loadingCities ? 'Loading...' : (formData.city_municipality || (!selectedProvinceCode ? 'Select province first' : 'Select City/Municipality'))}</Text>
            {loadingCities ? <ActivityIndicator size="small" color={ORANGE} /> : <Feather name="chevron-down" size={16} color={MUTED} />}
          </TouchableOpacity>
          <Text style={[s.label, s.mt]}>Barangay <Text style={s.req}>*</Text></Text>
          <TouchableOpacity style={[s.inputWrapper, !selectedCityCode && s.inputDimmed]}
            onPress={() => setShowBarangaySheet(true)} disabled={loading || !selectedCityCode || loadingBarangays}>
            <Text style={[s.input, !formData.barangay && { color: MUTED }]}>{loadingBarangays ? 'Loading...' : (formData.barangay || (!selectedCityCode ? 'Select city first' : 'Select Barangay'))}</Text>
            {loadingBarangays ? <ActivityIndicator size="small" color={ORANGE} /> : <Feather name="chevron-down" size={16} color={MUTED} />}
          </TouchableOpacity>
          <Text style={[s.label, s.mt]}>Street Name <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter street name" placeholderTextColor={MUTED}
              value={formData.street_name} onChangeText={v => updateField('street_name', v)} editable={!loading} />
          </View>
        </>
      );

      default: return null;
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <Toast message={toast.message} visible={toast.visible} onHide={hideToast} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={s.logo} />
          <Text style={s.appName}>MechConnect</Text>
          <Text style={s.tagline}>Create your account</Text>
        </View>
        <Text style={s.stageLabel}>{STAGE_LABELS[currentStage]}</Text>
        <View style={s.form}>
          {renderStage()}
          {currentStage === totalStages && (
            <View style={s.termsWrap}>
              <TouchableOpacity
                style={s.checkboxButton}
                onPress={() => setAgreedToPolicies(prev => !prev)}
                disabled={loading}
              >
                <Feather
                  name={agreedToPolicies ? 'check-square' : 'square'}
                  size={16}
                  color={agreedToPolicies ? ORANGE : MUTED}
                />
              </TouchableOpacity>
              <View style={s.termsTextWrap}>
                <Text style={s.termsText}>I agree to the </Text>
                <TouchableOpacity disabled={loading} onPress={() => router.push('./terms' as any)}>
                  <Text style={s.termsLink}>Terms &amp; Conditions</Text>
                </TouchableOpacity>
                <Text style={s.termsText}> and the </Text>
                <TouchableOpacity disabled={loading} onPress={() => router.push('./privacy' as any)}>
                  <Text style={s.termsLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {currentStage !== 2 && currentStage !== 3 && (
            <View style={s.navRow}>
              {currentStage > 1 && (
                <TouchableOpacity style={[s.buttonOutline, s.navBtn]} onPress={handlePrevious} disabled={loading || sendingCode || verifyingCode}>
                  <Text style={s.btnOutlineText}>Previous</Text>
                </TouchableOpacity>
              )}
              {currentStage < totalStages ? (
                <TouchableOpacity style={[s.button, s.navBtn, (loading || sendingCode) && s.btnDisabled]} onPress={handleNext} disabled={loading || sendingCode}>
                  <Text style={s.btnText}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.button, s.navBtn, (loading || !agreedToPolicies) && s.btnDisabled]} onPress={handleRegister} disabled={loading || !agreedToPolicies}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Account</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}
          <View style={s.loginRow}>
            <Text style={s.loginBase}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)}>
              <Text style={s.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.copyright}>© 2025 MechConnect. All rights reserved.</Text>
      </ScrollView>

      {/* ── Date of Birth Sheets ── */}
      <BottomSheetPicker visible={showMonthSheet} title="Month"
        items={MONTH_ITEMS} selectedValue={dobMonth}
        onClose={() => setShowMonthSheet(false)}
        onSelect={opt => setDobMonth(opt.value)} />

      <BottomSheetPicker visible={showDaySheet} title="Day"
        items={DAY_ITEMS} selectedValue={dobDay}
        onClose={() => setShowDaySheet(false)}
        onSelect={opt => setDobDay(opt.value)} />

      <BottomSheetPicker visible={showYearSheet} title="Year"
        items={YEAR_ITEMS} selectedValue={dobYear}
        onClose={() => setShowYearSheet(false)}
        onSelect={opt => {
          setDobYear(opt.value);
          if (dobMonth && dobDay) {
            const dob = `${opt.value}-${dobMonth}-${dobDay}`;
            if (!isAtLeast18(dob)) showToast('You must be at least 18 years old to register.');
          }
        }} />

      {/* ── Gender Sheet ── */}
      <BottomSheetPicker visible={showGenderSheet} title="Gender"
        items={GENDER_ITEMS} selectedValue={formData.gender}
        onClose={() => setShowGenderSheet(false)}
        onSelect={opt => updateField('gender', opt.value)} />

      {/* ── Location Sheets ── */}
      <BottomSheetPicker visible={showRegionSheet} title="Select Region"
        items={regions.map(r => ({ label: r.name, value: r.code }))}
        selectedValue={selectedRegionCode} loading={loadingRegions}
        onClose={() => setShowRegionSheet(false)}
        onSelect={opt => { setSelectedRegionCode(opt.value); updateField('region', opt.label); }} />

      <BottomSheetPicker visible={showProvinceSheet} title="Select Province"
        items={provinces.map(p => ({ label: p.name, value: p.code }))}
        selectedValue={selectedProvinceCode} loading={loadingProvinces}
        emptyMessage={selectedRegionCode ? 'No provinces found' : 'Select a region first'}
        onClose={() => setShowProvinceSheet(false)}
        onSelect={opt => { setSelectedProvinceCode(opt.value); updateField('province', opt.label); }} />

      <BottomSheetPicker visible={showCitySheet} title="Select City / Municipality"
        items={cities.map(c => ({ label: c.name, value: c.code }))}
        selectedValue={selectedCityCode} loading={loadingCities}
        emptyMessage={selectedProvinceCode ? 'No cities found' : 'Select a province first'}
        onClose={() => setShowCitySheet(false)}
        onSelect={opt => { setSelectedCityCode(opt.value); updateField('city_municipality', opt.label); }} />

      <BottomSheetPicker visible={showBarangaySheet} title="Select Barangay"
        items={barangays.map(b => ({ label: b.name, value: b.name }))}
        selectedValue={formData.barangay} loading={loadingBarangays}
        emptyMessage={selectedCityCode ? 'No barangays found' : 'Select a city first'}
        onClose={() => setShowBarangaySheet(false)}
        onSelect={opt => updateField('barangay', opt.value)} />

    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: BG },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 },
  logoRow:    { alignItems: 'flex-start', marginBottom: 24 },
  logo:       { width: 60, height: 60, resizeMode: 'contain', marginBottom: 8 },
  appName:    { fontSize: 16, fontWeight: '600', color: TEXT },
  tagline:    { fontSize: 14, fontWeight: '400', color: MUTED, marginTop: 2 },
  stageLabel: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 20 },
  form:       { flex: 1 },
  label:      { fontSize: 12, fontWeight: '400', color: MUTED, marginBottom: 6 },
  mt:         { marginTop: 12 },
  req:        { color: ORANGE },
  opt:        { color: MUTED },
  hint:       { fontSize: 11, fontWeight: '300', color: MUTED, marginTop: 4 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER, borderRadius: 8,
    paddingHorizontal: 12, height: 42, backgroundColor: SURFACE,
  },
  inputDimmed:   { opacity: 0.5 },
  input:         { flex: 1, fontSize: 14, fontWeight: '400', color: TEXT },
  eye:           { paddingLeft: 8 },
  prefix:        { fontSize: 14, fontWeight: '400', color: TEXT, marginRight: 8 },
  prefixDivider: { width: 1, height: 20, backgroundColor: BORDER, marginRight: 8 },
  dobRow:        { flexDirection: 'row', gap: 8 },
  button: {
    height: 42, backgroundColor: ORANGE, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', flex: 1,
  },
  btnDisabled:    { opacity: 0.6 },
  btnText:        { fontSize: 14, fontWeight: '400', color: '#fff' },
  btnFull:        { flex: undefined, width: '100%' },
  buttonOutline: {
    height: 42, borderWidth: 1, borderColor: BORDER, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', flex: 1,
  },
  btnOutlineText: { fontSize: 14, fontWeight: '400', color: TEXT },
  navRow:   { flexDirection: 'row', gap: 12, marginTop: 24 },
  navBtn:   {},
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  loginBase:{ fontSize: 12, fontWeight: '400', color: MUTED },
  loginLink:{ fontSize: 12, fontWeight: '600', color: ORANGE },
  termsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    marginTop: 20,
  },
  checkboxButton: {
    marginTop: 1,
    marginRight: 8,
  },
  termsTextWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  termsText: {
    fontSize: 12,
    fontWeight: '400',
    color: MUTED,
  },
  termsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
  },
  copyright:{ fontSize: 12, fontWeight: '300', color: MUTED, textAlign: 'center', marginTop: 32 },
  // New styles for Step 2 & 3
  methodToggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  methodCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
  },
  methodCardActive: {
    borderColor: ORANGE,
    backgroundColor: '#2A1E16',
  },
  methodCardText: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
  },
  methodCardTextActive: {
    color: ORANGE,
    fontWeight: '600',
  },
  verifyHint: {
    fontSize: 13,
    color: MUTED,
    marginBottom: 20,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  otpDigit: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: SURFACE,
    color: TEXT,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
