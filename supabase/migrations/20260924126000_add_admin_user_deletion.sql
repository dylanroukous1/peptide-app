begin;

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user public.profiles%rowtype;
  v_order_count integer;
  v_wishlist_count integer;
begin
  if v_admin_id is null or not exists (
    select 1
    from public.profiles p
    where p.id = v_admin_id
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  if p_user_id = v_admin_id then
    raise exception 'You cannot delete your own account' using errcode = '22023';
  end if;

  select * into v_user
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_order_count
  from public.orders
  where user_id = p_user_id;

  select count(*)::integer into v_wishlist_count
  from public.wishlist_requests
  where user_id = p_user_id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    v_admin_id,
    'USER_DELETED',
    'user',
    v_user.id::text,
    jsonb_build_object(
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'role', v_user.role,
      'account_status', v_user.account_status,
      'company_id', v_user.company_id,
      'order_count', v_order_count,
      'wishlist_count', v_wishlist_count
    ),
    jsonb_build_object(
      'email', v_user.email,
      'deleted_at', clock_timestamp()
    )
  );

  -- User-owned orders must be removed before the profile because their user_id
  -- relationship is intentionally restrictive. Order items and shipments cascade
  -- from orders, while email-event order references are retained and set to null.
  delete from public.wishlist_requests where user_id = p_user_id;
  delete from public.orders where user_id = p_user_id;

  -- Deleting the Auth identity also removes its profile through the existing
  -- auth.users -> profiles ON DELETE CASCADE relationship.
  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'Authentication account not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'email', v_user.email,
    'deleted', true,
    'deleted_orders', v_order_count,
    'deleted_wishlist_requests', v_wishlist_count
  );
end;
$$;

revoke delete on table public.profiles from authenticated;
revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.admin_delete_user(uuid) from anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

commit;
