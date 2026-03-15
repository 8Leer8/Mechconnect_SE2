import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { checkAdminSession, loginAsAdmin, logoutAdmin } from "../../services/authService";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const refreshSession = useCallback(async () => {
    setIsCheckingSession(true);
    const account = await checkAdminSession();
    setUser(account);
    setIsCheckingSession(false);
    return account;
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const signIn = useCallback(async (username, password) => {
    const account = await loginAsAdmin(username, password);
    setUser(account);

    // Best effort: refresh cookie-backed session in background when available.
    refreshSession();

    return account;
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    try {
      await logoutAdmin();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isCheckingSession,
      signIn,
      signOut,
      refreshSession,
    }),
    [isCheckingSession, refreshSession, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
