-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- ENUMS
-- =========================
do $$ begin
  create type public.app_role as enum ('ADMIN', 'USER');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.batch_status as enum ('OPEN', 'CLOSED', 'ARCHIVED');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'IN_PRODUCTION',
    'FULFILLED',
    'CANCELLED',
    'EXPIRED'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.wishlist_status as enum (
    'OPEN',
    'UNDER_REVIEW',
    'CONFIRMED',
    'CONVERTED_TO_BATCH',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end $$;

-- =========================
-- TABLES
-- =========================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_contact_name text,
  billing_email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text not null,
  last_name text not null,
  role public.app_role not null default 'USER',
  account_status public.account_status not null default 'PENDING',
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_company_null_check
    check (
      (role = 'ADMIN' and company_id is null)
      or
      (role = 'USER')
    )
);

create table if not exists public.company_addresses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text,
  recipient_name text,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.peptides (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_unit_price numeric(12,2) not null check (default_unit_price > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  peptide_id uuid not null references public.peptides(id) on delete restrict,
  batch_code text not null unique,
  batch_date date not null,
  total_quantity integer not null check (total_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  approved_quantity integer not null default 0 check (approved_quantity >= 0),
  moq integer not null check (moq > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  eta_date date,
  public_notes text,
  internal_notes text,
  status public.batch_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_allocations_check
    check (reserved_quantity + approved_quantity <= total_quantity)
);

create table if not exists public.batch_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  min_qty integer not null check (min_qty > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  created_at timestamptz not null default now(),
  unique (batch_id, min_qty)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  batch_id uuid not null references public.batches(id) on delete restrict,
  address_id uuid not null references public.company_addresses(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  approved_quantity integer check (approved_quantity is null or approved_quantity >= 0),
  unit_price_at_submission numeric(12,2) not null check (unit_price_at_submission > 0),
  unit_price_final numeric(12,2),
  total_price numeric(14,2) not null check (total_price >= 0),
  status public.order_status not null default 'SUBMITTED',
  user_notes text,
  internal_notes text,
  reservation_expires_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wishlist_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  peptide_id uuid not null references public.peptides(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  target_allocation integer,
  status public.wishlist_status not null default 'OPEN',
  desired_timeline text,
  user_notes text,
  internal_notes text,
  confirmed_at timestamptz,
  converted_batch_id uuid references public.batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  carrier_name text,
  tracking_number text,
  ship_date date,
  estimated_delivery_date date,
  shipment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  "to" text not null,
  subject text not null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

-- =========================
-- INDEXES
-- =========================
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_company_addresses_company_id on public.company_addresses(company_id);
create index if not exists idx_batches_peptide_id on public.batches(peptide_id);
create index if not exists idx_batch_pricing_tiers_batch_id on public.batch_pricing_tiers(batch_id);
create index if not exists idx_orders_company_id on public.orders(company_id);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_batch_id on public.orders(batch_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_wishlist_requests_company_id on public.wishlist_requests(company_id);
create index if not exists idx_wishlist_requests_user_id on public.wishlist_requests(user_id);
create index if not exists idx_wishlist_requests_peptide_id on public.wishlist_requests(peptide_id);
create index if not exists idx_email_events_order_id on public.email_events(order_id);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);

-- =========================
-- UPDATED_AT TRIGGER
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_companies on public.companies;
create trigger set_updated_at_companies
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_company_addresses on public.company_addresses;
create trigger set_updated_at_company_addresses
before update on public.company_addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_peptides on public.peptides;
create trigger set_updated_at_peptides
before update on public.peptides
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_batches on public.batches;
create trigger set_updated_at_batches
before update on public.batches
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_orders on public.orders;
create trigger set_updated_at_orders
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_wishlist_requests on public.wishlist_requests;
create trigger set_updated_at_wishlist_requests
before update on public.wishlist_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_shipments on public.shipments;
create trigger set_updated_at_shipments
before update on public.shipments
for each row execute function public.set_updated_at();

-- =========================
-- HELPER FUNCTIONS FOR RBAC
-- =========================
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'ADMIN', false)
$$;

-- =========================
-- ENABLE RLS
-- =========================
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_addresses enable row level security;
alter table public.peptides enable row level security;
alter table public.batches enable row level security;
alter table public.batch_pricing_tiers enable row level security;
alter table public.orders enable row level security;
alter table public.wishlist_requests enable row level security;
alter table public.shipments enable row level security;
alter table public.email_events enable row level security;
alter table public.audit_logs enable row level security;

-- =========================
-- RLS: COMPANIES
-- =========================
drop policy if exists "admins manage companies" on public.companies;
create policy "admins manage companies"
on public.companies
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own company" on public.companies;
create policy "users read own company"
on public.companies
for select
to authenticated
using (
  public.is_admin()
  or id = public.current_company_id()
);

-- =========================
-- RLS: PROFILES
-- =========================
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

drop policy if exists "users update own basic profile" on public.profiles;
create policy "users update own basic profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.profiles where id = auth.uid())
  and company_id is not distinct from (select company_id from public.profiles where id = auth.uid())
);

-- =========================
-- RLS: COMPANY ADDRESSES
-- =========================
drop policy if exists "admins manage addresses" on public.company_addresses;
create policy "admins manage addresses"
on public.company_addresses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own company addresses" on public.company_addresses;
create policy "users read own company addresses"
on public.company_addresses
for select
to authenticated
using (
  public.is_admin()
  or company_id = public.current_company_id()
);

drop policy if exists "users insert own company addresses" on public.company_addresses;
create policy "users insert own company addresses"
on public.company_addresses
for insert
to authenticated
with check (
  public.is_admin()
  or company_id = public.current_company_id()
);

drop policy if exists "users update own company addresses" on public.company_addresses;
create policy "users update own company addresses"
on public.company_addresses
for update
to authenticated
using (
  public.is_admin()
  or company_id = public.current_company_id()
)
with check (
  public.is_admin()
  or company_id = public.current_company_id()
);

-- =========================
-- RLS: PEPTIDES
-- =========================
drop policy if exists "admins manage peptides" on public.peptides;
create policy "admins manage peptides"
on public.peptides
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "authenticated read active peptides" on public.peptides;
create policy "authenticated read active peptides"
on public.peptides
for select
to authenticated
using (
  public.is_admin()
  or is_active = true
);

-- =========================
-- RLS: BATCHES
-- =========================
drop policy if exists "admins manage batches" on public.batches;
create policy "admins manage batches"
on public.batches
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "authenticated read open batches" on public.batches;
create policy "authenticated read open batches"
on public.batches
for select
to authenticated
using (
  public.is_admin()
  or status = 'OPEN'
);

-- =========================
-- RLS: BATCH PRICING TIERS
-- =========================
drop policy if exists "admins manage batch tiers" on public.batch_pricing_tiers;
create policy "admins manage batch tiers"
on public.batch_pricing_tiers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "authenticated read visible batch tiers" on public.batch_pricing_tiers;
create policy "authenticated read visible batch tiers"
on public.batch_pricing_tiers
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.batches b
    where b.id = batch_pricing_tiers.batch_id
      and b.status = 'OPEN'
  )
);

-- =========================
-- RLS: ORDERS
-- =========================
drop policy if exists "admins manage orders" on public.orders;
create policy "admins manage orders"
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own orders" on public.orders;
create policy "users read own orders"
on public.orders
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
);

drop policy if exists "users insert own orders" on public.orders;
create policy "users insert own orders"
on public.orders
for insert
to authenticated
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and exists (
      select 1
      from public.company_addresses a
      where a.id = address_id
        and a.company_id = public.current_company_id()
    )
  )
);

