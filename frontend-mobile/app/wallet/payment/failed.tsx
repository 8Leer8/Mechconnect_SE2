import { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

export default function WalletPaymentFailedScreen() {
  const router = useRouter();

  useEffect(() => {
    // Auto-navigate after 4 seconds
    const timer = setTimeout(() => {
      router.replace('/mechanic/wallet');
    }, 4000);

    return () => clearTimeout(timer);
  }, [router]);

  const handleTryAgain = () => {
    router.replace('/mechanic/wallet');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <FontAwesome name="times" size={48} color="#FF6B6B" />
      </View>
      <ThemedText style={styles.text}>Payment Failed</ThemedText>
      <ThemedText style={styles.subtext}>Your payment could not be processed. Please try again.</ThemedText>

      <TouchableOpacity style={styles.button} onPress={handleTryAgain}>
        <FontAwesome name="arrow-left" size={16} color="#fff" style={styles.buttonIcon} />
        <ThemedText style={styles.buttonText}>Back to Wallet</ThemedText>
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
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  text: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FF6B6B',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2C2E',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
});
