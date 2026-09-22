import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260922093000_seed_supplide_pricing.sql';
const orderingMigrationPath = 'supabase/migrations/20260922113000_enable_product_ordering.sql';

test('removed wishlist and batch management routes are not addressable', () => {
  assert.equal(existsSync(new URL('../app/wishlist/page.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../app/admin/wishlist/page.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../app/admin/batches/page.tsx', import.meta.url)), false);

  const navigation = read('src/config/navigation.ts').toLowerCase();
  assert.doesNotMatch(navigation, /wishlist|admin\/batches/);
});

test('pricing migration contains exactly 85 unique source products', () => {
  const sql = read(migrationPath);
  const valuePattern = /^\s*\('([^']+)',\s*(\d+\.\d{2})\)[,;]$/gm;
  const rows = [...sql.matchAll(valuePattern)].map((match) => ({
    name: match[1],
    price: match[2],
  }));
  const names = new Set(rows.map((row) => row.name));

  assert.equal(rows.length, 85);
  assert.equal(names.size, 85);
  assert.equal(rows.filter((row) => row.name === 'IGF-1 LR3-1mg').length, 1);
  assert.match(sql, /on conflict \(name\) do update/i);
  assert.match(sql, /is_active = true/i);
});

test('pricing migration preserves representative source names and decimal prices', () => {
  const sql = read(migrationPath);
  const expected = [
    "('BPC-157 10mg', 8.00)",
    "('Retatrutide (GLP-3R) 10mg', 9.50)",
    "('Semaglutide 40mg', 12.50)",
    "('Tirzeptide 140mg - (5ML Vial)', 23.00)",
    "('Wolverine 5/5 TB-500 | BPC-157)', 11.00)",
  ];

  expected.forEach((entry) => assert.ok(sql.includes(entry), `Missing ${entry}`));
  assert.match(sql, /source_count <> 85 or source_unique_count <> 85/);
  assert.match(sql, /matched_active_count <> 85/);
});

test('shared layouts enforce active role access while keeping navigation mounted', () => {
  const protectedLayout = read('src/components/layout/ProtectedAppLayout/index.tsx');
  const adminLayout = read('app/admin/layout.tsx');
  const userLayout = read('app/(portal)/layout.tsx');
  const sessionProvider = read('src/hooks/useSessionUser.tsx');

  assert.match(protectedLayout, /profile\?\.role === requiredRole/);
  assert.match(protectedLayout, /profile\.account_status === 'ACTIVE'/);
  assert.match(protectedLayout, /<AppShell[\s\S]*hasAccess \? children/);
  assert.match(adminLayout, /requiredRole="ADMIN"/);
  assert.match(userLayout, /requiredRole="USER"/);
  assert.equal((sessionProvider.match(/onAuthStateChange/g) || []).length, 1);
});

