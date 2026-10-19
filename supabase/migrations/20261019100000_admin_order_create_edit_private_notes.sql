begin;

-- Private administrator notes are deliberately stored separately from orders:
-- customer order reads can never return these fields by selecting the order row.
create table if not exists public.order_admin_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_admin_notes_order_created
  on public.order_admin_notes(order_id, created_at desc);

alter table public.order_admin_notes enable row level security;
revoke all on table public.order_admin_notes from public, anon, authenticated;
grant select on table public.order_admin_notes to authenticated;

drop policy if exists "active admins read order admin notes" on public.order_admin_notes;
create policy "active admins read order admin notes"
on public.order_admin_notes for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
));

comment on table public.order_admin_notes is
  'Private, append-only administrator notes for orders; intentionally unavailable to customers.';
comment on column public.order_admin_notes.note is
  'Internal operational note visible only to active administrators.';

create or replace function public.admin_create_customer_order(
  p_company_id uuid,
  p_user_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_user_notes text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_item jsonb;
  v_peptide_id uuid;
  v_quantity_numeric numeric;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(14,2);
  v_total numeric(14,2) := 0;
  v_quantity_total bigint := 0;
  v_seen uuid[] := array[]::uuid[];
  v_validated jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p where p.id = v_admin_id
      and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id and c.is_active) then
    raise exception 'Select an active company' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id
      and p.role = 'USER' and p.account_status = 'ACTIVE' and p.company_id = p_company_id) then
    raise exception 'Select an active customer assigned to this company' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_addresses a where a.id = p_address_id and a.company_id = p_company_id) then
    raise exception 'The shipping address does not belong to the selected company' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'An order cannot contain more than 500 products' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'peptide_id') or not (v_item ? 'requested_quantity')
      or exists (select 1 from jsonb_object_keys(v_item) f(key) where key not in ('peptide_id','requested_quantity'))
      or jsonb_typeof(v_item->'peptide_id') <> 'string' or jsonb_typeof(v_item->'requested_quantity') <> 'number'
      or (v_item->>'peptide_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Each product must contain only a valid peptide_id and requested_quantity' using errcode = '22023';
    end if;
    v_peptide_id := (v_item->>'peptide_id')::uuid;
    v_quantity_numeric := (v_item->>'requested_quantity')::numeric;
    if v_quantity_numeric <> trunc(v_quantity_numeric) or v_quantity_numeric <= 0 or v_quantity_numeric > 2147483647 then
      raise exception 'Product quantities must be positive whole numbers' using errcode = '22023';
    end if;
    if v_peptide_id = any(v_seen) then raise exception 'A product can appear only once per order' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_peptide_id);
    select p.default_unit_price into v_unit_price from public.peptides p
      where p.id = v_peptide_id and p.is_active = true for share;
    if v_unit_price is null then raise exception 'One or more selected products are inactive or unavailable' using errcode = '22023'; end if;
    v_quantity := v_quantity_numeric::integer;
    v_line_total := round(v_unit_price * v_quantity, 2);
    v_total := v_total + v_line_total;
    v_quantity_total := v_quantity_total + v_quantity;
    if v_total > 999999999999.99 then raise exception 'Order total exceeds the supported limit' using errcode = '22003'; end if;
    v_validated := v_validated || jsonb_build_array(jsonb_build_object(
      'peptide_id', v_peptide_id, 'requested_quantity', v_quantity,
      'unit_price', v_unit_price, 'line_total', v_line_total
    ));
  end loop;

  insert into public.orders (
    order_number, company_id, user_id, peptide_id, batch_id, address_id,
    requested_quantity, approved_quantity, unit_price_at_submission, unit_price_final,
    total_price, status, user_notes
  ) values (
    'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(replace(gen_random_uuid()::text, '-', '')),
    p_company_id, p_user_id, null, null, p_address_id, null, null, null, null,
    v_total, 'SUBMITTED', nullif(btrim(p_user_notes), '')
  ) returning * into v_order;

  insert into public.order_items(order_id, peptide_id, requested_quantity, unit_price_at_submission, line_total)
  select v_order.id, x.peptide_id, x.requested_quantity, x.unit_price, x.line_total
  from jsonb_to_recordset(v_validated) as x(peptide_id uuid, requested_quantity integer, unit_price numeric(12,2), line_total numeric(14,2));

  if nullif(btrim(p_admin_note), '') is not null then
    insert into public.order_admin_notes(order_id, author_id, note) values (v_order.id, v_admin_id, btrim(p_admin_note));
  end if;
  v_count := jsonb_array_length(v_validated);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_json)
  values (v_admin_id, 'ADMIN_ORDER_CREATED', 'order', v_order.id::text, jsonb_build_object(
    'order_number', v_order.order_number, 'company_id', p_company_id, 'user_id', p_user_id,
    'item_count', v_count, 'total_quantity', v_quantity_total, 'total_price', v_total, 'status', v_order.status
  ));
  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number,
    'item_count', v_count, 'total_quantity', v_quantity_total, 'total_price', v_total, 'status', v_order.status);
