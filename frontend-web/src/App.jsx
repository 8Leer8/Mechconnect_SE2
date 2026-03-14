import { useEffect } from "react";
import { AppRouter } from "./app/AppRouter";
import { AuthProvider } from "./features/auth/AuthContext";

const THEME_STORAGE_KEY = "mechconnect-admin-theme";

function App() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";

    root.classList.toggle("dark", theme === "dark");
    if (!savedTheme) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, []);

  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
