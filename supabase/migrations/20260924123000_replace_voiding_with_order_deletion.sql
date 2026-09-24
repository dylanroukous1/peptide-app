begin;

-- Voiding never changed the lifecycle status. Dropping its nullable metadata
-- makes every retained order operational again, with no data rewrite needed.

drop function if exists public.admin_void_order(uuid, text);
drop function if exists public.admin_reactivate_order(uuid, text);
drop index if exists public.idx_orders_voided_at;

alter table public.orders
  drop constraint if exists orders_void_metadata_check,
  drop constraint if exists orders_voided_by_fkey,
  drop column if exists voided_at,
  drop column if exists voided_by,
  drop column if exists void_reason;

create or replace function public.admin_delete_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_item_count integer;
  v_had_shipment boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_admin
  from public.profiles
  where id = auth.uid()
    and role = 'ADMIN'
    and account_status = 'ACTIVE';

  if not found then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_item_count
  from public.order_items
  where order_id = v_order.id;

  select exists (
    select 1 from public.shipments where order_id = v_order.id
  ) into v_had_shipment;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  ) values (
    v_admin.id,
    'ORDER_DELETED',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', v_order.status,
      'company_id', v_order.company_id,
      'user_id', v_order.user_id,
      'subtotal', v_order.total_price,
      'discount_amount', v_order.discount_amount,
      'final_total', v_order.final_total,
      'item_count', v_item_count,
      'had_shipment', v_had_shipment
    ),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'deleted_at', clock_timestamp(),
      'deleted_by', v_admin.id
    )
  );

  delete from public.orders where id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'deleted', true
  );
end;
$$;

revoke delete on table public.orders from authenticated;
revoke all on function public.admin_delete_order(uuid) from public;
revoke all on function public.admin_delete_order(uuid) from anon;
grant execute on function public.admin_delete_order(uuid) to authenticated;

commit;
