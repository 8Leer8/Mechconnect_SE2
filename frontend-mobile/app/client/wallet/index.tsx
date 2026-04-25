import { useEffect } from 'react';
import { router } from 'expo-router';

// Redirect to walletPage.tsx
export default function WalletIndexRedirect() {
  useEffect(() => {
    router.replace('/client/wallet/walletPage' as never);
  }, []);

  return null;
}
