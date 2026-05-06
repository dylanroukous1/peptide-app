'use client';

import { useEffect, useState } from 'react';
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

export function useSessionUser() {
  const [authUser, setAuthUser] = useState<any>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      setAuthUser(user ?? null);

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, account_status, company_id')
        .eq('id', user.id)
        .single();

      if (!mounted) return;

      if (error) {
        console.error('Error loading profile:', error.message);
        setProfile(null);
      } else {
        setProfile(data);
      }

      setLoading(false);
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { authUser, profile, loading };
}