end;
$$;

create or replace function public.admin_edit_customer_order(
  p_order_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_user_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_item jsonb;
  v_peptide_id uuid;
  v_quantity_numeric numeric;
  v_quantity integer;
  v_price numeric(12,2);
  v_line_total numeric(14,2);
  v_total numeric(14,2) := 0;
  v_qty_total bigint := 0;
  v_seen uuid[] := array[]::uuid[];
  v_validated jsonb := '[]'::jsonb;
  v_count integer;
  v_discount numeric(14,2) := 0;
  v_final numeric(14,2);
  v_old_lines jsonb;
  v_new_lines jsonb;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then raise exception 'Active administrator access is required' using errcode = '42501'; end if;

  select * into v_before from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_before.status not in ('SUBMITTED', 'UNDER_REVIEW') then
    raise exception 'Only submitted or under-review orders can be edited' using errcode = '22023';
  end if;
  if not exists (select 1 from public.company_addresses a where a.id = p_address_id and a.company_id = v_before.company_id) then
    raise exception 'The shipping address does not belong to this order company' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must contain at least one product' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'An order cannot contain more than 500 products' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'peptide_id') or not (v_item ? 'requested_quantity')
      or exists (select 1 from jsonb_object_keys(v_item) f(key) where key not in ('peptide_id','requested_quantity'))
      or jsonb_typeof(v_item->'peptide_id') <> 'string' or jsonb_typeof(v_item->'requested_quantity') <> 'number'
      or (v_item->>'peptide_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Each product must contain only a valid peptide_id and requested_quantity' using errcode = '22023';
    end if;
    v_peptide_id := (v_item->>'peptide_id')::uuid;
    v_quantity_numeric := (v_item->>'requested_quantity')::numeric;
    if v_quantity_numeric <> trunc(v_quantity_numeric) or v_quantity_numeric <= 0 or v_quantity_numeric > 2147483647 then
      raise exception 'Product quantities must be positive whole numbers' using errcode = '22023';
    end if;
    if v_peptide_id = any(v_seen) then raise exception 'A product can appear only once per order' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_peptide_id);

    select oi.unit_price_at_submission into v_price from public.order_items oi
      where oi.order_id = p_order_id and oi.peptide_id = v_peptide_id;
    if not found then
      if v_before.batch_id is not null then
        raise exception 'Products cannot be added to or removed from a legacy batch-linked order' using errcode = '22023';
      end if;
      select p.default_unit_price into v_price from public.peptides p where p.id = v_peptide_id and p.is_active = true for share;
      if v_price is null then raise exception 'New products must be active' using errcode = '22023'; end if;
    end if;
    v_quantity := v_quantity_numeric::integer;
    v_line_total := round(v_price * v_quantity, 2);
    v_total := v_total + v_line_total;
    v_qty_total := v_qty_total + v_quantity;
    if v_total > 999999999999.99 then raise exception 'Order total exceeds the supported limit' using errcode = '22003'; end if;
    v_validated := v_validated || jsonb_build_array(jsonb_build_object(
      'peptide_id', v_peptide_id, 'requested_quantity', v_quantity, 'unit_price', v_price, 'line_total', v_line_total
    ));
  end loop;

  if v_before.batch_id is not null and exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id and not (oi.peptide_id = any(v_seen))
  ) then raise exception 'Products cannot be added to or removed from a legacy batch-linked order' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('peptide_id', peptide_id, 'requested_quantity', requested_quantity) order by peptide_id), '[]'::jsonb)
    into v_old_lines from public.order_items where order_id = p_order_id;
  delete from public.order_items oi where oi.order_id = p_order_id and not (oi.peptide_id = any(v_seen));
  update public.order_items oi set requested_quantity = x.requested_quantity,
      approved_quantity = null, unit_price_final = null, line_total = x.line_total, updated_at = now()
  from jsonb_to_recordset(v_validated) as x(peptide_id uuid, requested_quantity integer, unit_price numeric(12,2), line_total numeric(14,2))
  where oi.order_id = p_order_id and oi.peptide_id = x.peptide_id;
  insert into public.order_items(order_id, peptide_id, requested_quantity, unit_price_at_submission, line_total)
  select p_order_id, x.peptide_id, x.requested_quantity, x.unit_price, x.line_total
  from jsonb_to_recordset(v_validated) as x(peptide_id uuid, requested_quantity integer, unit_price numeric(12,2), line_total numeric(14,2))
  where not exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.peptide_id = x.peptide_id);

  if v_before.discount_type = 'PERCENT' then
    v_discount := round(v_total * v_before.discount_value / 100, 2);
  elsif v_before.discount_type = 'FIXED' then
    if v_before.discount_value > v_total then raise exception 'The existing fixed discount exceeds the revised subtotal; remove or revise the discount first' using errcode = '22023'; end if;
    v_discount := v_before.discount_value;
  end if;
  v_final := round(v_total - v_discount, 2);
  v_count := jsonb_array_length(v_validated);
  select coalesce(jsonb_agg(jsonb_build_object('peptide_id', peptide_id, 'requested_quantity', requested_quantity) order by peptide_id), '[]'::jsonb)
    into v_new_lines from public.order_items where order_id = p_order_id;

  update public.orders set address_id = p_address_id, user_notes = nullif(btrim(p_user_notes), ''),
    total_price = v_total, discount_amount = v_discount, final_total = v_final,
    peptide_id = case when batch_id is null then null when v_count = 1 then (v_validated->0->>'peptide_id')::uuid else peptide_id end,
    requested_quantity = case when batch_id is not null and v_count = 1 then (v_validated->0->>'requested_quantity')::integer else requested_quantity end,
    unit_price_at_submission = case when batch_id is not null and v_count = 1 then (v_validated->0->>'unit_price')::numeric(12,2) else unit_price_at_submission end,
    approved_quantity = null, unit_price_final = null, updated_at = now()
  where id = p_order_id returning * into v_after;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (v_admin_id, 'ORDER_DETAILS_UPDATED', 'order', p_order_id::text,
    jsonb_build_object('address_id', v_before.address_id, 'items', v_old_lines, 'user_notes', v_before.user_notes, 'total_price', v_before.total_price),
    jsonb_build_object('order_number', v_after.order_number, 'address_id', v_after.address_id, 'items', v_new_lines,
      'item_count', v_count, 'total_quantity', v_qty_total, 'total_price', v_after.total_price, 'final_total', v_after.final_total));
  return jsonb_build_object('order_id', v_after.id, 'order_number', v_after.order_number,
    'item_count', v_count, 'total_quantity', v_qty_total, 'subtotal', v_after.total_price,
    'discount_amount', v_after.discount_amount, 'final_total', v_after.final_total);
end;
$$;

create or replace function public.admin_add_order_note(p_order_id uuid, p_note text)
returns public.order_admin_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note public.order_admin_notes%rowtype;
  v_order public.orders%rowtype;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then raise exception 'Active administrator access is required' using errcode = '42501'; end if;
  if nullif(btrim(p_note), '') is null or char_length(btrim(p_note)) > 5000 then
    raise exception 'A note between 1 and 5,000 characters is required' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  insert into public.order_admin_notes(order_id, author_id, note) values (p_order_id, v_admin_id, btrim(p_note)) returning * into v_note;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_json)
  values (v_admin_id, 'ORDER_ADMIN_NOTE_ADDED', 'order', p_order_id::text,
    jsonb_build_object('order_number', v_order.order_number, 'note_id', v_note.id));
  return v_note;
end;
$$;

revoke all on function public.admin_create_customer_order(uuid, uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.admin_create_customer_order(uuid, uuid, uuid, jsonb, text, text) to authenticated;
revoke all on function public.admin_edit_customer_order(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.admin_edit_customer_order(uuid, uuid, jsonb, text) to authenticated;
revoke all on function public.admin_add_order_note(uuid, text) from public, anon;
grant execute on function public.admin_add_order_note(uuid, text) to authenticated;

commit;
