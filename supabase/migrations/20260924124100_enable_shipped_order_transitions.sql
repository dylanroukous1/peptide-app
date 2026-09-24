begin;

alter table public.orders
  add column if not exists shipped_at timestamptz;

comment on column public.orders.shipped_at is
  'Timestamp when an administrator moved the order into the SHIPPED lifecycle status.';

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_new_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_item_count integer;
  v_total_quantity bigint;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  select * into v_before
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if p_new_status = v_before.status then return; end if;

  if not (
    (v_before.status = 'SUBMITTED' and p_new_status in ('UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'EXPIRED'))
    or (v_before.status = 'UNDER_REVIEW' and p_new_status in ('APPROVED', 'CANCELLED', 'EXPIRED'))
    or (v_before.status = 'APPROVED' and p_new_status in ('IN_PRODUCTION', 'CANCELLED'))
    or (v_before.status = 'IN_PRODUCTION' and p_new_status in ('SHIPPED', 'CANCELLED'))
    or (v_before.status = 'SHIPPED' and p_new_status in ('FULFILLED', 'CANCELLED'))
  ) then
    raise exception 'Invalid order status transition from % to %', v_before.status, p_new_status
      using errcode = '22023';
  end if;

  if p_new_status = 'APPROVED' then
    update public.order_items
    set
      approved_quantity = coalesce(approved_quantity, requested_quantity),
      unit_price_final = coalesce(unit_price_final, unit_price_at_submission)
    where order_id = p_order_id;
  end if;

  update public.orders
  set
    status = p_new_status,
    reviewed_at = case when p_new_status in ('UNDER_REVIEW', 'APPROVED') then coalesce(reviewed_at, now()) else reviewed_at end,
    approved_at = case when p_new_status = 'APPROVED' then now() else approved_at end,
    approved_quantity = case when p_new_status = 'APPROVED' and requested_quantity is not null then coalesce(approved_quantity, requested_quantity) else approved_quantity end,
    unit_price_final = case when p_new_status = 'APPROVED' and unit_price_at_submission is not null then coalesce(unit_price_final, unit_price_at_submission) else unit_price_final end,
    shipped_at = case when p_new_status = 'SHIPPED' then now() else shipped_at end,
    fulfilled_at = case when p_new_status = 'FULFILLED' then now() else fulfilled_at end,
    cancelled_at = case when p_new_status in ('CANCELLED', 'EXPIRED') then now() else cancelled_at end
  where id = p_order_id
  returning * into v_after;

  select count(*)::integer, coalesce(sum(requested_quantity), 0)
  into v_item_count, v_total_quantity
  from public.order_items
  where order_id = p_order_id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    v_admin_id,
    'ORDER_STATUS_UPDATED',
    'order',
    v_after.id::text,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object(
      'status', v_after.status,
      'order_number', v_after.order_number,
      'item_count', v_item_count,
      'total_quantity', v_total_quantity,
      'total_price', v_after.total_price,
      'final_total', v_after.final_total
    )
  );
end;
$$;

revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;
revoke all on function public.admin_update_order_status(uuid, public.order_status) from anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

commit;
