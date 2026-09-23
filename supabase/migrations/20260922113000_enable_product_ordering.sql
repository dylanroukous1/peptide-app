-- Orders are placed against the product catalog. A batch remains an optional
  -- legacy/fulfilment reference so existing batch-linked orders stay intact.

  alter table public.orders
    add column if not exists peptide_id uuid references public.peptides(id) on delete restrict;

  update public.orders o
  set peptide_id = b.peptide_id
  from public.batches b
  where o.batch_id = b.id
    and o.peptide_id is null;

  do $$
  begin
    if exists (select 1 from public.orders where peptide_id is null) then
      raise exception 'Cannot require orders.peptide_id: an existing order has no resolvable peptide';
    end if;
  end
  $$;

  alter table public.orders
    alter column peptide_id set not null,
    alter column batch_id drop not null;

  create index if not exists idx_orders_peptide_id on public.orders(peptide_id);

  -- Keep product names visible in customer order history even if an administrator
  -- later deactivates the catalog entry. Other inactive products remain hidden.
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
      from public.orders o
      where o.peptide_id = peptides.id
        and o.user_id = auth.uid()
    )
  );

  -- A signed-in customer may no longer insert directly into orders. This keeps
  -- company identity and all price snapshots under database control.
  drop policy if exists "users insert own orders" on public.orders;

  create or replace function public.submit_product_order(
    p_peptide_id uuid,
    p_address_id uuid,
    p_requested_quantity integer,
    p_user_notes text default null
  )
  returns table (
    order_id uuid,
    order_number text,
    unit_price numeric(12,2),
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
    v_unit_price numeric(12,2);
    v_order public.orders%rowtype;
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

    if p_requested_quantity is null or p_requested_quantity <= 0 then
      raise exception 'Quantity must be a positive integer' using errcode = '22023';
    end if;

    select p.default_unit_price
    into v_unit_price
    from public.peptides p
    where p.id = p_peptide_id
      and p.is_active = true;

    if v_unit_price is null then
      raise exception 'The selected peptide is not active' using errcode = '22023';
    end if;

    if v_unit_price * p_requested_quantity > 999999999999.99 then
      raise exception 'Order total exceeds the supported limit' using errcode = '22003';
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

    insert into public.orders (
      order_number,
      company_id,
      user_id,
      peptide_id,
      batch_id,
      address_id,
      requested_quantity,
      unit_price_at_submission,
      total_price,
      status,
      user_notes
    )
    values (
      'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      v_company_id,
      v_user_id,
      p_peptide_id,
      null,
      p_address_id,
      p_requested_quantity,
      v_unit_price,
      v_unit_price * p_requested_quantity,
      'SUBMITTED',
      nullif(btrim(p_user_notes), '')
    )
    returning * into v_order;

    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      after_json
    )
    values (
      v_user_id,
      'ORDER_SUBMITTED',
      'order',
      v_order.id::text,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'peptide_id', v_order.peptide_id,
        'company_id', v_order.company_id,
        'requested_quantity', v_order.requested_quantity,
        'unit_price_at_submission', v_order.unit_price_at_submission,
        'total_price', v_order.total_price,
        'status', v_order.status
      )
    );

    return query
    select
      v_order.id,
      v_order.order_number,
      v_order.unit_price_at_submission,
      v_order.total_price,
      v_order.status,
      v_order.submitted_at;
  end;
  $$;

  revoke all on function public.submit_product_order(uuid, uuid, integer, text) from public;
  revoke all on function public.submit_product_order(uuid, uuid, integer, text) from anon;
  grant execute on function public.submit_product_order(uuid, uuid, integer, text) to authenticated;

  -- Status processing is also database-authoritative. It supports both new
  -- product orders (batch_id is null) and historical batch-linked orders without
  -- rewriting or deleting their legacy references.
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

    select *
    into v_before
    from public.orders
    where id = p_order_id
    for update;

    if not found then
      raise exception 'Order not found' using errcode = 'P0002';
    end if;

    if p_new_status = v_before.status then
      return;
    end if;

    if not (
      (v_before.status = 'SUBMITTED' and p_new_status in ('UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'EXPIRED'))
      or (v_before.status = 'UNDER_REVIEW' and p_new_status in ('APPROVED', 'CANCELLED', 'EXPIRED'))
      or (v_before.status = 'APPROVED' and p_new_status in ('IN_PRODUCTION', 'CANCELLED'))
      or (v_before.status = 'IN_PRODUCTION' and p_new_status in ('FULFILLED', 'CANCELLED'))
    ) then
      raise exception 'Invalid order status transition from % to %', v_before.status, p_new_status
        using errcode = '22023';
    end if;

    update public.orders
    set
      status = p_new_status,
      reviewed_at = case
        when p_new_status in ('UNDER_REVIEW', 'APPROVED') then coalesce(reviewed_at, now())
        else reviewed_at
      end,
      approved_at = case when p_new_status = 'APPROVED' then now() else approved_at end,
      approved_quantity = case
        when p_new_status = 'APPROVED' then coalesce(approved_quantity, requested_quantity)
        else approved_quantity
      end,
      unit_price_final = case
        when p_new_status = 'APPROVED' then coalesce(unit_price_final, unit_price_at_submission)
        else unit_price_final
      end,
      fulfilled_at = case when p_new_status = 'FULFILLED' then now() else fulfilled_at end,
      cancelled_at = case
        when p_new_status in ('CANCELLED', 'EXPIRED') then now()
        else cancelled_at
      end
    where id = p_order_id
    returning * into v_after;

    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      before_json,
      after_json
    )
    values (
      v_admin_id,
      'ORDER_STATUS_UPDATED',
      'order',
      v_after.id::text,
      jsonb_build_object('status', v_before.status),
      jsonb_build_object('status', v_after.status)
    );
  end;
  $$;

  revoke all on function public.admin_update_order_status(uuid, public.order_status) from public;
  revoke all on function public.admin_update_order_status(uuid, public.order_status) from anon;
  grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

  comment on column public.orders.peptide_id is
    'Ordered product. Backfilled from legacy batches and required for all orders.';

  comment on column public.orders.batch_id is
    'Optional legacy or fulfilment reference. New catalog orders do not require a batch.';
`