begin;

alter table public.orders
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_voided_by_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_voided_by_fkey
      foreign key (voided_by) references public.profiles(id) on delete restrict;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_void_metadata_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_void_metadata_check check (
        (voided_at is null and voided_by is null and void_reason is null)
        or (
          voided_at is not null
          and voided_by is not null
          and length(btrim(void_reason)) >= 5
        )
      );
  end if;
end
$$;

comment on column public.orders.voided_at is
  'Authoritative timestamp indicating that an order is excluded from operational reporting and revenue.';
comment on column public.orders.voided_by is
  'Active administrator profile that voided the order; the lifecycle status remains unchanged.';
comment on column public.orders.void_reason is
  'Trimmed administrator reason explaining why the order was removed from operational reporting.';

create index if not exists idx_orders_voided_at
  on public.orders (voided_at)
  where voided_at is not null;

create or replace function public.admin_void_order(
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
  v_voided_at timestamptz := clock_timestamp();
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
    raise exception 'Void reason must contain at least 5 characters' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.voided_at is not null then
    raise exception 'Order is already voided' using errcode = '22023';
  end if;

  update public.orders
  set
    voided_at = v_voided_at,
    voided_by = v_admin.id,
    void_reason = v_reason
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
    'ORDER_VOIDED',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'status', v_order.status,
      'voided_at', v_order.voided_at
    ),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'previous_status', v_order.status,
      'final_total', v_order.final_total,
      'reason', v_reason,
      'administrator_id', v_admin.id,
      'administrator_email', v_admin.email,
      'voided_at', v_voided_at
    )
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'voided_at', v_voided_at,
    'voided_by', v_admin.id,
    'void_reason', v_reason
  );
end;
$$;

revoke all on function public.admin_void_order(uuid, text) from public;
revoke all on function public.admin_void_order(uuid, text) from anon;
grant execute on function public.admin_void_order(uuid, text) to authenticated;

commit;
