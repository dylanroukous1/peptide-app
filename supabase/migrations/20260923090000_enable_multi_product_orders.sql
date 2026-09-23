begin;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  peptide_id uuid not null references public.peptides(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  approved_quantity integer check (approved_quantity is null or approved_quantity >= 0),
  unit_price_at_submission numeric(12,2) not null check (unit_price_at_submission >= 0),
  unit_price_final numeric(12,2) check (unit_price_final is null or unit_price_final >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_order_peptide_key unique (order_id, peptide_id)
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_peptide_id on public.order_items(peptide_id);

drop trigger if exists set_updated_at_order_items on public.order_items;
create trigger set_updated_at_order_items
before update on public.order_items
for each row execute function public.set_updated_at();

-- Every legacy order becomes a one-line order. ON CONFLICT makes this safe to
-- rerun without duplicating a previously backfilled line.
insert into public.order_items (
  order_id,
  peptide_id,
  requested_quantity,
  approved_quantity,
  unit_price_at_submission,
  unit_price_final,
  line_total,
  created_at,
  updated_at
)
select
  o.id,
  o.peptide_id,
  o.requested_quantity,
  o.approved_quantity,
  o.unit_price_at_submission,
  o.unit_price_final,
  o.total_price,
  o.created_at,
  o.updated_at
from public.orders o
where o.peptide_id is not null
on conflict (order_id, peptide_id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.orders o
    where not exists (
      select 1 from public.order_items any_item where any_item.order_id = o.id
    )
      or (
        o.peptide_id is not null
        and (
          o.requested_quantity is null
          or o.unit_price_at_submission is null
          or not exists (
          select 1
          from public.order_items oi
          where oi.order_id = o.id
            and oi.peptide_id = o.peptide_id
            and oi.requested_quantity = o.requested_quantity
            and oi.approved_quantity is not distinct from o.approved_quantity
            and oi.unit_price_at_submission = o.unit_price_at_submission
            and oi.unit_price_final is not distinct from o.unit_price_final
            and oi.line_total = o.total_price
          )
        )
      )
  ) then
    raise exception 'Multi-product migration aborted: an existing order could not be backfilled safely';
  end if;
end
$$;

alter table public.orders
  alter column peptide_id drop not null,
  alter column requested_quantity drop not null,
  alter column unit_price_at_submission drop not null;

-- Keep all customer writes behind the price-authoritative RPC even if this
-- migration is applied to an environment that still has the original policy.
drop policy if exists "users insert own orders" on public.orders;

alter table public.order_items enable row level security;

revoke all on table public.order_items from public;
revoke all on table public.order_items from anon;
grant select, insert, update, delete on table public.order_items to authenticated;

drop policy if exists "active admins manage order items" on public.order_items;
create policy "active admins manage order items"
on public.order_items
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'ADMIN'
      and p.account_status = 'ACTIVE'
  )
);

drop policy if exists "users read own order items" on public.order_items;
create policy "users read own order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  )
);

-- Inactive products stay readable only when they belong to the customer's
-- history. They cannot be selected by the submission function below.
drop policy if exists "authenticated read active peptides" on public.peptides;
create policy "authenticated read active peptides"
on public.peptides
for select
to authenticated
using (
  public.is_admin()
  or is_active = true
  or exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.peptide_id = peptides.id
      and o.user_id = auth.uid()
  )
);

