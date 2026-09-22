export type AppRole = 'ADMIN' | 'USER';

export type NavigationItem = {
  label: string;
  href: string;
};

type RouteDetails = {
  title: string;
  subtitle: string;
};

export const adminNavigation: NavigationItem[] = [
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Peptides', href: '/admin/peptides' },
  { label: 'Companies', href: '/admin/companies' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Audit', href: '/admin/audit' },
];

export const userNavigation: NavigationItem[] = [
  { label: 'Order', href: '/dashboard' },
  { label: 'Peptides', href: '/peptides' },
  { label: 'My Orders', href: '/my-orders' },
  { label: 'Account', href: '/account' },
];

const routeDetails: Record<string, RouteDetails> = {
  '/admin/orders': {
    title: 'Order Management',
    subtitle: 'Review and update orders across partner companies',
  },
  '/admin/peptides': {
    title: 'Peptide Catalog',
    subtitle: 'Maintain catalog availability and distributor pricing',
  },
  '/admin/companies': {
    title: 'Companies',
    subtitle: 'Manage partner organizations and billing contacts',
  },
  '/admin/users': {
    title: 'Users & Access',
    subtitle: 'Review requests, roles, status, and company access',
  },
  '/admin/audit': {
    title: 'Audit & Email Events',
    subtitle: 'Trace system activity and outbound notifications',
  },
  '/dashboard': {
    title: 'Place an Order',
    subtitle: 'Review available inventory and submit a company order',
  },
  '/peptides': {
    title: 'Peptide Catalog',
    subtitle: 'View active products and current distributor pricing',
  },
  '/my-orders': {
    title: 'My Orders',
    subtitle: 'Track submitted, approved, and fulfilled orders',
  },
  '/account': {
    title: 'Account & Addresses',
    subtitle: 'Manage your company profile and shipping destinations',
  },
};

export function getRouteDetails(pathname: string, role: AppRole): RouteDetails {
  return (
    routeDetails[pathname] || {
      title: role === 'ADMIN' ? 'Administration' : 'Partner Portal',
      subtitle: 'Secure peptide ordering operations',
    }
  );
}
