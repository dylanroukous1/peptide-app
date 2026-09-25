begin;

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
    select 1
    from public.company_addresses a
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
        select 1
        from jsonb_object_keys(v_item) as fields(key)
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
      or v_quantity_numeric <= 0
      or v_quantity_numeric > 2147483647
    then
      raise exception 'Each product requires a positive whole-number quantity'
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

-- Keep the retired single-product endpoint unavailable so all customer orders
-- continue through the authoritative multi-item validation and pricing path.
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from public;
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from anon;
revoke all on function public.submit_product_order(uuid, uuid, integer, text) from authenticated;

commit;
