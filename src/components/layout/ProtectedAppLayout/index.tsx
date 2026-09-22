'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/src/components/layout/AppShell';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import {
  adminNavigation,
  AppRole,
  getRouteDetails,
  userNavigation,
} from '@/src/config/navigation';
import { useSessionUser } from '@/src/hooks/useSessionUser';

type ProtectedAppLayoutProps = {
  children: ReactNode;
  requiredRole: AppRole;
};

export default function ProtectedAppLayout({
  children,
  requiredRole,
}: ProtectedAppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useSessionUser();
  const details = getRouteDetails(pathname, requiredRole);
  const navItems = requiredRole === 'ADMIN' ? adminNavigation : userNavigation;
  const hasAccess =
    profile?.role === requiredRole && profile.account_status === 'ACTIVE';

  useEffect(() => {
    if (loading || hasAccess) return;

    if (profile?.account_status === 'ACTIVE') {
      router.replace(profile.role === 'ADMIN' ? '/admin/orders' : '/dashboard');
      return;
    }

    router.replace('/login');
  }, [hasAccess, loading, profile, router]);

  return (
    <AppShell title={details.title} subtitle={details.subtitle} navItems={navItems}>
      {hasAccess ? children : <PageSkeleton label="Checking account access" />}
    </AppShell>
  );
}
