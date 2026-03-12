import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmationModal, ConfirmationType } from '@/components/ui/ConfirmationModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmConfig {
  type?: ConfirmationType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmationContextValue {
  confirm: (config: ConfirmConfig) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ConfirmationContext = createContext<ConfirmationContextValue>({
  confirm: () => Promise.resolve(false),
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ConfirmConfig>({ title: '', message: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((cfg: ConfirmConfig): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setConfig(cfg);
      setVisible(true);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setVisible(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setVisible(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <ConfirmationModal
        visible={visible}
        type={config.type}
        title={config.title}
        message={config.message}
        confirmText={config.confirmText}
        cancelText={config.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Displays a custom animated confirmation modal.
 * Returns a Promise that resolves to `true` if confirmed, `false` if cancelled.
 *
 * @example
 * const { confirm } = useConfirmation();
 * const ok = await confirm({ type: 'danger', title: 'Delete', message: 'This cannot be undone.' });
 * if (ok) { ...perform action... }
 */
export function useConfirmation() {
  return useContext(ConfirmationContext);
}
