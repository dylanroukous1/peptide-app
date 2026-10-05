'use client';

import { useCallback, useState } from 'react';

export type AppToastSeverity = 'success' | 'error' | 'info' | 'warning';
export type AppToastAction = { label: string; onClick: () => void | Promise<void> };

type ToastState = {
  open: boolean;
  message: string;
  severity: AppToastSeverity;
  action?: AppToastAction;
};

const initialToast: ToastState = {
  open: false,
  message: '',
  severity: 'success',
};

export function useAppToast() {
  const [toast, setToast] = useState<ToastState>(initialToast);

  const showToast = useCallback((message: string, severity: AppToastSeverity = 'success', action?: AppToastAction) => {
    setToast({ open: true, message, severity, action });
  }, []);

  const closeToast = useCallback(() => {
    setToast((current) => ({ ...current, open: false }));
  }, []);

  return { toast, showToast, closeToast };
}
