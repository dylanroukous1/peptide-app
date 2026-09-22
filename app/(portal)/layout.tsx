import { ReactNode } from 'react';
import ProtectedAppLayout from '@/src/components/layout/ProtectedAppLayout';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <ProtectedAppLayout requiredRole="USER">{children}</ProtectedAppLayout>;
}
