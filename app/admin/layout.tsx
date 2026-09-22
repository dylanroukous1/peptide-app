import { ReactNode } from 'react';
import ProtectedAppLayout from '@/src/components/layout/ProtectedAppLayout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ProtectedAppLayout requiredRole="ADMIN">{children}</ProtectedAppLayout>;
}
