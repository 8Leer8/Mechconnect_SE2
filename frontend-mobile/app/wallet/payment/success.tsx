import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function WalletPaymentSuccessScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch updated balance on mount
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch(`${API_URL}/users/mechanic/wallet/`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setBalance(data.tokens_balance ?? 0);
        }
      } catch (e) {
        console.error('Failed to fetch balance:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    // Auto-navigate after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/mechanic/wallet');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  const handleBackToWallet = () => {
    router.replace('/mechanic/wallet');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <FontAwesome name="check" size={48} color="#4CAF50" />
      </View>
      <ThemedText style={styles.text}>Payment Successful!</ThemedText>
      <ThemedText style={styles.subtext}>Your credits have been added to your wallet</ThemedText>

      {loading ? (
        <ActivityIndicator size="small" color="#FF8C00" style={styles.loader} />
      ) : balance !== null ? (
        <View style={styles.balanceCard}>
          <ThemedText style={styles.balanceLabel}>Updated Balance</ThemedText>
          <ThemedText style={styles.balanceValue}>{balance} Credits</ThemedText>
        </View>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={handleBackToWallet}>
        <ThemedText style={styles.buttonText}>Back to Wallet</ThemedText>
        <FontAwesome name="arrow-right" size={16} color="#fff" style={styles.buttonIcon} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1419',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  text: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4CAF50',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
  },
  loader: {
    marginTop: 16,
  },
  balanceCard: {
    backgroundColor: '#151718',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 32,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF8C00',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF8C00',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  buttonIcon: {
    marginLeft: 4,
  },
});
