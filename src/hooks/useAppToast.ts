'use client';

import { useCallback, useState } from 'react';

export type AppToastSeverity = 'success' | 'error' | 'info' | 'warning';

type ToastState = {
  open: boolean;
  message: string;
  severity: AppToastSeverity;
};

const initialToast: ToastState = {
  open: false,
  message: '',
  severity: 'success',
};

export function useAppToast() {
  const [toast, setToast] = useState<ToastState>(initialToast);

  const showToast = useCallback((message: string, severity: AppToastSeverity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  const closeToast = useCallback(() => {
    setToast((current) => ({ ...current, open: false }));
  }, []);

  return { toast, showToast, closeToast };
}
