import React, { useState, useEffect } from 'react';
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

const YEAR_ITEMS = Array.from({ length: 2026 - 1940 + 1 }, (_, i) => {
  const y = String(2026 - i);
  return { label: y, value: y };
});

const GENDER_ITEMS = ['Male', 'Female', 'Others'].map(g => ({ label: g, value: g }));

const STAGE_LABELS: Record<number, string> = {
  1: '1/5 Personal', 2: '2/5 Verify', 3: '3/5 Security',
  4: '4/5 Demographics', 5: '5/5 Location',
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
    email: '', username: '', password: '', confirm_password: '',
    date_of_birth: '', gender: '', role: 'client',
    street_name: '', barangay: '', city_municipality: '',
    province: '', region: '', contact_number: '',
  });
  const [phoneLocal, setPhoneLocal] = useState('');
  const [loading, setLoading]             = useState(false);
  const [currentStage, setCurrentStage]   = useState(1);

  const totalStages = 5;

  // Email verification
  const [emailVerified, setEmailVerified]       = useState(false);
  const [verifiedEmail, setVerifiedEmail]       = useState('');
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
    if (field === 'email' && value !== verifiedEmail) setEmailVerified(false);
  };

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setPhoneLocal(digits);
    updateField('contact_number', digits ? '+63' + digits : '');
  };

  const dobDisplay = () => {
    if (!dobMonth && !dobDay && !dobYear) return null;
    const mLabel = dobMonth ? MONTH_ITEMS.find(m => m.value === dobMonth)?.label : '—';
    return `${mLabel ?? '—'}  ${dobDay || '—'}  ${dobYear || '—'}`;
  };

  // ── Email verification ────────────────────────────────────────────────────
  const handleSendVerificationCode = async () => {
    setSendingCode(true);
    try {
      const res  = await fetch(`${API_URL}/users/send-verification-code/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await res.json();
      if (res.ok) { showToast('Verification code sent to your email.'); setResendCountdown(RESEND_COOLDOWN); setCurrentStage(2); }
      else showToast(data.error || 'Failed to send verification code.');
    } catch { showToast('Connection failed. Please check your network.'); }
    finally { setSendingCode(false); }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) { showToast('Please enter a valid 6-digit code.'); return; }
    setVerifyingCode(true);
    try {
      const res  = await fetch(`${API_URL}/users/verify-code/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, code: verificationCode }),
      });
      const data = await res.json();
      if (res.ok) { setEmailVerified(true); setVerifiedEmail(formData.email); showToast('Email verified!'); setCurrentStage(3); }
      else showToast(data.error || 'Invalid or expired verification code.');
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
      if (!formData.firstname || !formData.lastname || !formData.email || !formData.username) { showToast('Please fill in all required fields.'); return; }
      if (!validateEmail(formData.email)) { showToast('Please enter a valid email address.'); return; }
      if (emailVerified && formData.email === verifiedEmail) { setCurrentStage(3); return; }
      handleSendVerificationCode(); return;
    }
    if (currentStage === 3) {
      if (!formData.password || !formData.confirm_password) { showToast('Please fill in all password fields.'); return; }
      const pwErr = validatePassword(formData.password);
      if (pwErr) { showToast(pwErr); return; }
      if (formData.password !== formData.confirm_password) { showToast('Passwords do not match.'); return; }
    }
    if (currentStage === 4) {
      if (!formData.date_of_birth) { showToast('Please select your date of birth.'); return; }
      if (!isAtLeast18(formData.date_of_birth)) { showToast('You must be at least 18 years old to register.'); return; }
    }
    if (currentStage === 5) {
      if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) { showToast('Please complete your address.'); return; }
    }
    setCurrentStage(p => Math.min(p + 1, totalStages));
  };

  const handlePrevious = () => {
    if (currentStage === 3) { setCurrentStage(1); return; }
    setCurrentStage(p => Math.max(p - 1, 1));
  };

  const handleRegister = async () => {
    if (!emailVerified) { showToast('Please verify your email first.'); return; }
    if (!agreedToPolicies) { showToast('Please agree to the Terms & Conditions and Privacy Policy.'); return; }
    if (!formData.firstname || !formData.lastname || !formData.email || !formData.username || !formData.password || !formData.confirm_password) { showToast('Please fill in all required fields.'); return; }
    if (!formData.region || !formData.province || !formData.city_municipality || !formData.barangay) { showToast('Please complete your address.'); return; }
    if (formData.password !== formData.confirm_password) { showToast('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/users/register/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
          <Text style={[s.label, s.mt]}>Last Name <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter last name" placeholderTextColor={MUTED}
              value={formData.lastname} onChangeText={v => updateField('lastname', v)} editable={!loading} />
          </View>
          <Text style={[s.label, s.mt]}>Middle Name <Text style={s.opt}>(Optional)</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter middle name" placeholderTextColor={MUTED}
              value={formData.middlename} onChangeText={v => updateField('middlename', v)} editable={!loading} />
          </View>
          <Text style={[s.label, s.mt]}>Email <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter email" placeholderTextColor={MUTED}
              value={formData.email} onChangeText={v => updateField('email', v)}
              keyboardType="email-address" autoCapitalize="none" editable={!loading} />
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
          <Text style={s.label}>Verification Code <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter 6-digit code" placeholderTextColor={MUTED}
              value={verificationCode} onChangeText={setVerificationCode}
              keyboardType="number-pad" maxLength={6} editable={!verifyingCode} />
          </View>
          <Text style={[s.label, { marginTop: 8 }]}>Code sent to {formData.email}</Text>
          <TouchableOpacity style={[s.button, s.btnFull, verifyingCode && s.btnDisabled, { marginTop: 16 }]}
            onPress={handleVerifyCode} disabled={verifyingCode}>
            {verifyingCode ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Verify Code</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.buttonOutline, s.btnFull, { marginTop: 12 }]}
            onPress={handleResendCode} disabled={sendingCode || resendCountdown > 0}>
            {sendingCode ? <ActivityIndicator color={ORANGE} />
              : <Text style={s.btnOutlineText}>{resendCountdown > 0 ? `Resend in ${fmtCountdown(resendCountdown)}` : 'Resend Code'}</Text>}
          </TouchableOpacity>
        </>
      );

      case 3: return (
        <>
          <Text style={s.label}>Password <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Enter password" placeholderTextColor={MUTED}
              value={formData.password} onChangeText={v => updateField('password', v)}
              secureTextEntry autoCapitalize="none" editable={!loading} />
          </View>
          <Text style={s.hint}>Min 8 chars · 1 uppercase · 1 special character</Text>
          <Text style={[s.label, s.mt]}>Confirm Password <Text style={s.req}>*</Text></Text>
          <View style={s.inputWrapper}>
            <TextInput style={s.input} placeholder="Re-enter password" placeholderTextColor={MUTED}
              value={formData.confirm_password} onChangeText={v => updateField('confirm_password', v)}
              secureTextEntry autoCapitalize="none" editable={!loading} />
          </View>
        </>
      );

      case 4: return (
        <>
          <Text style={s.label}>Contact Number <Text style={s.opt}>(Optional)</Text></Text>
          <View style={s.inputWrapper}>
            <Text style={s.prefix}>+63</Text>
            <View style={s.prefixDivider} />
            <TextInput style={s.input} placeholder="9XX XXX XXXX" placeholderTextColor={MUTED}
              value={phoneLocal} onChangeText={handlePhoneChange}
              keyboardType="phone-pad" maxLength={10} editable={!loading} />
          </View>

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

      case 5: return (
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
          <Text style={[s.label, s.mt]}>Street Name <Text style={s.opt}>(Optional)</Text></Text>
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
          {currentStage !== 2 && (
            <View style={s.navRow}>
              {currentStage > 1 && (
                <TouchableOpacity style={[s.buttonOutline, s.navBtn]} onPress={handlePrevious} disabled={loading || sendingCode || verifyingCode}>
                  <Text style={s.btnOutlineText}>Previous</Text>
                </TouchableOpacity>
              )}
              {currentStage < totalStages ? (
                <TouchableOpacity style={[s.button, s.navBtn, (loading || sendingCode) && s.btnDisabled]} onPress={handleNext} disabled={loading || sendingCode}>
                  {currentStage === 1 && sendingCode ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Next</Text>}
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
            <TouchableOpacity onPress={() => router.back()}>
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
});