-- =========================
-- RLS: WISHLIST REQUESTS
-- =========================
drop policy if exists "admins manage wishlist" on public.wishlist_requests;
create policy "admins manage wishlist"
on public.wishlist_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own wishlist requests" on public.wishlist_requests;
create policy "users read own wishlist requests"
on public.wishlist_requests
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
);

drop policy if exists "users insert own wishlist requests" on public.wishlist_requests;
create policy "users insert own wishlist requests"
on public.wishlist_requests
for insert
to authenticated
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and company_id = public.current_company_id()
  )
);

-- =========================
-- RLS: SHIPMENTS
-- =========================
drop policy if exists "admins manage shipments" on public.shipments;
create policy "admins manage shipments"
on public.shipments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read shipment for own orders" on public.shipments;
create policy "users read shipment for own orders"
on public.shipments
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = shipments.order_id
      and o.user_id = auth.uid()
  )
);

-- =========================
-- RLS: EMAIL EVENTS
-- =========================
drop policy if exists "admins read write email events" on public.email_events;
create policy "admins read write email events"
on public.email_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================
-- RLS: AUDIT LOGS
-- =========================
drop policy if exists "admins read write audit logs" on public.audit_logs;
create policy "admins read write audit logs"
on public.audit_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- After a user signs up in Supabase Auth, a trigger that inserts a row into public.profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    role,
    account_status,
    company_id
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'USER'),
    'PENDING',
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();