test('peptide create and edit paths validate positive prices and update local data', () => {
  const screen = read('src/screens/AdminPeptidesScreen/index.tsx');
  assert.match(screen, /price <= 0/);
  assert.match(screen, /\.from\('peptides'\)[\s\S]*?\.insert/);
  assert.match(screen, /\.from\('peptides'\)[\s\S]*?\.update/);
  assert.match(screen, /setPeptides\(\(current\)/);
  assert.match(screen, /htmlInput: \{ min: 0\.01, step: 0\.01 \}/);
});

test('responsive navigation and loading states expose accessible controls', () => {
  const topbar = read('src/components/layout/Topbar/index.tsx');
  const sideNav = read('src/components/layout/SideNav/index.tsx');
  const shellStyles = read('src/components/layout/AppShell/styles.ts');
  const skeleton = read('src/components/feedback/PageSkeleton/index.tsx');

  assert.match(topbar, /aria-label="Open primary navigation"/);
  assert.match(topbar, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(sideNav, /aria-current=\{active \? 'page'/);
  assert.match(sideNav, /aria-label="Close navigation"/);
  assert.match(shellStyles, /breakpoints\.down\('md'\)/);
  assert.match(skeleton, /role="status"/);
  assert.ok(existsSync(new URL('../app/admin/loading.tsx', import.meta.url)));
  assert.ok(existsSync(new URL('../app/(portal)/loading.tsx', import.meta.url)));
});

test('dates are deterministic and privileged keys stay server-only', () => {
  const screens = [
    'AdminAuditScreen',
    'AdminCompaniesScreen',
    'AdminOrdersScreen',
    'AdminPeptidesScreen',
    'AdminUsersScreen',
    'UserDashboardScreen',
    'UserOrdersScreen',
  ].map((name) => read(`src/screens/${name}/index.tsx`)).join('\n');

  assert.doesNotMatch(screens, /toLocaleDateString\(\)/);
  assert.doesNotMatch(screens, /toLocaleString\(\)/);
  assert.doesNotMatch(screens, /Math\.random/);
  assert.match(screens, /timeZone: 'UTC'/);

  const client = read('src/supabase/client.ts');
  const admin = read('src/lib/supabase/admin.ts');
  assert.doesNotMatch(client, /SERVICE_ROLE/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('orders, shipments, audit logs, email events, and RLS remain intact', () => {
  const baseMigration = read('supabase/migrations/20260504_initial_peptide_schema.sql');
  const orderScreen = read('src/screens/AdminOrdersScreen/index.tsx');
  const auditScreen = read('src/screens/AdminAuditScreen/index.tsx');

  for (const table of ['orders', 'batches', 'batch_pricing_tiers', 'wishlist_requests', 'shipments', 'email_events', 'audit_logs']) {
    assert.match(baseMigration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(baseMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(orderScreen, /shipment:shipments/);
  assert.match(orderScreen, /admin_update_order_status/);
  assert.match(auditScreen, /\.from\('audit_logs'\)/);
  assert.match(auditScreen, /\.from\('email_events'\)/);
});

test('product orders preserve historical batches while making new batch references optional', () => {
  const sql = read(orderingMigrationPath);
  const userHistory = read('src/screens/UserOrdersScreen/index.tsx');
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');

  assert.match(sql, /add column if not exists peptide_id uuid references public\.peptides/);
  assert.match(sql, /set peptide_id = b\.peptide_id[\s\S]*where o\.batch_id = b\.id/);
  assert.match(sql, /alter column peptide_id set not null/);
  assert.match(sql, /alter column batch_id drop not null/);
  assert.doesNotMatch(sql, /delete from public\.(orders|batches)/i);
  assert.match(userHistory, /peptide:peptides\(name\)/);
  assert.match(userHistory, /order\.peptide\?\.name \|\| order\.batch\?\.peptide\?\.name/);
  assert.match(adminOrders, /Direct catalog order/);
});

test('successful order submission snapshots the authoritative active peptide price', () => {
  const sql = read(orderingMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');

  assert.match(sql, /create or replace function public\.submit_product_order/);
  assert.match(sql, /where p\.id = p_peptide_id[\s\S]*p\.is_active = true/);
  assert.match(sql, /unit_price_at_submission,[\s\S]*total_price/);
  assert.match(sql, /v_unit_price \* p_requested_quantity/);
  assert.match(sql, /batch_id,[\s\S]*null,/);
  assert.match(orderForm, /\.rpc\('submit_product_order'/);
  assert.match(orderForm, /View order history/);
});

test('order RPC rejects invalid identity, quantity, product, and cross-company address input', () => {
  const sql = read(orderingMigrationPath);

  assert.match(sql, /if v_user_id is null/);
  assert.match(sql, /p\.account_status = 'ACTIVE'/);
  assert.match(sql, /p_requested_quantity is null or p_requested_quantity <= 0/);
  assert.match(sql, /The selected peptide is not active/);
  assert.match(sql, /a\.company_id = v_company_id/);
  assert.match(sql, /The shipping address does not belong to your company/);
});

test('client cannot alter price and direct user order inserts are removed', () => {
  const sql = read(orderingMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');
  const rpcArguments = orderForm.match(/\.rpc\('submit_product_order',[\s\S]*?\n\s*}\)/)?.[0] || '';

  assert.match(sql, /drop policy if exists "users insert own orders"/);
  assert.doesNotMatch(sql, /p_unit_price|p_total_price/);
  assert.doesNotMatch(rpcArguments, /unit_price|total_price/);
  assert.match(sql, /select p\.default_unit_price[\s\S]*into v_unit_price/);
});

test('admins can see and process direct and historical orders', () => {
  const sql = read(orderingMigrationPath);
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const baseMigration = read('supabase/migrations/20260504_initial_peptide_schema.sql');

  assert.match(baseMigration, /create policy "admins manage orders"/);
  assert.match(adminOrders, /peptide:peptides\(name\)/);
  assert.match(adminOrders, /batch:batches/);
  assert.match(adminOrders, /admin_update_order_status/);
  assert.match(sql, /p\.role = 'ADMIN'[\s\S]*p\.account_status = 'ACTIVE'/);
  assert.match(sql, /ORDER_STATUS_UPDATED/);
});

test('ordering UI validates whole quantities, supports address creation, and documents MOQ review', () => {
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');

  assert.match(orderForm, /Number\.isInteger\(parsedQuantity\)/);
  assert.match(orderForm, /positive whole number/);
  assert.match(orderForm, /\.from\('company_addresses'\)[\s\S]*\.insert/);
  assert.match(orderForm, /250 vials per SKU and 2,000 vials overall/);
  assert.match(orderForm, /disabled=\{submitting/);
  assert.match(orderForm, /role="status"/);
});

test('create user fields have unambiguous mapping and browser autocomplete purposes', () => {
  const screen = read('src/screens/AdminUsersScreen/index.tsx');

  assert.match(screen, /id="create-user-email"[\s\S]*name="email"[\s\S]*autoComplete="email"/);
  assert.match(screen, /id="create-user-first-name"[\s\S]*name="firstName"[\s\S]*autoComplete="given-name"/);
  assert.match(screen, /id="create-user-last-name"[\s\S]*name="lastName"[\s\S]*autoComplete="family-name"/);
  assert.match(screen, /id="create-user-password"[\s\S]*name="newPassword"[\s\S]*autoComplete="new-password"/);
  assert.match(screen, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(screen, /type="submit"[\s\S]*disabled=\{creatingUser\}/);
});

test('access-request prefill maps every identity value to the correct create-user field', () => {
  const screen = read('src/screens/AdminUsersScreen/index.tsx');
  const prefill = screen.match(/const prefillCreateFromRequest[\s\S]*?\n  };/)?.[0] || '';

  assert.match(prefill, /email: request\.email/);
  assert.match(prefill, /firstName: request\.first_name/);
  assert.match(prefill, /lastName: request\.last_name/);
  assert.match(prefill, /companyId: matchedCompanyId/);
});

test('create-user layout uses three, two, and one responsive columns', () => {
  const styles = read('src/screens/AdminUsersScreen/styles.ts');
  assert.match(styles, /gridTemplateColumns: 'repeat\(3, minmax\(0, 1fr\)\)'/);
  assert.match(styles, /breakpoints\.down\('lg'\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /breakpoints\.down\('sm'\)[\s\S]*gridTemplateColumns: '1fr'/);
});

test('audit activity is human-readable with safe actor and status fallbacks', () => {
  const formatter = read('src/lib/audit/formatAuditEvent.ts');
  const screen = read('src/screens/AdminAuditScreen/index.tsx');

  assert.match(formatter, /return 'System'/);
  assert.match(formatter, /'Unknown administrator'/);
  assert.match(formatter, /changed order \$\{orderNumber\} from \$\{before\} to \$\{after\}/);
  assert.match(formatter, /split\('_'\)/);
  assert.match(formatter, /password\|token\|secret\|service/);
  assert.match(screen, /component="details"/);
  assert.match(screen, /component="summary"[\s\S]*View details/);
  assert.doesNotMatch(screen, /Update Actions|Create Actions|Actor User ID/);
});

test('large peptide and company lists support persisted search and empty results', () => {
  const peptides = read('src/screens/AdminPeptidesScreen/index.tsx');
  const companies = read('src/screens/AdminCompaniesScreen/index.tsx');
  const globals = read('app/globals.css');

  assert.match(peptides, /admin-peptide-search/);
  assert.match(peptides, /search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(peptides, /No matching products/);
  assert.match(companies, /admin-company-search/);
  assert.match(companies, /search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(companies, /No matching companies/);
  assert.match(globals, /\.record-results[\s\S]*max-height: min\(62vh, 760px\)/);
  assert.match(globals, /\.record-results thead th[\s\S]*position: sticky/);
});

test('customer-facing and shared shell copy uses Supplide branding', () => {
  const brandedFiles = [
    'app/layout.tsx',
    'src/components/layout/SideNav/index.tsx',
    'src/components/layout/Topbar/index.tsx',
    'src/screens/LoginScreen/index.tsx',
    'src/screens/AccessRequestScreen/index.tsx',
  ].map(read).join('\n');

  assert.match(brandedFiles, /Supplide/);
  assert.doesNotMatch(brandedFiles, /Hola Peptides|Peptide Production Allocation Platform|Peptide Platform/i);
});

test('login uses a deterministic client-only boundary to prevent auth hydration mismatch', () => {
  const loginClient = read('app/login/LoginClient.tsx');
  const loginPage = read('app/login/page.tsx');

  assert.match(loginClient, /'use client'/);
  assert.match(loginClient, /dynamic\(\(\) => import\('@\/src\/screens\/LoginScreen'\)/);
  assert.match(loginClient, /ssr: false/);
  assert.match(loginClient, /Loading Supplide/);
  assert.match(loginPage, /<LoginClient \/>/);
  assert.doesNotMatch(loginPage, /LoginScreen/);
});

test('peptide and company results use localized responsive scrolling', () => {
  const adminPeptides = read('src/screens/AdminPeptidesScreen/index.tsx');
  const adminCompanies = read('src/screens/AdminCompaniesScreen/index.tsx');
  const customerProducts = read('src/screens/UserDashboardScreen/index.tsx');
  const globals = read('app/globals.css');

  assert.match(adminPeptides, /<ListWrap className="record-results">/);
  assert.match(adminCompanies, /<ListWrap className="record-results">/);
  assert.match(customerProducts, /<ProductList className="record-results">/);
  assert.match(globals, /\.record-results[\s\S]*overflow-y: auto/);
  assert.match(globals, /@media \(max-width: 899px\)[\s\S]*overflow-y: visible/);
});

test('admin header chip uses Supplide branding without changing profile data', () => {
  const topbar = read('src/components/layout/Topbar/index.tsx');
  assert.match(topbar, /const displayName = userRole === 'ADMIN' \? 'Supplide' : userName/);
  assert.match(topbar, /\{displayName\}/);
});

test('login synchronizes the shared profile before first navigation and announces progress', () => {
  const sessionProvider = read('src/hooks/useSessionUser.tsx');
  const login = read('src/screens/LoginScreen/index.tsx');

  assert.match(sessionProvider, /syncSession: \(\) => Promise<SessionProfile \| null>/);
  assert.match(sessionProvider, /setLoading\(true\)[\s\S]*loadingUserIdRef\.current = user\.id/);
  assert.match(login, /const dbProfile = await syncSession\(\)/);
  assert.doesNotMatch(login, /supabase\.auth\.getUser/);
  assert.match(login, /open=\{submitting\}/);
  assert.match(login, /Signing you in…/);
  assert.match(login, /role="status"/);
});
