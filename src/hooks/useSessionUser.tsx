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
import {
  loadPreparedWorkspace,
  type PreparedWorkspace,
} from '@/src/lib/workspace/loadWorkspace';

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
  preparedWorkspace: PreparedWorkspace | null;
  clearPreparedWorkspace: () => void;
  resetSession: () => void;
  prepareWorkspace: (profile: SessionProfile) => Promise<PreparedWorkspace>;
  refreshProfile: () => Promise<void>;
  resolveUser: (user: User) => Promise<SessionProfile | null>;
  syncSession: () => Promise<SessionProfile | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [preparedWorkspace, setPreparedWorkspace] = useState<PreparedWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef<User | null>(null);
  const profileRef = useRef<SessionProfile | null>(null);
  const profileRequestRef = useRef<{
    userId: string;
    promise: Promise<SessionProfile | null>;
  } | null>(null);
  const preparedWorkspaceRef = useRef<PreparedWorkspace | null>(null);
  const workspaceRequestRef = useRef<{
    userId: string;
    promise: Promise<PreparedWorkspace>;
  } | null>(null);

  const clearPreparedWorkspace = useCallback(() => {
    preparedWorkspaceRef.current = null;
    workspaceRequestRef.current = null;
    setPreparedWorkspace(null);
  }, []);

  const resetSession = useCallback(() => {
    currentUserRef.current = null;
    profileRef.current = null;
    profileRequestRef.current = null;
    setAuthUser(null);
    setProfile(null);
    setLoading(false);
    clearPreparedWorkspace();
  }, [clearPreparedWorkspace]);

  const loadProfile = useCallback(async (user: User | null, force = false) => {
    const previousUserId = currentUserRef.current?.id;
    currentUserRef.current = user;
    setAuthUser(user);

    if (!user) {
      setProfile(null);
      profileRef.current = null;
      profileRequestRef.current = null;
      clearPreparedWorkspace();
      setLoading(false);
      return null;
    }

    if (previousUserId && previousUserId !== user.id) {
      setProfile(null);
      profileRef.current = null;
      clearPreparedWorkspace();
    }

    if (!force && profileRef.current?.id === user.id) {
      return profileRef.current;
    }

    if (profileRequestRef.current?.userId === user.id) {
      return profileRequestRef.current.promise;
    }

    setLoading(true);

    const request = (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, account_status, company_id')
        .eq('id', user.id)
        .single();

      if (currentUserRef.current?.id !== user.id) return null;

      if (error) {
        console.error('Unable to load account profile:', error.message);
        setProfile(null);
        profileRef.current = null;
      } else {
        setProfile(data);
        profileRef.current = data;
      }

      setLoading(false);
      return error ? null : data;
    })().finally(() => {
      if (profileRequestRef.current?.userId === user.id) {
        profileRequestRef.current = null;
      }
    });

    profileRequestRef.current = { userId: user.id, promise: request };
    return request;
  }, [clearPreparedWorkspace]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(currentUserRef.current, true);
  }, [loadProfile]);

  const syncSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setLoading(false);
      return null;
    }
    return loadProfile(data.session?.user ?? null);
  }, [loadProfile]);

  const resolveUser = useCallback(
    (user: User) => loadProfile(user),
    [loadProfile]
  );

  const prepareWorkspace = useCallback(async (nextProfile: SessionProfile) => {
    const user = currentUserRef.current;
    if (!user || user.id !== nextProfile.id) {
      throw new Error('The authenticated account changed while preparing the workspace.');
    }
    if (preparedWorkspaceRef.current?.userId === user.id) {
      return preparedWorkspaceRef.current;
    }
    if (workspaceRequestRef.current?.userId === user.id) {
      return workspaceRequestRef.current.promise;
    }

    const request = loadPreparedWorkspace(user, nextProfile)
      .then((workspace) => {
        if (currentUserRef.current?.id !== user.id) {
          throw new Error('The authenticated account changed while preparing the workspace.');
        }
        preparedWorkspaceRef.current = workspace;
        setPreparedWorkspace(workspace);
        return workspace;
      })
      .finally(() => {
        if (workspaceRequestRef.current?.userId === user.id) {
          workspaceRequestRef.current = null;
        }
      });

    workspaceRequestRef.current = { userId: user.id, promise: request };
    return request;
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        console.error('Unable to restore authentication session:', error.message);
        resetSession();
        return;
      }
      await loadProfile(data.session?.user ?? null);
    };

    void restoreSession();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void restoreSession();
    };
    window.addEventListener('pageshow', handlePageShow);

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
      window.removeEventListener('pageshow', handlePageShow);
      subscription.unsubscribe();
    };
  }, [loadProfile, resetSession]);

  const value = useMemo(
    () => ({
      authUser,
      profile,
      loading,
      preparedWorkspace,
      clearPreparedWorkspace,
      prepareWorkspace,
      resetSession,
      refreshProfile,
      resolveUser,
      syncSession,
    }),
    [
      authUser,
      clearPreparedWorkspace,
      loading,
      prepareWorkspace,
      preparedWorkspace,
      profile,
      refreshProfile,
      resetSession,
      resolveUser,
      syncSession,
    ]
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
