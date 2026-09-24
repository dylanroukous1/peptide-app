begin;

create or replace function public.admin_delete_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_company public.companies%rowtype;
  v_order_count integer;
  v_user_count integer;
  v_address_count integer;
  v_wishlist_count integer;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_order_count from public.orders where company_id = p_company_id;
  select count(*)::integer into v_user_count from public.profiles where company_id = p_company_id;
  select count(*)::integer into v_address_count from public.company_addresses where company_id = p_company_id;
  select count(*)::integer into v_wishlist_count from public.wishlist_requests where company_id = p_company_id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    v_admin_id,
    'COMPANY_DELETED',
    'company',
    v_company.id::text,
    jsonb_build_object(
      'name', v_company.name,
      'billing_email', v_company.billing_email,
      'is_active', v_company.is_active,
      'order_count', v_order_count,
      'user_count', v_user_count,
      'address_count', v_address_count,
      'wishlist_count', v_wishlist_count
    ),
    jsonb_build_object(
      'name', v_company.name,
      'deleted_at', clock_timestamp()
    )
  );

  -- These relationships intentionally retain no company-owned operational data.
  -- Order items and shipments cascade from orders; email-event order references
  -- become null. Profiles remain as accounts but become unassigned via their
  -- existing ON DELETE SET NULL relationship.
  delete from public.wishlist_requests where company_id = p_company_id;
  delete from public.orders where company_id = p_company_id;
  delete from public.companies where id = p_company_id;

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'deleted', true,
    'deleted_orders', v_order_count,
    'unassigned_users', v_user_count
  );
end;
$$;

revoke delete on table public.companies from authenticated;
revoke all on function public.admin_delete_company(uuid) from public;
revoke all on function public.admin_delete_company(uuid) from anon;
grant execute on function public.admin_delete_company(uuid) to authenticated;

commit;
