import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260922093000_seed_supplide_pricing.sql';
const multiOrderingMigrationPath = 'supabase/migrations/20260923090000_enable_multi_product_orders.sql';

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
  const workspaceLoader = read('src/lib/workspace/loadWorkspace.ts');
  const auditScreen = read('src/screens/AdminAuditScreen/index.tsx');

  for (const table of ['orders', 'batches', 'batch_pricing_tiers', 'wishlist_requests', 'shipments', 'email_events', 'audit_logs']) {
    assert.match(baseMigration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(baseMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(workspaceLoader, /shipment:shipments/);
  assert.match(orderScreen, /admin_update_order_status/);
  assert.match(auditScreen, /\.from\('audit_logs'\)/);
  assert.match(auditScreen, /\.from\('email_events'\)/);
});

test('order_items schema is constrained, indexed, and protected by RLS', () => {
  const sql = read(multiOrderingMigrationPath);

  assert.match(sql, /create table if not exists public\.order_items/);
  assert.match(sql, /order_id uuid not null references public\.orders\(id\) on delete cascade/);
  assert.match(sql, /peptide_id uuid not null references public\.peptides\(id\) on delete restrict/);
  assert.match(sql, /requested_quantity integer not null check \(requested_quantity > 0\)/);
  assert.match(sql, /unit_price_at_submission numeric\(12,2\) not null check \(unit_price_at_submission >= 0\)/);
  assert.match(sql, /unique \(order_id, peptide_id\)/);
  assert.match(sql, /idx_order_items_order_id/);
  assert.match(sql, /idx_order_items_peptide_id/);
  assert.match(sql, /alter table public\.order_items enable row level security/);
  assert.match(sql, /active admins manage order items/);
  assert.match(sql, /users read own order items/);
  assert.doesNotMatch(sql, /create policy "users (insert|update).*order items/i);
});

test('historical orders are backfilled once and retain legacy batch references', () => {
  const sql = read(multiOrderingMigrationPath);

  assert.match(sql, /insert into public\.order_items[\s\S]*from public\.orders o/);
  assert.match(sql, /on conflict \(order_id, peptide_id\) do nothing/);
  assert.match(sql, /existing order could not be backfilled safely/);
  assert.match(sql, /alter column peptide_id drop not null/);
  assert.doesNotMatch(sql, /alter column batch_id|delete from public\.(orders|batches)/i);
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
});

test('multi-item submission snapshots active database prices and inserts atomically', () => {
  const sql = read(multiOrderingMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');

  assert.match(sql, /create or replace function public\.submit_multi_product_order/);
  assert.match(sql, /select p\.default_unit_price[\s\S]*p\.is_active = true[\s\S]*for share/);
  assert.match(sql, /v_line_total := v_unit_price \* v_quantity/);
  assert.match(sql, /insert into public\.orders[\s\S]*insert into public\.order_items/);
  assert.match(sql, /v_total_price[\s\S]*'SUBMITTED'/);
  assert.match(orderForm, /\.rpc\('submit_multi_product_order'/);
  assert.match(orderForm, /Open order in history/);
});

test('multi-order RPC enforces exact MOQ boundaries and rejects invalid quantities', () => {
  const sql = read(multiOrderingMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');

  assert.match(sql, /v_quantity_numeric < 250/);
  assert.doesNotMatch(sql, /v_quantity_numeric <= 250/);
  assert.match(sql, /v_total_quantity < 2000/);
  assert.doesNotMatch(sql, /v_total_quantity <= 2000/);
  assert.match(sql, /v_quantity_numeric <> trunc\(v_quantity_numeric\)/);
  assert.match(orderForm, /const SKU_MINIMUM = 250/);
  assert.match(orderForm, /const ORDER_MINIMUM = 2000/);
  assert.match(orderForm, /Number\.isInteger\(quantity\)/);
});

test('multi-order RPC rejects duplicates, malformed JSON, inactive products, and excess fields', () => {
  const sql = read(multiOrderingMigrationPath);

  assert.match(sql, /jsonb_typeof\(p_items\) <> 'array'/);
  assert.match(sql, /jsonb_typeof\(v_item\) <> 'object'/);
  assert.match(sql, /where key not in \('peptide_id', 'requested_quantity'\)/);
  assert.match(sql, /v_peptide_id = any\(v_seen_peptides\)/);
  assert.match(sql, /Each peptide may appear only once per order/);
  assert.match(sql, /p\.is_active = true/);
  assert.match(sql, /selected peptides are missing or inactive/);
});

test('RPC authenticates active users and prevents cross-company orders and addresses', () => {
  const sql = read(multiOrderingMigrationPath);

  assert.match(sql, /if v_user_id is null/);
  assert.match(sql, /p\.role = 'USER'/);
  assert.match(sql, /p\.account_status = 'ACTIVE'/);
  assert.match(sql, /c\.is_active = true/);
  assert.match(sql, /a\.company_id = v_company_id/);
  assert.match(sql, /shipping address does not belong to your company/);
  assert.doesNotMatch(sql, /p_company_id|p_user_id/);
});

test('client cannot alter prices or totals and a bad line rolls back the entire order', () => {
  const sql = read(multiOrderingMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');
  const rpcArguments = orderForm.match(/\.rpc\('submit_multi_product_order',[\s\S]*?\n\s*}\)/)?.[0] || '';

  assert.doesNotMatch(rpcArguments, /unit_price|line_total|total_price|company_id|user_id/);
  assert.match(sql, /Each item must contain only peptide_id and requested_quantity/);
  assert.match(sql, /drop policy if exists "users insert own orders"/);
  assert.match(sql, /v_validated_items[\s\S]*insert into public\.orders[\s\S]*insert into public\.order_items/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
});

test('legacy ordering RPC cannot bypass multi-product minimums', () => {
  const sql = read(multiOrderingMigrationPath);
  const application = [
    read('src/screens/UserDashboardScreen/index.tsx'),
    read('src/screens/UserOrdersScreen/index.tsx'),
    read('src/screens/AdminOrdersScreen/index.tsx'),
  ].join('\n');

  assert.match(sql, /revoke all on function public\.submit_product_order\(uuid, uuid, integer, text\) from authenticated/);
  assert.doesNotMatch(application, /\.rpc\('submit_product_order'/);
  assert.match(sql, /grant execute on function public\.submit_multi_product_order\(uuid, jsonb, text\) to authenticated/);
});

test('customer history and admin review fetch and render nested order items without waterfalls', () => {
  const userHistory = read('src/screens/UserOrdersScreen/index.tsx');
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const workspaceLoader = read('src/lib/workspace/loadWorkspace.ts');

  for (const screen of [userHistory, adminOrders]) {
    assert.match(screen, /item\.peptide\?\.name/);
    assert.match(screen, /approved_quantity/);
    assert.match(screen, /unit_price_final/);
    assert.match(screen, /line_total/);
  }
  assert.match(userHistory, /items:order_items\(/);
  assert.match(workspaceLoader, /items:order_items\(/);
  assert.match(userHistory, /company:companies\(name\)/);
  assert.match(userHistory, /Company \/ Customer/);
  assert.match(workspaceLoader, /batch:batches/);
  assert.match(adminOrders, /admin_update_order_status/);
  assert.match(adminOrders, /Direct catalog order/);
});

test('admin approval updates every item while preserving legacy header values', () => {
  const sql = read(multiOrderingMigrationPath);

  assert.match(sql, /if p_new_status = 'APPROVED'[\s\S]*update public\.order_items/);
  assert.match(sql, /approved_quantity = coalesce\(approved_quantity, requested_quantity\)/);
  assert.match(sql, /unit_price_final = coalesce\(unit_price_final, unit_price_at_submission\)/);
  assert.match(sql, /requested_quantity is not null/);
  assert.match(sql, /p\.role = 'ADMIN'[\s\S]*p\.account_status = 'ACTIVE'/);
  assert.match(sql, /ORDER_STATUS_UPDATED/);
});

test('responsive order builder supports search, addresses, review, progress, and duplicate prevention', () => {
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');
  const styles = read('src/screens/UserDashboardScreen/styles.ts');

  assert.match(orderForm, /customer-order-product-search/);
  assert.match(orderForm, /current\.some\(\(item\) => item\.peptideId === peptideId\)/);
  assert.match(orderForm, /\.from\('company_addresses'\)[\s\S]*\.insert/);
  assert.match(orderForm, /Order minimum progress/);
  assert.match(orderForm, /disabled=\{!canSubmit\}/);
  assert.match(orderForm, /role="status"/);
  assert.match(styles, /breakpoints\.down\('lg'\)[\s\S]*gridTemplateColumns: '1fr'/);
  assert.match(styles, /breakpoints\.down\('sm'\)/);
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
  assert.match(formatter, /submitted order \$\{orderNumber\} containing/);
  assert.match(formatter, /approved order \$\{orderNumber\} containing/);
  assert.match(formatter, /totalQuantity\.toLocaleString\('en-US'\)/);
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

test('login uses deterministic fallback markup to prevent auth hydration mismatch', () => {
  const login = read('src/screens/LoginScreen/index.tsx');
  const loginPage = read('app/login/page.tsx');

  assert.match(login, /useSyncExternalStore\(subscribeToClient, \(\) => true, \(\) => false\)/);
  assert.match(login, /if \(!mounted\)[\s\S]*login-route-loading/);
  assert.match(login, /Preparing your workspace…/);
  assert.match(loginPage, /<LoginScreen \/>/);
  assert.doesNotMatch(loginPage, /LoginClient/);
});

test('peptide and company results use localized responsive scrolling', () => {
  const adminPeptides = read('src/screens/AdminPeptidesScreen/index.tsx');
  const adminCompanies = read('src/screens/AdminCompaniesScreen/index.tsx');
  const customerProducts = read('src/screens/UserDashboardScreen/index.tsx');
  const globals = read('app/globals.css');

  assert.match(adminPeptides, /containerComponent=\{ListWrap\}/);
  assert.match(adminCompanies, /containerComponent=\{ListWrap\}/);
  assert.match(customerProducts, /containerComponent=\{ProductList\}/);
  assert.match(globals, /\.record-results[\s\S]*overflow-y: auto/);
  assert.match(globals, /@media \(max-width: 899px\)[\s\S]*overflow-y: visible/);
});

test('scroll affordances detect real overflow and disappear at each scroll boundary', () => {
  const component = read('src/components/feedback/ScrollableResults/index.tsx');
  const hook = read('src/hooks/useScrollOverflow.ts');
  const globals = read('app/globals.css');

  assert.match(hook, /scrollHeight - element\.clientHeight > 2/);
  assert.match(hook, /scrollWidth - element\.clientWidth > 2/);
  assert.match(hook, /element\.scrollTop \+ element\.clientHeight >= element\.scrollHeight - 2/);
  assert.match(hook, /element\.scrollLeft \+ element\.clientWidth >= element\.scrollWidth - 2/);
  assert.match(hook, /ResizeObserver/);
  assert.match(hook, /MutationObserver/);
  assert.match(component, /hasVerticalOverflow && !verticalEnd/);
  assert.match(component, /hasHorizontalOverflow && !horizontalEnd/);
  assert.match(component, /Scroll to view more/);
  assert.match(component, /Scroll right to view more/);
  assert.match(component, /role="region"/);
  assert.match(component, /tabIndex=\{0\}/);
  assert.match(globals, /scrollbar-gutter: stable/);
  assert.match(globals, /scrollbar-color: #64748b #e2e8f0/);
  assert.match(globals, /overscroll-behavior: auto/);
  assert.match(globals, /scroll-affordance__fade--bottom/);
  assert.match(globals, /scroll-affordance__fade--right/);
});

test('admin header chip uses Supplide branding without changing profile data', () => {
  const topbar = read('src/components/layout/Topbar/index.tsx');
  assert.match(topbar, /const displayName = userRole === 'ADMIN' \? 'Supplide' : userName/);
  assert.match(topbar, /\{displayName\}/);
});

test('login synchronizes the shared profile and prepared workspace before one navigation', () => {
  const sessionProvider = read('src/hooks/useSessionUser.tsx');
  const login = read('src/screens/LoginScreen/index.tsx');

  assert.match(sessionProvider, /syncSession: \(\) => Promise<SessionProfile \| null>/);
  assert.match(sessionProvider, /profileRequestRef\.current\?\.userId === user\.id/);
  assert.match(sessionProvider, /workspaceRequestRef\.current\?\.userId === user\.id/);
  assert.match(login, /const dbProfile = await resolveUser\(data\.user\)/);
  assert.match(login, /Promise\.all\([\s\S]*prepareWorkspace\(nextProfile\)/);
  assert.match(login, /import\('@\/src\/screens\/AdminOrdersScreen'\)/);
  assert.doesNotMatch(login, /supabase\.auth\.getUser/);
  assert.doesNotMatch(login, /Snackbar|Signing you in|success/i);
  assert.match(login, /Preparing your workspace…/);
  assert.match(login, /role="status"/);
  assert.match(login, /nextProfile\.role === 'ADMIN' \? '\/admin\/orders' : '\/dashboard'/);
  assert.equal((login.match(/router\.replace\(/g) || []).length, 1);
  assert.doesNotMatch(login, /router\.refresh\(\)/);
});

test('authentication bootstrap covers errors, inactive accounts, existing sessions, and account switching', () => {
  const login = read('src/screens/LoginScreen/index.tsx');
  const provider = read('src/hooks/useSessionUser.tsx');
  const topbar = read('src/components/layout/Topbar/index.tsx');

  for (const state of ['idle', 'authenticating', 'loading-account', 'preparing-workspace', 'ready', 'error']) {
    assert.match(login, new RegExp(`'${state}'`));
  }
  assert.match(login, /if \(submittingRef\.current\) return/);
  assert.match(login, /setPassword\(''\)/);
  assert.match(login, /account_status !== 'ACTIVE'/);
  assert.match(login, /await supabase\.auth\.signOut\(\)/);
  assert.match(login, /if \(!profile \|\| automaticBootstrapRef\.current === profile\.id\) return/);
  assert.match(login, /WorkspaceLoadingSurface[\s\S]*onRetry/);
  assert.match(provider, /previousUserId && previousUserId !== user\.id[\s\S]*clearPreparedWorkspace\(\)/);
  assert.match(provider, /preparedWorkspaceRef\.current\?\.userId/);
  assert.match(topbar, /resetSession\(\)[\s\S]*router\.replace\('\/login'\)/);
});

test('orders distinguish unresolved data from a successful empty response and reuse bootstrap data', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const userOrders = read('src/screens/UserOrdersScreen/index.tsx');
  const customerWorkspace = read('src/screens/UserDashboardScreen/index.tsx');
  const loader = read('src/lib/workspace/loadWorkspace.ts');

  assert.match(adminOrders, /useState<OrderRow\[\] \| null>/);
  assert.match(adminOrders, /initialOrders === null/);
  assert.match(adminOrders, /preparedWorkspace\?\.role === 'ADMIN'/);
  assert.match(userOrders, /useState<OrderRow\[\] \| null>\(null\)/);
  assert.match(userOrders, /sessionLoading \|\| loading/);
  assert.match(userOrders, /if \(orders === null\)/);
  assert.match(customerWorkspace, /initialWorkspace\?\.peptides/);
  assert.match(customerWorkspace, /workspaceLoadedRef = useRef\(initialWorkspace !== null\)/);
  assert.match(loader, /Promise\.all\(\[peptideRequest, addressRequest\]\)/);
});

test('session provider owns the only auth listener and clears user-scoped bootstrap data', () => {
  const provider = read('src/hooks/useSessionUser.tsx');
  const allSource = [
    provider,
    read('src/screens/LoginScreen/index.tsx'),
    read('src/components/layout/ProtectedAppLayout/index.tsx'),
  ].join('\n');

  assert.equal((allSource.match(/onAuthStateChange/g) || []).length, 1);
  assert.match(provider, /preparedWorkspaceRef\.current = null/);
  assert.match(provider, /currentUserRef\.current\?\.id !== user\.id/);
  assert.match(provider, /resetSession/);
});

test('customer order catalog supports persisted case-insensitive product search', () => {
  const orderScreen = read('src/screens/UserDashboardScreen/index.tsx');
  assert.match(orderScreen, /customer-order-product-search/);
  assert.match(orderScreen, /productSearch\.trim\(\)\.toLowerCase\(\)/);
  assert.match(orderScreen, /peptide\.name\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(orderScreen, /label="Search products"/);
  assert.match(orderScreen, /No matching products/);
  assert.match(orderScreen, /filteredPeptides\.map/);
});
