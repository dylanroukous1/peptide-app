import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260922093000_seed_supplide_pricing.sql';
const multiOrderingMigrationPath = 'supabase/migrations/20260923090000_enable_multi_product_orders.sql';
const fulfillmentMigrationPath = 'supabase/migrations/20260924100000_admin_fulfillment_addresses_discounts.sql';
const voidMigrationPath = 'supabase/migrations/20260924113000_add_order_voiding.sql';
const reactivationMigrationPath = 'supabase/migrations/20260924120000_add_order_reactivation.sql';
const deleteOrderMigrationPath = 'supabase/migrations/20260924123000_replace_voiding_with_order_deletion.sql';
const shippedEnumMigrationPath = 'supabase/migrations/20260924124000_add_shipped_order_status.sql';
const shippedTransitionsMigrationPath = 'supabase/migrations/20260924124100_enable_shipped_order_transitions.sql';
const deleteCompanyMigrationPath = 'supabase/migrations/20260924125000_add_admin_company_deletion.sql';
const deleteUserMigrationPath = 'supabase/migrations/20260924126000_add_admin_user_deletion.sql';
const deletePeptideMigrationPath = 'supabase/migrations/20260924127000_add_admin_peptide_deletion.sql';
const removeOrderMinimumsMigrationPath = 'supabase/migrations/20260925090000_remove_order_minimums.sql';
const deleteAccessRequestMigrationPath = 'supabase/migrations/20260925091000_add_admin_access_request_deletion.sql';

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
  assert.match(orderForm, /showToast\([\s\S]*Order \$\{receipt\.order_number\} submitted/);
});

