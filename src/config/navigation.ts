export type AppRole = 'ADMIN' | 'USER';

export const adminPageOptions = [
  { key: 'orders', label: 'Orders', href: '/admin/orders' },
  { key: 'peptides', label: 'Peptides', href: '/admin/peptides' },
  { key: 'companies', label: 'Companies', href: '/admin/companies' },
  { key: 'users', label: 'Users', href: '/admin/users' },
  { key: 'audit', label: 'Audit', href: '/admin/audit' },
] as const;

export type AdminPageKey = (typeof adminPageOptions)[number]['key'];
export type AdminPagePath = (typeof adminPageOptions)[number]['href'];
export const allAdminPageKeys = adminPageOptions.map((page) => page.key);

export function allowedAdminPages(access?: readonly string[] | null) {
  return access == null
    ? adminPageOptions
    : adminPageOptions.filter((page) => access.includes(page.key));
}

export function getAdminLandingPath(access?: readonly string[] | null): AdminPagePath {
  return allowedAdminPages(access)[0]?.href || '/admin/orders';
}

export function hasAdminPageAccess(pathname: string, access?: readonly string[] | null) {
  const page = adminPageOptions.find((item) => item.href === pathname);
  if (!pathname.startsWith('/admin/')) return true;
  return Boolean(page && allowedAdminPages(access).some((item) => item.key === page.key));
}

export type NavigationItem = {
  label: string;
  href: string;
};

type RouteDetails = {
  title: string;
  subtitle: string;
};

export const adminNavigation: NavigationItem[] = adminPageOptions.map(({ label, href }) => ({ label, href }));

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
