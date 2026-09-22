'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export function useSessionStorageState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedValue = window.sessionStorage.getItem(key);
        if (storedValue) setValue(JSON.parse(storedValue) as T);
      } catch {
        window.sessionStorage.removeItem(key);
      } finally {
        setHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(key, JSON.stringify(value));
  }, [hydrated, key, value]);

  return [value, setValue];
}
