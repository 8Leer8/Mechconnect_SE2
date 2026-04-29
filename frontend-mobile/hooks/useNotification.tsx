import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NotificationDropdown, NotificationType } from '@/components/ui/NotificationDropdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationConfig {
  type: NotificationType;
  message: string;
  title?: string;
  /** How long (ms) the banner stays visible. Default: 3000 */
  duration?: number;
}

interface NotificationContextValue {
  showNotification: (config: NotificationConfig) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue>({
  showNotification: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NotificationConfig & { visible: boolean }>({
    visible: false,
    type: 'info',
    message: '',
  });
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors state.visible so showNotification can stay a stable callback (avoids effect / memo churn). */
  const visibleRef = useRef(false);

  useEffect(() => {
    visibleRef.current = state.visible;
  }, [state.visible]);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, []);

  const showNotification = useCallback((config: NotificationConfig) => {
    const delayMs = visibleRef.current ? 80 : 0;

    // If one is already showing, briefly hide first so the animation re-triggers
    setState((prev) =>
      prev.visible
        ? { ...prev, visible: false }
        : prev
    );

    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    // Small delay ensures state flush if we're replacing an active notification
    showTimerRef.current = setTimeout(() => {
      setState({ ...config, visible: true });
      showTimerRef.current = null;
    }, delayMs);
  }, []);

  const handleClose = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
  }, []);

  const contextValue = useMemo(
    () => ({ showNotification }),
    [showNotification]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationDropdown
        visible={state.visible}
        type={state.type}
        message={state.message}
        title={state.title}
        duration={state.duration}
        onClose={handleClose}
      />
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Call `showNotification` from any screen to display a slide-down banner.
 *
 * @example
 * const { showNotification } = useNotification();
 * showNotification({ type: 'success', message: 'Booking confirmed!' });
 */
export function useNotification() {
  return useContext(NotificationContext);
}