create or replace function public.submit_multi_product_order(
  p_address_id uuid,
  p_items jsonb,
  p_user_notes text default null
)
returns table (
  order_id uuid,
  order_number text,
  item_count integer,
  total_quantity bigint,
  total_price numeric(14,2),
  order_status public.order_status,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_item jsonb;
  v_peptide_id uuid;
  v_quantity_numeric numeric;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric;
  v_total_quantity bigint := 0;
  v_total_price numeric := 0;
  v_seen_peptides uuid[] := array[]::uuid[];
  v_validated_items jsonb := '[]'::jsonb;
  v_order public.orders%rowtype;
  v_item_count integer;
  v_product_names jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select p.company_id
  into v_company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id and c.is_active = true
  where p.id = v_user_id
    and p.role = 'USER'
    and p.account_status = 'ACTIVE'
    and p.company_id is not null;

  if v_company_id is null then
    raise exception 'An active user and company are required to place an order'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.company_addresses a
    where a.id = p_address_id
      and a.company_id = v_company_id
  ) then
    raise exception 'The shipping address does not belong to your company'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the order' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception 'An order cannot contain more than 500 products' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'peptide_id')
      or not (v_item ? 'requested_quantity')
      or exists (
        select 1 from jsonb_object_keys(v_item) as fields(key)
        where key not in ('peptide_id', 'requested_quantity')
      )
      or jsonb_typeof(v_item->'peptide_id') <> 'string'
      or jsonb_typeof(v_item->'requested_quantity') <> 'number'
    then
      raise exception 'Each item must contain only peptide_id and requested_quantity'
        using errcode = '22023';
    end if;

    if (v_item->>'peptide_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Each peptide_id must be a valid UUID' using errcode = '22023';
    end if;

    v_peptide_id := (v_item->>'peptide_id')::uuid;
    v_quantity_numeric := (v_item->>'requested_quantity')::numeric;

    if v_quantity_numeric <> trunc(v_quantity_numeric)
      or v_quantity_numeric < 250
      or v_quantity_numeric > 2147483647
    then
      raise exception 'Each product requires a whole-number quantity of at least 250 vials'
        using errcode = '22023';
    end if;
    v_quantity := v_quantity_numeric::integer;

    if v_peptide_id = any(v_seen_peptides) then
      raise exception 'Each peptide may appear only once per order' using errcode = '22023';
    end if;
    v_seen_peptides := array_append(v_seen_peptides, v_peptide_id);

    select p.default_unit_price
    into v_unit_price
    from public.peptides p
    where p.id = v_peptide_id
      and p.is_active = true
    for share;

    if v_unit_price is null then
      raise exception 'One or more selected peptides are missing or inactive'
        using errcode = '22023';
    end if;

    v_line_total := v_unit_price * v_quantity;
    if v_line_total > 999999999999.99
      or v_total_price + v_line_total > 999999999999.99
    then
      raise exception 'Order total exceeds the supported limit' using errcode = '22003';
    end if;

    v_total_quantity := v_total_quantity + v_quantity;
    v_total_price := v_total_price + v_line_total;
    v_validated_items := v_validated_items || jsonb_build_array(jsonb_build_object(
      'peptide_id', v_peptide_id,
      'requested_quantity', v_quantity,
      'unit_price', v_unit_price,
      'line_total', v_line_total
    ));
  end loop;

  if v_total_quantity < 2000 then
    raise exception 'An order requires at least 2,000 total vials' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(v_validated_items);

  insert into public.orders (
    order_number,
    company_id,
    user_id,
    peptide_id,
    batch_id,
    address_id,
    requested_quantity,
    approved_quantity,
    unit_price_at_submission,
    unit_price_final,
    total_price,
    status,
    user_notes
  ) values (
    'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
      upper(replace(gen_random_uuid()::text, '-', '')),
    v_company_id,
    v_user_id,
    null,
    null,
    p_address_id,
    null,
    null,
    null,
    null,
    v_total_price,
    'SUBMITTED',
    nullif(btrim(p_user_notes), '')
  ) returning * into v_order;

  insert into public.order_items (
    order_id,
    peptide_id,
    requested_quantity,
    unit_price_at_submission,
    line_total
  )
  select
    v_order.id,
    item.peptide_id,
    item.requested_quantity,
    item.unit_price,
    item.line_total
  from jsonb_to_recordset(v_validated_items) as item(
    peptide_id uuid,
    requested_quantity integer,
    unit_price numeric(12,2),
    line_total numeric(14,2)
  );

  select jsonb_agg(p.name order by p.name)
  into v_product_names
  from public.order_items oi
  join public.peptides p on p.id = oi.peptide_id
  where oi.order_id = v_order.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, after_json
  ) values (
    v_user_id,
    'ORDER_SUBMITTED',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'company_id', v_order.company_id,
      'item_count', v_item_count,
      'total_quantity', v_total_quantity,
      'total_price', v_total_price,
      'product_names', v_product_names,
      'status', v_order.status
    )
  );

  return query select
    v_order.id,
    v_order.order_number,
    v_item_count,
    v_total_quantity,
    v_total_price,
    v_order.status,
    v_order.submitted_at;
end;
$$;

revoke all on function public.submit_multi_product_order(uuid, jsonb, text) from public;
revoke all on function public.submit_multi_product_order(uuid, jsonb, text) from anon;
grant execute on function public.submit_multi_product_order(uuid, jsonb, text) to authenticated;

-- The legacy RPC remains defined for server compatibility, but customers can no
-- longer execute it to bypass SKU and complete-order minimums.
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from public;
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from anon;
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from authenticated;

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
    or (v_before.status = 'IN_PRODUCTION' and p_new_status in ('FULFILLED', 'CANCELLED'))
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
      'total_price', v_after.total_price
    )
  );
end;
$$;

revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;
revoke all on function public.admin_update_order_status(uuid, public.order_status) from anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

comment on table public.order_items is
  'Authoritative product lines and price snapshots for single- and multi-product orders.';
comment on column public.orders.peptide_id is
  'Legacy single-product reference. Null for new multi-product orders; retained for historical compatibility.';

commit;
