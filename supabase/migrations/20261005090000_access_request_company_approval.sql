begin;

alter table public.account_requests
  add column if not exists company_id uuid
  references public.companies(id) on delete set null;

create index if not exists idx_account_requests_company_id
  on public.account_requests(company_id);

create or replace function public.validate_access_request_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_name text;
begin
  if tg_op = 'UPDATE' and new.company_id is not distinct from old.company_id then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'Select a company before submitting an access request'
      using errcode = '23502';
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = new.company_id
    and c.is_active = true;

  if v_company_name is null then
    raise exception 'The selected company is unavailable'
      using errcode = '23503';
  end if;

  new.company_name := v_company_name;
  return new;
end;
$$;

drop trigger if exists validate_access_request_company on public.account_requests;
create trigger validate_access_request_company
before insert or update on public.account_requests
for each row execute function public.validate_access_request_company();

create or replace function public.admin_finalize_access_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.account_requests%rowtype;
  v_company_name text;
  v_auth_email text;
  v_profile public.profiles%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  select * into v_request
  from public.account_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'PENDING' then
    raise exception 'This access request is no longer pending' using errcode = '40001';
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = v_request.company_id
    and c.is_active = true;

  if v_company_name is null then
    raise exception 'The selected company is unavailable; ask the requester to submit again'
      using errcode = '22023';
  end if;

  select lower(u.email) into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> lower(btrim(v_request.email)) then
    raise exception 'The new sign-in account does not match the request email'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(btrim(v_request.email))
      and p.id <> p_auth_user_id
  ) then
    raise exception 'An account already exists for this email address'
      using errcode = '23505';
  end if;

  insert into public.profiles (
    id, email, first_name, last_name, role, account_status, company_id
  ) values (
    p_auth_user_id,
    lower(btrim(v_request.email)),
    btrim(v_request.first_name),
    btrim(v_request.last_name),
    'USER',
    'ACTIVE',
    v_request.company_id
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = 'USER',
    account_status = 'ACTIVE',
    company_id = excluded.company_id,
    updated_at = now()
  returning * into v_profile;

  update public.account_requests
  set status = 'APPROVED', updated_at = now()
  where id = v_request.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    p_admin_id,
    'ACCESS_REQUEST_APPROVED',
    'access_request',
    v_request.id::text,
    jsonb_build_object(
      'email', v_request.email,
      'company_id', v_request.company_id,
      'status', v_request.status
    ),
    jsonb_build_object(
      'email', v_profile.email,
      'company_id', v_profile.company_id,
      'company_name', v_company_name,
      'profile_id', v_profile.id,
      'role', v_profile.role,
      'account_status', v_profile.account_status,
      'status', 'APPROVED'
    )
  );

  return jsonb_build_object(
    'id', v_profile.id,
    'email', v_profile.email,
    'first_name', v_profile.first_name,
    'last_name', v_profile.last_name,
    'role', v_profile.role,
    'account_status', v_profile.account_status,
    'company_id', v_profile.company_id,
    'created_at', v_profile.created_at,
    'company', jsonb_build_object('id', v_profile.company_id, 'name', v_company_name)
  );
end;
$$;

create or replace function public.admin_reject_access_request(
  p_request_id uuid,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.account_requests%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  select * into v_request
  from public.account_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'PENDING' then
    raise exception 'This access request is no longer pending' using errcode = '40001';
  end if;

  update public.account_requests
  set status = 'REJECTED', updated_at = now()
  where id = v_request.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    p_admin_id,
    'ACCESS_REQUEST_REJECTED',
    'access_request',
    v_request.id::text,
    jsonb_build_object('email', v_request.email, 'status', v_request.status),
    jsonb_build_object('email', v_request.email, 'status', 'REJECTED')
  );
end;
$$;

revoke all on function public.validate_access_request_company() from public;
revoke all on function public.admin_finalize_access_request(uuid, uuid, uuid) from public;
revoke all on function public.admin_finalize_access_request(uuid, uuid, uuid) from anon;
revoke all on function public.admin_finalize_access_request(uuid, uuid, uuid) from authenticated;
revoke all on function public.admin_reject_access_request(uuid, uuid) from public;
revoke all on function public.admin_reject_access_request(uuid, uuid) from anon;
revoke all on function public.admin_reject_access_request(uuid, uuid) from authenticated;
grant execute on function public.admin_finalize_access_request(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_reject_access_request(uuid, uuid) to service_role;

commit;
