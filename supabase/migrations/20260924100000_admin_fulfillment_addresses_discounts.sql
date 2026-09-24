begin;

alter table public.orders
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(14,2),
  add column if not exists discount_amount numeric(14,2) not null default 0,
  add column if not exists final_total numeric(14,2);

update public.orders
set
  discount_amount = coalesce(discount_amount, 0),
  final_total = coalesce(final_total, total_price)
where discount_amount is null or final_total is null;

alter table public.orders
  alter column final_total set default 0,
  alter column final_total set not null;

create or replace function public.set_order_final_total_default()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.discount_type is null and coalesce(new.discount_amount, 0) = 0 then
    new.discount_value := null;
    new.discount_amount := 0;
    new.final_total := new.total_price;
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_final_total_default on public.orders;
create trigger set_order_final_total_default
before insert or update of total_price on public.orders
for each row execute function public.set_order_final_total_default();

do $$ begin
  alter table public.orders add constraint orders_discount_type_check
    check (discount_type is null or discount_type in ('PERCENT', 'FIXED'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.orders add constraint orders_discount_values_check
    check (
      discount_amount >= 0
      and final_total >= 0
      and final_total <= total_price
      and final_total = round(total_price - discount_amount, 2)
      and (
        (discount_type is null and discount_value is null and discount_amount = 0 and final_total = total_price)
        or
        (discount_type = 'PERCENT' and discount_value > 0 and discount_value <= 100
          and discount_amount = round(total_price * discount_value / 100, 2))
        or
        (discount_type = 'FIXED' and discount_value > 0 and discount_value <= total_price
          and discount_amount = round(discount_value, 2))
      )
    );
exception when duplicate_object then null;
end $$;

-- Normalize legacy duplicates before enforcing one default destination per company.
with ranked_defaults as (
  select id, row_number() over (partition by company_id order by updated_at desc, created_at desc, id) as rn
  from public.company_addresses
  where is_default = true
)
update public.company_addresses a
set is_default = false
from ranked_defaults r
where a.id = r.id and r.rn > 1;

create unique index if not exists company_addresses_one_default_per_company
  on public.company_addresses(company_id)
  where is_default = true;

create or replace function public.admin_create_company(
  p_name text,
  p_billing_contact_name text default null,
  p_billing_email text default null,
  p_phone text default null,
  p_notes text default null,
  p_address jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_company public.companies%rowtype;
  v_address public.company_addresses%rowtype;
  v_has_address boolean := p_address is not null and p_address <> '{}'::jsonb;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Company name is required' using errcode = '22023';
  end if;
  if v_has_address then
    if jsonb_typeof(p_address) <> 'object'
      or exists (select 1 from jsonb_object_keys(p_address) key where key not in ('label','recipient_name','line1','line2','city','state','postal_code','country','is_default'))
    then
      raise exception 'Invalid shipping address data' using errcode = '22023';
    end if;
    if nullif(btrim(p_address->>'line1'), '') is null
      or nullif(btrim(p_address->>'city'), '') is null
      or nullif(btrim(p_address->>'state'), '') is null
      or nullif(btrim(p_address->>'postal_code'), '') is null
      or nullif(btrim(p_address->>'country'), '') is null
    then
      raise exception 'Complete shipping address fields are required' using errcode = '22023';
    end if;
  end if;

  insert into public.companies(name, billing_contact_name, billing_email, phone, notes, is_active)
  values (
    btrim(p_name), nullif(btrim(p_billing_contact_name), ''),
    nullif(lower(btrim(p_billing_email)), ''), nullif(btrim(p_phone), ''),
    nullif(btrim(p_notes), ''), true
  ) returning * into v_company;

  if v_has_address then
    insert into public.company_addresses(company_id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default)
    values (
      v_company.id, coalesce(nullif(btrim(p_address->>'label'), ''), 'Primary'),
      nullif(btrim(p_address->>'recipient_name'), ''), btrim(p_address->>'line1'),
      nullif(btrim(p_address->>'line2'), ''), btrim(p_address->>'city'),
      btrim(p_address->>'state'), btrim(p_address->>'postal_code'), btrim(p_address->>'country'),
      coalesce((p_address->>'is_default')::boolean, true)
    ) returning * into v_address;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    v_admin_id, 'COMPANY_CREATED', 'company', v_company.id::text, null,
    jsonb_build_object('name', v_company.name, 'has_shipping_address', v_address.id is not null)
  );
  return v_company.id;
end;
$$;

create or replace function public.admin_upsert_company_address(
  p_company_id uuid,
  p_address_id uuid,
  p_address jsonb
)
returns public.company_addresses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_company_name text;
  v_before public.company_addresses%rowtype;
  v_after public.company_addresses%rowtype;
  v_is_default boolean;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then
    raise exception 'Active administrator access is required' using errcode = '42501';
  end if;
  select name into v_company_name from public.companies where id = p_company_id;
  if not found then raise exception 'Company not found' using errcode = 'P0002'; end if;
  if p_address is null or jsonb_typeof(p_address) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_address) key where key not in ('label','recipient_name','line1','line2','city','state','postal_code','country','is_default'))
  then raise exception 'Invalid shipping address data' using errcode = '22023'; end if;
  if nullif(btrim(p_address->>'line1'), '') is null
    or nullif(btrim(p_address->>'city'), '') is null
    or nullif(btrim(p_address->>'state'), '') is null
    or nullif(btrim(p_address->>'postal_code'), '') is null
    or nullif(btrim(p_address->>'country'), '') is null
  then raise exception 'Complete shipping address fields are required' using errcode = '22023'; end if;

  v_is_default := coalesce((p_address->>'is_default')::boolean, false);
  if p_address_id is not null then
    select * into v_before from public.company_addresses
    where id = p_address_id and company_id = p_company_id for update;
    if not found then raise exception 'Shipping address not found for this company' using errcode = 'P0002'; end if;
  end if;
  if v_is_default then
    update public.company_addresses set is_default = false
    where company_id = p_company_id and (p_address_id is null or id <> p_address_id) and is_default = true;
  end if;

  if p_address_id is null then
    insert into public.company_addresses(company_id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default)
    values (
      p_company_id, nullif(btrim(p_address->>'label'), ''), nullif(btrim(p_address->>'recipient_name'), ''),
      btrim(p_address->>'line1'), nullif(btrim(p_address->>'line2'), ''), btrim(p_address->>'city'),
      btrim(p_address->>'state'), btrim(p_address->>'postal_code'), btrim(p_address->>'country'), v_is_default
    ) returning * into v_after;
  else
    update public.company_addresses set
      label = nullif(btrim(p_address->>'label'), ''), recipient_name = nullif(btrim(p_address->>'recipient_name'), ''),
      line1 = btrim(p_address->>'line1'), line2 = nullif(btrim(p_address->>'line2'), ''),
      city = btrim(p_address->>'city'), state = btrim(p_address->>'state'),
      postal_code = btrim(p_address->>'postal_code'), country = btrim(p_address->>'country'),
      is_default = v_is_default
    where id = p_address_id and company_id = p_company_id returning * into v_after;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    v_admin_id, case when p_address_id is null then 'COMPANY_ADDRESS_CREATED' else 'COMPANY_ADDRESS_UPDATED' end,
    'company', p_company_id::text, to_jsonb(v_before),
    jsonb_build_object('name', v_company_name, 'address_id', v_after.id, 'label', v_after.label, 'is_default', v_after.is_default)
  );
  return v_after;
