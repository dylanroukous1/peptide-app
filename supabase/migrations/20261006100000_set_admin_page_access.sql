begin;

alter table public.profiles
  add column if not exists admin_page_access text[] not null default array[
    'orders', 'peptides', 'companies', 'users', 'audit'
  ]::text[];

alter table public.profiles
  drop constraint if exists profiles_admin_page_access_valid;

alter table public.profiles
  add constraint profiles_admin_page_access_valid
  check (
    cardinality(admin_page_access) between 1 and 5
    and admin_page_access <@ array['orders', 'peptides', 'companies', 'users', 'audit']::text[]
  );

comment on column public.profiles.admin_page_access is
  'Admin application pages this profile may open. Applies only when role is ADMIN; all pages are enabled by default.';

commit;