test('current multi-order RPC accepts any positive whole-number quantity', () => {
  const sql = read(removeOrderMinimumsMigrationPath);
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.submit_multi_product_order/);
  assert.match(sql, /v_quantity_numeric <> trunc\(v_quantity_numeric\)/);
  assert.match(sql, /v_quantity_numeric <= 0/);
  assert.doesNotMatch(sql, /v_quantity_numeric < 250|v_total_quantity < 2000|2,000 total vials/);
  assert.doesNotMatch(orderForm, /SKU_MINIMUM|ORDER_MINIMUM|250 vials|2,000/);
  assert.match(orderForm, /Number\.isInteger\(quantity\) && quantity > 0/);
  assert.match(orderForm, /quantity: '1'/);
  assert.match(sql, /revoke all on function public\.submit_product_order\(uuid, uuid, integer, text\) from authenticated/);
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

test('legacy ordering RPC remains disabled in favor of the authoritative multi-product flow', () => {
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

test('responsive order builder supports search, addresses, review, and duplicate prevention', () => {
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');
  const styles = read('src/screens/UserDashboardScreen/styles.ts');

  assert.match(orderForm, /customer-order-product-search/);
  assert.match(orderForm, /current\.some\(\(item\) => item\.peptideId === peptideId\)/);
  assert.match(orderForm, /\.from\('company_addresses'\)[\s\S]*\.insert/);
  assert.match(orderForm, /positive whole-number quantity/);
  assert.match(orderForm, /disabled=\{!canSubmit\}/);
  assert.match(orderForm, /<AppSnackbar \{\.\.\.toast\} onClose=\{closeToast\}/);
  assert.match(styles, /breakpoints\.down\('lg'\)[\s\S]*gridTemplateColumns: '1fr'/);
  assert.match(styles, /breakpoints\.down\('sm'\)/);
  assert.match(orderForm, /data-mobile-open=\{mobileReviewOpen \? 'true' : 'false'\}/);
  assert.match(orderForm, /Close order review/);
  assert.match(orderForm, /Review order · \{items\.length\}/);
  assert.match(styles, /position: 'fixed'[\s\S]*zIndex: theme\.zIndex\.modal[\s\S]*overflowY: 'auto'/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});

test('mobile order cards constrain and wrap long identifiers without changing desktop layout', () => {
  const adminStyles = read('src/screens/AdminOrdersScreen/styles.ts');
  const userStyles = read('src/screens/UserOrdersScreen/styles.ts');

  for (const styles of [adminStyles, userStyles]) {
    assert.match(styles, /breakpoints\.down\('sm'\)[\s\S]*maxWidth: '100%'/);
    assert.match(styles, /overflowWrap: 'anywhere'/);
    assert.match(styles, /wordBreak: 'break-word'/);
    assert.match(styles, /minWidth: 0/);
  }
});

test('mutation feedback uses shared toasts and order success cannot show an empty-draft warning', () => {
  const orderForm = read('src/screens/UserDashboardScreen/index.tsx');
  const snackbar = read('src/commons/AppSnackBar/index.tsx');
  const toastHook = read('src/hooks/useAppToast.ts');
  const mutationScreens = [
    'src/screens/AdminOrdersScreen/index.tsx',
    'src/screens/AdminPeptidesScreen/index.tsx',
    'src/screens/AdminCompaniesScreen/index.tsx',
    'src/screens/AdminUsersScreen/index.tsx',
    'src/screens/UserAccountScreen/index.tsx',
    'src/screens/AccessRequestScreen/index.tsx',
  ].map(read);

  assert.match(orderForm, /!allQuantitiesValid && items\.length > 0/);
  assert.doesNotMatch(orderForm, /severity="success" role="status"/);
  assert.match(orderForm, /setFormError\(''\)[\s\S]*setItems\(\[\]\)[\s\S]*showToast/);
  assert.match(snackbar, /anchorOrigin=\{\{ vertical: 'top', horizontal: 'center' \}\}/);
  assert.match(toastHook, /setToast\(\{ open: true, message, severity \}\)/);
  for (const screen of mutationScreens) {
    assert.match(screen, /<AppSnackbar \{\.\.\.toast\} onClose=\{closeToast\}/);
  }
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

test('admin users use compact records and shared toast validation feedback', () => {
  const screen = read('src/screens/AdminUsersScreen/index.tsx');
  const styles = read('src/screens/AdminUsersScreen/styles.ts');
  const createHandler = screen.match(/const handleCreateUser[\s\S]*?const prefillCreateFromRequest/)?.[0] || '';

  assert.match(createHandler, /showToast\('Email, first name, and last name are required\.', 'error'\)/);
  assert.match(createHandler, /showToast\('Enter a valid email address\.', 'error'\)/);
  assert.match(createHandler, /showToast\('Passwords must contain at least 12 characters\.', 'error'\)/);
  assert.doesNotMatch(createHandler, /setErrorMessage\(/);
  assert.doesNotMatch(screen, /Profile ID|Request ID/);
  assert.match(screen, /className="user-edit-actions"/);
  assert.match(screen, /Save changes/);
  assert.match(screen, /<CreateFooterGrid>[\s\S]*<PasswordFieldWrap>[\s\S]*<FormActions>/);
  assert.doesNotMatch(screen, /<MetaGrid/);
  assert.match(styles, /gridTemplateColumns: 'minmax\(280px, 560px\) 190px'/);
  assert.match(styles, /gridTemplateColumns: 'minmax\(280px, 420px\) auto'/);
  assert.match(styles, /gap: theme\.spacing\(1\.25\)/);
  assert.match(styles, /padding: theme\.spacing\(1\.75\)/);
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
  const sessionProvider = read('src/hooks/useSessionUser.tsx');

  assert.doesNotMatch(login, /useSyncExternalStore|subscribeToClient|if \(!mounted\)/);
  assert.match(login, /if \(sessionLoading\)[\s\S]*login-route-loading/);
  assert.match(sessionProvider, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(login, /Preparing your workspace…/);
  assert.match(loginPage, /<LoginScreen \/>/);
  assert.doesNotMatch(loginPage, /LoginClient/);
});

test('login brand mark does not download the oversized application icon', () => {
  const login = read('src/screens/LoginScreen/index.tsx');
  const styles = read('src/screens/LoginScreen/styles.ts');

  assert.doesNotMatch(login, /<img[\s\S]*\/icon\.png/);
  assert.match(login, /<LoginBrandMark aria-hidden="true">S<\/LoginBrandMark>/);
  assert.match(styles, /export const LoginBrandMark/);
  assert.match(styles, /width: 48[\s\S]*height: 48/);
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

test('restored browser tabs revalidate the persisted Supabase session', () => {
  const sessionProvider = read('src/hooks/useSessionUser.tsx');

  assert.match(sessionProvider, /const handlePageShow = \(event: PageTransitionEvent\)/);
  assert.match(sessionProvider, /if \(event\.persisted\) void restoreSession\(\)/);
  assert.match(sessionProvider, /window\.addEventListener\('pageshow', handlePageShow\)/);
  assert.match(sessionProvider, /window\.removeEventListener\('pageshow', handlePageShow\)/);
  assert.equal((sessionProvider.match(/onAuthStateChange/g) || []).length, 1);
});

test('MUI Emotion styles use the Next App Router server insertion registry', () => {
  const providers = read('src/components/AppProviders/index.tsx');
  const registry = read('src/components/EmotionRegistry/index.tsx');

  assert.match(providers, /<EmotionRegistry>[\s\S]*<ThemeProvider/);
  assert.match(registry, /useServerInsertedHTML/);
  assert.match(registry, /createCache\(\{ key: 'mui', prepend: true \}\)/);
  assert.match(registry, /<CacheProvider value=\{cache\}>\{children\}<\/CacheProvider>/);
  assert.match(registry, /data-emotion=\{`\$\{cache\.key\} \$\{names\.join\(' '\)\}`\}/);
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

test('fulfillment migration preserves orders and adds authoritative discount totals', () => {
  const sql = read(fulfillmentMigrationPath);

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /add column if not exists discount_type text/);
  assert.match(sql, /discount_amount numeric\(14,2\) not null default 0/);
  assert.match(sql, /final_total numeric\(14,2\)/);
  assert.match(sql, /final_total = coalesce\(final_total, total_price\)/);
  assert.match(sql, /new\.final_total := new\.total_price/);
  assert.doesNotMatch(sql, /delete from public\.(orders|order_items|shipments)/i);
  assert.doesNotMatch(sql, /update public\.order_items set[\s\S]*unit_price/i);
});

test('shipment RPC validates active admins, order state, dates, and audits changes', () => {
  const sql = read(fulfillmentMigrationPath);
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const userOrders = read('src/screens/UserOrdersScreen/index.tsx');

  assert.match(sql, /create or replace function public\.admin_upsert_order_shipment/);
  assert.match(sql, /p\.role = 'ADMIN' and p\.account_status = 'ACTIVE'/);
  assert.match(sql, /v_order\.status in \('CANCELLED', 'EXPIRED'\)/);
  assert.match(sql, /Estimated delivery cannot precede ship date/);
  assert.match(sql, /on conflict \(order_id\) do update/);
  assert.match(sql, /v_order\.status = 'APPROVED'[\s\S]*'IN_PRODUCTION'/);
  assert.match(sql, /ORDER_TRACKING_ADDED/);
  assert.match(sql, /ORDER_SHIPMENT_UPDATED/);
  assert.match(adminOrders, /admin_upsert_order_shipment/);
  assert.match(adminOrders, /Shipping &amp; Tracking/);
  assert.match(userOrders, /Copy tracking/);
  assert.match(userOrders, /encodeURIComponent\(tracking\.trim\(\)\)/);
});

test('order cancellation is available as a valid lifecycle transition', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const statusSql = read(multiOrderingMigrationPath);

  assert.match(adminOrders, /SUBMITTED: \['UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'EXPIRED'\]/);
  assert.match(adminOrders, /IN_PRODUCTION: \['SHIPPED', 'CANCELLED'\]/);
  assert.match(adminOrders, /admin_update_order_status/);
  assert.doesNotMatch(adminOrders, /\.from\('orders'\)[\s\S]*\.delete\(/);
  assert.match(statusSql, /cancelled_at = case when p_new_status in \('CANCELLED', 'EXPIRED'\) then now\(\)/);
});

test('company addresses are atomic, company-scoped, and limited to one default', () => {
  const sql = read(fulfillmentMigrationPath);
  const companies = read('src/screens/AdminCompaniesScreen/index.tsx');

  assert.match(sql, /create unique index if not exists company_addresses_one_default_per_company/);
  assert.match(sql, /create or replace function public\.admin_create_company/);
  assert.match(sql, /insert into public\.companies[\s\S]*insert into public\.company_addresses/);
  assert.match(sql, /where id = p_address_id and company_id = p_company_id for update/);
  assert.match(sql, /update public\.company_addresses set is_default = false[\s\S]*where company_id = p_company_id/);
  assert.match(companies, /Primary Shipping Address/);
  assert.match(companies, /admin_upsert_company_address/);
  assert.match(companies, /Shipping addresses \(\{row\.addresses\.length\}\)/);
});

test('discount RPC calculates totals server-side and both roles display final totals', () => {
  const sql = read(fulfillmentMigrationPath);
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const userOrders = read('src/screens/UserOrdersScreen/index.tsx');

  assert.match(sql, /create or replace function public\.admin_set_order_discount/);
  assert.match(sql, /select \* into v_order from public\.orders where id = p_order_id for update/);
  assert.match(sql, /v_discount_value > 100/);
  assert.match(sql, /v_discount_value > v_order\.total_price/);
  assert.match(sql, /v_discount_amount := round\(v_order\.total_price \* v_discount_value \/ 100, 2\)/);
  assert.match(sql, /v_final_total := round\(v_order\.total_price - v_discount_amount, 2\)/);
  assert.match(sql, /revoke all on function public\.admin_set_order_discount\(uuid,text,numeric\) from public, anon/);
  for (const screen of [adminOrders, userOrders]) {
    assert.match(screen, /Subtotal/);
    assert.match(screen, /Discount/);
    assert.match(screen, /Final total|Final Total/);
  }
});

test('new shipment, discount, and address audit actions are human-readable', () => {
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(formatter, /ORDER_TRACKING_ADDED/);
  assert.match(formatter, /updated shipping information for order/);
  assert.match(formatter, /ORDER_DISCOUNT_UPDATED/);
  assert.match(formatter, /updated the default shipping address/);
  assert.match(formatter, /with a primary shipping address/);
});

test('admin orders use progressive disclosure and compact workflow controls', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const styles = read('src/screens/AdminOrdersScreen/styles.ts');

  assert.match(adminOrders, /aria-expanded=\{expanded\}/);
  assert.match(adminOrders, /View details/);
  assert.match(adminOrders, /Pricing &amp; Discount/);
  assert.match(adminOrders, /Shipping &amp; Tracking/);
  assert.match(adminOrders, /Edit tracking/);
  assert.match(adminOrders, /Edit discount/);
  assert.match(adminOrders, /Update status/);
  assert.doesNotMatch(adminOrders, /Save Status/);
  assert.match(adminOrders, /disabled=\{!selectedStatus \|\| selectedStatus === order\.status/);
  assert.match(adminOrders, /availableStatuses\.map[\s\S]*statusLabel\(status\)/);
  assert.match(adminOrders, /Delete Order/);
  assert.match(adminOrders, /ActionPanel actiontone="pricing"/);
  assert.match(adminOrders, /ActionPanel actiontone="shipping"/);
  assert.match(adminOrders, /ActionPanel actiontone="status"/);
  assert.match(adminOrders, /variant=\{expanded \? 'outlined' : 'contained'\}/);
  assert.match(styles, /gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)'/);
  assert.match(styles, /theme\.breakpoints\.down\('md'\)[\s\S]*gridTemplateColumns: '1fr'/);
});

test('void migration preserves lifecycle data and records explicit void metadata', () => {
  const sql = read(voidMigrationPath);

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /add column if not exists voided_at timestamptz/);
  assert.match(sql, /add column if not exists voided_by uuid/);
  assert.match(sql, /foreign key \(voided_by\) references public\.profiles\(id\) on delete restrict/);
  assert.match(sql, /add column if not exists void_reason text/);
  assert.match(sql, /length\(btrim\(void_reason\)\) >= 5/);
  assert.match(sql, /create index if not exists idx_orders_voided_at/);
  assert.doesNotMatch(sql, /delete from public\.(orders|order_items|shipments)/i);
  assert.doesNotMatch(sql, /update public\.(order_items|shipments)/i);
  assert.doesNotMatch(sql, /set\s+status\s*=/i);
});

test('void RPC authorizes active admins, locks orders, and rejects unsafe requests', () => {
  const sql = read(voidMigrationPath);

  assert.match(sql, /create or replace function public\.admin_void_order/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /length\(v_reason\) < 5/);
  assert.match(sql, /where id = p_order_id\s+for update/);
  assert.match(sql, /v_order\.voided_at is not null[\s\S]*Order is already voided/);
  assert.match(sql, /'ORDER_VOIDED'/);
  assert.match(sql, /'previous_status', v_order\.status/);
  assert.match(sql, /'final_total', v_order\.final_total/);
  assert.match(sql, /revoke all on function public\.admin_void_order\(uuid, text\) from public/);
  assert.match(sql, /revoke all on function public\.admin_void_order\(uuid, text\) from anon/);
  assert.match(sql, /grant execute on function public\.admin_void_order\(uuid, text\) to authenticated/);
});

test('applied void migrations are superseded by secure permanent deletion', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const sql = read(deleteOrderMigrationPath);

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.doesNotMatch(sql, /where voided_at is not null/);
  assert.match(sql, /drop function if exists public\.admin_void_order/);
  assert.match(sql, /drop function if exists public\.admin_reactivate_order/);
  assert.match(sql, /drop column if exists voided_at/);
  assert.match(sql, /create or replace function public\.admin_delete_order/);
  assert.match(adminOrders, /supabase\.rpc\('admin_delete_order'/);
  assert.doesNotMatch(adminOrders, /admin_void_order|admin_reactivate_order|Void order|Reactivate order/);
});

test('order customer profile relationships remain explicit', () => {
  const workspace = read('src/lib/workspace/loadWorkspace.ts');
  const userOrders = read('src/screens/UserOrdersScreen/index.tsx');

  assert.match(workspace, /user:profiles!orders_user_id_fkey/);
  assert.match(userOrders, /user:profiles!orders_user_id_fkey/);
  assert.doesNotMatch(workspace, /user:profiles\(first_name/);
  assert.doesNotMatch(userOrders, /user:profiles\(first_name/);
});

test('void audit activity is human-readable and uses the discounted final total', () => {
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(formatter, /action === 'ORDER_VOIDED'/);
  assert.match(formatter, /event\.after_json\?\.final_total/);
  assert.match(formatter, /voided order \$\{orderNumber\} for \$\{money\(finalTotal\)\}\. Reason:/);
});

test('reactivation RPC safely restores a voided order without changing lifecycle status', () => {
  const sql = read(reactivationMigrationPath);

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.admin_reactivate_order/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /length\(v_reason\) < 5/);
  assert.match(sql, /where id = p_order_id\s+for update/);
  assert.match(sql, /v_order\.voided_at is null[\s\S]*Order is not voided/);
  assert.match(sql, /voided_at = null[\s\S]*voided_by = null[\s\S]*void_reason = null/);
  assert.match(sql, /'ORDER_REACTIVATED'/);
  assert.doesNotMatch(sql, /set\s+status\s*=/i);
  assert.doesNotMatch(sql, /delete from public\./i);
  assert.match(sql, /revoke all on function public\.admin_reactivate_order\(uuid, text\) from public/);
  assert.match(sql, /revoke all on function public\.admin_reactivate_order\(uuid, text\) from anon/);
});

test('permanent order deletion is admin-only, confirmed, audited, and locally reflected', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const formatter = read('src/lib/audit/formatAuditEvent.ts');
  const sql = read(deleteOrderMigrationPath);

  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /where id = p_order_id\s+for update/);
  assert.match(sql, /'ORDER_DELETED'/);
  assert.match(sql, /delete from public\.orders where id = v_order\.id/);
  assert.match(sql, /revoke delete on table public\.orders from authenticated/);
  assert.match(sql, /revoke all on function public\.admin_delete_order\(uuid\) from public/);
  assert.match(sql, /revoke all on function public\.admin_delete_order\(uuid\) from anon/);
  assert.match(adminOrders, /setOrders\(\(current\) => current\?\.filter/);
  assert.match(adminOrders, /Delete order/);
  assert.match(adminOrders, /This action cannot be undone/);
  assert.doesNotMatch(adminOrders, /type .*order number|reason/i);
  assert.match(formatter, /action === 'ORDER_DELETED'/);
});

test('shipped status is added safely and enforced as a lifecycle transition', () => {
  const enumSql = read(shippedEnumMigrationPath);
  const transitionSql = read(shippedTransitionsMigrationPath);

  assert.match(enumSql, /alter type public\.order_status add value if not exists 'SHIPPED' after 'IN_PRODUCTION'/);
  assert.match(transitionSql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(transitionSql, /add column if not exists shipped_at timestamptz/);
  assert.match(transitionSql, /v_before\.status = 'IN_PRODUCTION' and p_new_status in \('SHIPPED', 'CANCELLED'\)/);
  assert.match(transitionSql, /v_before\.status = 'SHIPPED' and p_new_status in \('FULFILLED', 'CANCELLED'\)/);
  assert.match(transitionSql, /shipped_at = case when p_new_status = 'SHIPPED' then now\(\)/);
  assert.match(transitionSql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
});

test('admin and customer order views present shipped status consistently', () => {
  const adminOrders = read('src/screens/AdminOrdersScreen/index.tsx');
  const userOrders = read('src/screens/UserOrdersScreen/index.tsx');
  const statusChip = read('src/commons/StatusChip/index.tsx');

  assert.match(adminOrders, /'SHIPPED'/);
  assert.match(adminOrders, /SHIPPED: \['FULFILLED', 'CANCELLED'\]/);
  assert.match(adminOrders, /label="Filter by status"/);
  assert.match(adminOrders, /label="Change status to"/);
  assert.match(adminOrders, /Only valid next statuses are shown/);
  assert.match(adminOrders, /'APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED'/);
  assert.match(userOrders, /order\.status === 'SHIPPED' \? 'Shipped'/);
  assert.match(statusChip, /case 'SHIPPED'/);
});

test('active admins can permanently delete companies through one confirmed RPC flow', () => {
  const sql = read(deleteCompanyMigrationPath);
  const companies = read('src/screens/AdminCompaniesScreen/index.tsx');
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.admin_delete_company/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /where id = p_company_id\s+for update/);
  assert.match(sql, /delete from public\.wishlist_requests where company_id = p_company_id/);
  assert.match(sql, /delete from public\.orders where company_id = p_company_id/);
  assert.match(sql, /delete from public\.companies where id = p_company_id/);
  assert.match(sql, /revoke delete on table public\.companies from authenticated/);
  assert.match(sql, /revoke all on function public\.admin_delete_company\(uuid\) from public/);
  assert.match(sql, /revoke all on function public\.admin_delete_company\(uuid\) from anon/);
  assert.match(companies, /supabase\.rpc\('admin_delete_company'/);
  assert.match(companies, /Delete company/);
  assert.match(companies, /This action cannot be undone/);
  assert.match(companies, /setCompanies\(\(current\) => current\.filter/);
  assert.doesNotMatch(companies, /type .*company name|delete reason/i);
  assert.match(formatter, /action === 'COMPANY_DELETED'/);
});

test('active admins can permanently delete users through one confirmed RPC flow', () => {
  const sql = read(deleteUserMigrationPath);
  const users = read('src/screens/AdminUsersScreen/index.tsx');
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.admin_delete_user/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /p_user_id = v_admin_id[\s\S]*cannot delete your own account/i);
  assert.match(sql, /where id = p_user_id\s+for update/);
  assert.match(sql, /'USER_DELETED'/);
  assert.match(sql, /delete from public\.wishlist_requests where user_id = p_user_id/);
  assert.match(sql, /delete from public\.orders where user_id = p_user_id/);
  assert.match(sql, /delete from auth\.users where id = p_user_id/);
  assert.match(sql, /revoke delete on table public\.profiles from authenticated/);
  assert.match(sql, /revoke all on function public\.admin_delete_user\(uuid\) from public/);
  assert.match(sql, /revoke all on function public\.admin_delete_user\(uuid\) from anon/);
  assert.match(users, /supabase\.rpc\('admin_delete_user'/);
  assert.match(users, /Delete user/);
  assert.match(users, /This action cannot be undone/);
  assert.match(users, /setUsers\(\(current\) => current\.filter/);
  assert.match(users, /user\.id !== profile\.id/);
  assert.doesNotMatch(users, /type .*user name|delete reason/i);
  assert.match(formatter, /action === 'USER_DELETED'/);
  assert.match(formatter, /event\.before_json\?\.email/);
});

test('active admins can permanently delete peptides and dependent records atomically', () => {
  const sql = read(deletePeptideMigrationPath);
  const peptides = read('src/screens/AdminPeptidesScreen/index.tsx');
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.admin_delete_peptide/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /where id = p_peptide_id\s+for update/);
  assert.match(sql, /'PEPTIDE_DELETED'/);
  assert.match(sql, /delete from public\.orders o[\s\S]*oi\.peptide_id = p_peptide_id/);
  assert.match(sql, /delete from public\.wishlist_requests where peptide_id = p_peptide_id/);
  assert.match(sql, /delete from public\.batches where peptide_id = p_peptide_id/);
  assert.match(sql, /delete from public\.peptides where id = p_peptide_id/);
  assert.match(sql, /revoke delete on table public\.peptides from authenticated/);
  assert.match(sql, /revoke all on function public\.admin_delete_peptide\(uuid\) from public/);
  assert.match(sql, /revoke all on function public\.admin_delete_peptide\(uuid\) from anon/);
  assert.match(peptides, /supabase\.rpc\('admin_delete_peptide'/);
  assert.match(peptides, /Delete peptide/);
  assert.match(peptides, /complete order will be deleted/);
  assert.match(peptides, /This action cannot be undone/);
  assert.match(peptides, /setPeptides\(\(current\) => current\.filter/);
  assert.doesNotMatch(peptides, /type .*peptide name|delete reason/i);
  assert.match(formatter, /action === 'PEPTIDE_DELETED'/);
  assert.match(formatter, /event\.before_json\?\.name/);
});

test('admin peptide catalog filters by activity and keeps desktop actions compact', () => {
  const peptides = read('src/screens/AdminPeptidesScreen/index.tsx');
  const styles = read('src/screens/AdminPeptidesScreen/styles.ts');

  assert.match(peptides, /admin-peptide-status-filter/);
  assert.match(peptides, /statusFilter === 'ACTIVE' && peptide\.is_active/);
  assert.match(peptides, /statusFilter === 'INACTIVE' && !peptide\.is_active/);
  assert.match(peptides, /<MenuItem value="ALL">All peptides<\/MenuItem>/);
  assert.match(peptides, /<MenuItem value="ACTIVE">Active<\/MenuItem>/);
  assert.match(peptides, /<MenuItem value="INACTIVE">Inactive<\/MenuItem>/);
  assert.match(peptides, /<ActionButtons>[\s\S]*Save changes[\s\S]*Deactivate[\s\S]*Delete peptide/);
  assert.match(styles, /gridTemplateColumns: 'minmax\(0, 1fr\) 180px'/);
  assert.match(styles, /justifyContent: 'flex-end'/);
  assert.match(styles, /theme\.breakpoints\.down\('md'\)[\s\S]*gridTemplateColumns: '1fr'/);
});

test('active admins can permanently delete access requests with one confirmation', () => {
  const sql = read(deleteAccessRequestMigrationPath);
  const users = read('src/screens/AdminUsersScreen/index.tsx');
  const formatter = read('src/lib/audit/formatAuditEvent.ts');

  assert.match(sql, /^begin;[\s\S]*commit;\s*$/);
  assert.match(sql, /create or replace function public\.admin_delete_access_request/);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(sql, /role = 'ADMIN'[\s\S]*account_status = 'ACTIVE'/);
  assert.match(sql, /where id = p_request_id\s+for update/);
  assert.match(sql, /'ACCESS_REQUEST_DELETED'/);
  assert.match(sql, /delete from public\.account_requests where id = v_request\.id/);
  assert.match(sql, /revoke delete on table public\.account_requests from authenticated/);
  assert.match(sql, /revoke all on function public\.admin_delete_access_request\(uuid\) from public/);
  assert.match(sql, /revoke all on function public\.admin_delete_access_request\(uuid\) from anon/);
  assert.match(users, /supabase\.rpc\('admin_delete_access_request'/);
  assert.match(users, /Delete request/);
  assert.match(users, /Delete access request\?/);
  assert.match(users, /setRequests\(\(current\) => current\.filter/);
  assert.match(formatter, /action === 'ACCESS_REQUEST_DELETED'/);
});