end;
$$;

create or replace function public.admin_upsert_order_shipment(
  p_order_id uuid,
  p_carrier_name text,
  p_tracking_number text,
  p_ship_date date default null,
  p_estimated_delivery_date date default null,
  p_shipment_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_before public.shipments%rowtype;
  v_after public.shipments%rowtype;
  v_was_existing boolean := false;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then raise exception 'Active administrator access is required' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.status in ('CANCELLED', 'EXPIRED') then
    raise exception 'Shipping cannot be changed for a cancelled or expired order' using errcode = '22023';
  end if;
  if nullif(btrim(p_carrier_name), '') is null then raise exception 'Carrier is required' using errcode = '22023'; end if;
  if nullif(btrim(p_tracking_number), '') is null then raise exception 'Tracking number is required' using errcode = '22023'; end if;
  if p_ship_date is not null and p_estimated_delivery_date is not null and p_estimated_delivery_date < p_ship_date then
    raise exception 'Estimated delivery cannot precede ship date' using errcode = '22023';
  end if;
  select * into v_before from public.shipments where order_id = p_order_id for update;
  v_was_existing := found;

  insert into public.shipments(order_id, carrier_name, tracking_number, ship_date, estimated_delivery_date, shipment_notes)
  values (p_order_id, btrim(p_carrier_name), btrim(p_tracking_number), p_ship_date, p_estimated_delivery_date, nullif(btrim(p_shipment_notes), ''))
  on conflict (order_id) do update set
    carrier_name = excluded.carrier_name, tracking_number = excluded.tracking_number,
    ship_date = excluded.ship_date, estimated_delivery_date = excluded.estimated_delivery_date,
    shipment_notes = excluded.shipment_notes
  returning * into v_after;

  if not v_was_existing and v_order.status = 'APPROVED' then
    update public.orders set status = 'IN_PRODUCTION' where id = p_order_id;
    v_order.status := 'IN_PRODUCTION';
  end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    v_admin_id, case when v_was_existing then 'ORDER_SHIPMENT_UPDATED' else 'ORDER_TRACKING_ADDED' end,
    'order', p_order_id::text, case when v_was_existing then to_jsonb(v_before) else null end,
    jsonb_build_object('order_number', v_order.order_number, 'carrier_name', v_after.carrier_name,
      'tracking_number', v_after.tracking_number, 'ship_date', v_after.ship_date,
      'estimated_delivery_date', v_after.estimated_delivery_date, 'status', v_order.status)
  );
  return jsonb_build_object('shipment', to_jsonb(v_after), 'order_status', v_order.status);
