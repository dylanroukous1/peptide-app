'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

type AppRole = 'ADMIN' | 'USER';
type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export type SessionProfile = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: AppRole;
  account_status: AccountStatus;
  company_id: string | null;
};

type SessionContextValue = {
  authUser: User | null;
  profile: SessionProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef<User | null>(null);
  const profileRef = useRef<SessionProfile | null>(null);
  const loadingUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (user: User | null, force = false) => {
    currentUserRef.current = user;
    setAuthUser(user);

    if (!user) {
      setProfile(null);
      profileRef.current = null;
      loadingUserIdRef.current = null;
      setLoading(false);
      return;
    }

    if (
      !force &&
      (profileRef.current?.id === user.id || loadingUserIdRef.current === user.id)
    ) {
      return;
    }

    loadingUserIdRef.current = user.id;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, account_status, company_id')
      .eq('id', user.id)
      .single();

    if (currentUserRef.current?.id !== user.id) {
      if (loadingUserIdRef.current === user.id) loadingUserIdRef.current = null;
      return;
    }

    if (error) {
      console.error('Error loading profile:', error.message);
      setProfile(null);
      profileRef.current = null;
    } else {
      setProfile(data);
      profileRef.current = data;
    }

    setLoading(false);
    loadingUserIdRef.current = null;
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(currentUserRef.current, true);
  }, [loadProfile]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadProfile(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if (nextUser?.id === currentUserRef.current?.id && profileRef.current) return;
      window.setTimeout(() => {
        if (active) void loadProfile(nextUser);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo(
    () => ({ authUser, profile, loading, refreshProfile }),
    [authUser, loading, profile, refreshProfile]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionUser must be used within SessionProvider.');
  }
  return context;
}
