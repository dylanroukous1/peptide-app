begin;

create or replace function public.admin_delete_access_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request public.account_requests%rowtype;
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

  select * into v_request
  from public.account_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_json, after_json
  ) values (
    v_admin_id,
    'ACCESS_REQUEST_DELETED',
    'access_request',
    v_request.id::text,
    jsonb_build_object(
      'email', v_request.email,
      'first_name', v_request.first_name,
      'last_name', v_request.last_name,
      'company_name', v_request.company_name,
      'status', v_request.status,
      'created_at', v_request.created_at
    ),
    jsonb_build_object(
      'email', v_request.email,
      'deleted_at', clock_timestamp()
    )
  );

  delete from public.account_requests where id = v_request.id;

  return jsonb_build_object(
    'id', v_request.id,
    'email', v_request.email,
    'deleted', true
  );
end;
$$;

revoke delete on table public.account_requests from authenticated;
revoke all on function public.admin_delete_access_request(uuid) from public;
revoke all on function public.admin_delete_access_request(uuid) from anon;
grant execute on function public.admin_delete_access_request(uuid) to authenticated;

commit;