end;
$$;

create or replace function public.admin_set_order_discount(
  p_order_id uuid,
  p_discount_type text,
  p_discount_value numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_discount_type text := upper(nullif(btrim(p_discount_type), ''));
  v_discount_value numeric(14,2);
  v_discount_amount numeric(14,2);
  v_final_total numeric(14,2);
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id and p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  ) then raise exception 'Active administrator access is required' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.status in ('CANCELLED', 'EXPIRED', 'FULFILLED') then
    raise exception 'Discounts cannot be changed for cancelled, expired, or fulfilled orders' using errcode = '22023';
  end if;

  if v_discount_type is null and p_discount_value is null then
    v_discount_value := null; v_discount_amount := 0; v_final_total := v_order.total_price;
  else
    if v_discount_type not in ('PERCENT', 'FIXED') then raise exception 'Discount type must be PERCENT or FIXED' using errcode = '22023'; end if;
    if p_discount_value is null or p_discount_value <= 0 then raise exception 'Discount value must be positive' using errcode = '22023'; end if;
    v_discount_value := round(p_discount_value, 2);
    if v_discount_type = 'PERCENT' then
      if v_discount_value > 100 then raise exception 'Percentage discount cannot exceed 100%' using errcode = '22023'; end if;
      v_discount_amount := round(v_order.total_price * v_discount_value / 100, 2);
    else
      if v_discount_value > v_order.total_price then raise exception 'Fixed discount cannot exceed the subtotal' using errcode = '22023'; end if;
      v_discount_amount := v_discount_value;
    end if;
    v_final_total := round(v_order.total_price - v_discount_amount, 2);
  end if;

  update public.orders set discount_type = v_discount_type, discount_value = v_discount_value,
    discount_amount = v_discount_amount, final_total = v_final_total
  where id = p_order_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    v_admin_id, case when v_discount_type is null then 'ORDER_DISCOUNT_REMOVED' else 'ORDER_DISCOUNT_UPDATED' end,
    'order', p_order_id::text,
    jsonb_build_object('discount_type', v_order.discount_type, 'discount_value', v_order.discount_value,
      'discount_amount', v_order.discount_amount, 'final_total', v_order.final_total),
    jsonb_build_object('order_number', v_order.order_number, 'subtotal', v_order.total_price,
      'discount_type', v_discount_type, 'discount_value', v_discount_value,
      'discount_amount', v_discount_amount, 'final_total', v_final_total)
  );
  return jsonb_build_object('subtotal', v_order.total_price, 'discount_type', v_discount_type,
    'discount_value', v_discount_value, 'discount_amount', v_discount_amount, 'final_total', v_final_total);
end;
$$;

revoke all on function public.admin_create_company(text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.admin_create_company(text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.admin_upsert_company_address(uuid,uuid,jsonb) from public, anon;
grant execute on function public.admin_upsert_company_address(uuid,uuid,jsonb) to authenticated;
revoke all on function public.admin_upsert_order_shipment(uuid,text,text,date,date,text) from public, anon;
grant execute on function public.admin_upsert_order_shipment(uuid,text,text,date,date,text) to authenticated;
revoke all on function public.admin_set_order_discount(uuid,text,numeric) from public, anon;
grant execute on function public.admin_set_order_discount(uuid,text,numeric) to authenticated;

commit;
