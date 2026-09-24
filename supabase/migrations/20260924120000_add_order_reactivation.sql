begin;

create or replace function public.admin_reactivate_order(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.profiles%rowtype;
  v_order public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reactivated_at timestamptz := clock_timestamp();
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

  if length(v_reason) < 5 then
    raise exception 'Reactivation reason must contain at least 5 characters' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.voided_at is null then
    raise exception 'Order is not voided' using errcode = '22023';
  end if;

  update public.orders
  set
    voided_at = null,
    voided_by = null,
    void_reason = null
  where id = v_order.id;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  ) values (
    v_admin.id,
    'ORDER_REACTIVATED',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'status', v_order.status,
      'voided_at', v_order.voided_at,
      'voided_by', v_order.voided_by,
      'void_reason', v_order.void_reason
    ),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', v_order.status,
      'final_total', v_order.final_total,
      'reason', v_reason,
      'administrator_id', v_admin.id,
      'administrator_email', v_admin.email,
      'reactivated_at', v_reactivated_at
    )
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'voided_at', null,
    'voided_by', null,
    'void_reason', null,
    'reactivated_at', v_reactivated_at
  );
end;
$$;

revoke all on function public.admin_reactivate_order(uuid, text) from public;
revoke all on function public.admin_reactivate_order(uuid, text) from anon;
grant execute on function public.admin_reactivate_order(uuid, text) to authenticated;

commit;
