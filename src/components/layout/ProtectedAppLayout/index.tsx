'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppShell from '@/src/components/layout/AppShell';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import {
  allowedAdminPages,
  AppRole,
  getAdminLandingPath,
  getRouteDetails,
  hasAdminPageAccess,
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
  const navItems = requiredRole === 'ADMIN'
    ? allowedAdminPages(profile?.admin_page_access).map(({ label, href }) => ({ label, href }))
    : userNavigation;
  const hasRoleAccess =
    profile?.role === requiredRole && profile.account_status === 'ACTIVE';
  const hasAccess = hasRoleAccess && (requiredRole !== 'ADMIN' || hasAdminPageAccess(pathname, profile?.admin_page_access));

  useEffect(() => {
    if (loading || hasAccess) return;

    if (profile?.account_status === 'ACTIVE' && profile.role === 'ADMIN') {
      router.replace(getAdminLandingPath(profile.admin_page_access));
      return;
    }

    if (profile?.account_status === 'ACTIVE') {
      router.replace('/dashboard');
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
