begin;

create or replace function public.admin_delete_peptide(p_peptide_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_peptide public.peptides%rowtype;
  v_order_count integer;
  v_batch_count integer;
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

  select * into v_peptide
  from public.peptides
  where id = p_peptide_id
  for update;

  if not found then
    raise exception 'Peptide not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_order_count
  from public.orders o
  where o.peptide_id = p_peptide_id
     or exists (
       select 1
       from public.order_items oi
       where oi.order_id = o.id
         and oi.peptide_id = p_peptide_id
     )
     or exists (
       select 1
       from public.batches b
       where b.id = o.batch_id
         and b.peptide_id = p_peptide_id
     );

  select count(*)::integer into v_batch_count
  from public.batches
  where peptide_id = p_peptide_id;

  select count(*)::integer into v_wishlist_count
  from public.wishlist_requests
  where peptide_id = p_peptide_id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    v_admin_id,
    'PEPTIDE_DELETED',
    'peptide',
    v_peptide.id::text,
    jsonb_build_object(
      'name', v_peptide.name,
      'default_unit_price', v_peptide.default_unit_price,
      'is_active', v_peptide.is_active,
      'order_count', v_order_count,
      'batch_count', v_batch_count,
      'wishlist_count', v_wishlist_count
    ),
    jsonb_build_object(
      'name', v_peptide.name,
      'deleted_at', clock_timestamp()
    )
  );

  -- An order total and its price snapshots describe the complete order. If this
  -- peptide appears in any line, legacy header, or linked batch, delete the whole
  -- order rather than retaining a financially inconsistent partial order.
  delete from public.orders o
  where o.peptide_id = p_peptide_id
     or exists (
       select 1
       from public.order_items oi
       where oi.order_id = o.id
         and oi.peptide_id = p_peptide_id
     )
     or exists (
       select 1
       from public.batches b
       where b.id = o.batch_id
         and b.peptide_id = p_peptide_id
     );

  delete from public.wishlist_requests where peptide_id = p_peptide_id;
  delete from public.batches where peptide_id = p_peptide_id;
  delete from public.peptides where id = p_peptide_id;

  return jsonb_build_object(
    'id', v_peptide.id,
    'name', v_peptide.name,
    'deleted', true,
    'deleted_orders', v_order_count,
    'deleted_batches', v_batch_count,
    'deleted_wishlist_requests', v_wishlist_count
  );
end;
$$;

revoke delete on table public.peptides from authenticated;
revoke all on function public.admin_delete_peptide(uuid) from public;
revoke all on function public.admin_delete_peptide(uuid) from anon;
grant execute on function public.admin_delete_peptide(uuid) to authenticated;

commit;
