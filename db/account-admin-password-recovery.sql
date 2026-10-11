begin;

-- Delegated account management is stored privately, never in user metadata.
create table private.account_admins (
 user_id uuid primary key references public.profiles(id),
 granted_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table private.account_admins enable row level security;
create index account_admins_granted_by_idx on private.account_admins(granted_by);
revoke all on private.account_admins from public,anon,authenticated;
insert into private.account_admins(user_id)
 select primary_admin_user_id from private.app_ownership;

create table private.password_resets (
 user_id uuid primary key references public.profiles(id),
 request_id uuid not null default gen_random_uuid(),
 actor_id uuid not null references public.profiles(id),
 reset_at timestamptz not null,
 expires_at timestamptz not null,
 required boolean not null default true,
 status text not null check(status in ('pending','ready')),
 password_fingerprint text
);
alter table private.password_resets enable row level security;
create index password_resets_actor_idx on private.password_resets(actor_id);
revoke all on private.password_resets from public,anon,authenticated;

create function private.password_session_valid() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(
  select 1 from private.password_resets r where r.user_id=auth.uid() and (
   (r.required and (r.status<>'ready' or r.expires_at<=now())) or
   not exists(select 1 from auth.sessions s where s.user_id=auth.uid()
    and s.id::text=auth.jwt()->>'session_id' and s.created_at>=r.reset_at)
  )
 );
$$;

create or replace function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
 select case when p.role='LIDER' then 'OPERADOR'::public.app_role else p.role end
 from public.profiles p where p.id=auth.uid() and p.active and p.deleted_at is null
 and private.password_session_valid()
 and not exists(select 1 from private.password_resets r where r.user_id=p.id and r.required);
$$;

create function private.is_account_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='ADMIN',false)
 and exists(select 1 from private.account_admins where user_id=auth.uid());
$$;

create or replace function private.user_admin_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare permitted boolean;
begin
 if private.current_role() is distinct from 'ADMIN'::public.app_role then
  raise exception 'Administrator required' using errcode='42501';
 end if;
 permitted:=private.is_account_admin();
 return jsonb_build_object('can_delete',permitted,'can_reset_password',permitted,
  'protected_user_ids',case when permitted then (select jsonb_agg(user_id) from private.account_admins) else '[]'::jsonb end);
end $$;

create function private.grant_account_admin(target_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_account_admin() or not exists(select 1 from private.app_ownership where primary_admin_user_id=auth.uid()) then
  raise exception 'Account owner required' using errcode='42501';
 end if;
 perform 1 from public.profiles where id=target_user_id and role='ADMIN' and active and deleted_at is null for update;
 if not found then raise exception 'Active administrator required' using errcode='22023'; end if;
 insert into private.account_admins(user_id,granted_by) values(target_user_id,auth.uid()) on conflict do nothing;
 if found then
  insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
   values(auth.uid(),'ACCOUNT_ADMIN_GRANTED','profiles',target_user_id::text,'{"account_management":true}');
 end if;
 return true;
end $$;
create function public.grant_account_admin(target_user_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.grant_account_admin(target_user_id); $$;

create or replace function private.protect_user_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='app_ownership' then raise exception 'Account ownership is immutable' using errcode='42501'; end if;
 if TG_OP='DELETE' then raise exception 'User history must be preserved' using errcode='42501'; end if;
 if exists(select 1 from private.account_admins where user_id=new.id) and
    (new.role<>'ADMIN' or not new.active or new.deleted_at is not null) then
  raise exception 'Account is protected' using errcode='42501';
 end if;
 if TG_OP='INSERT' and new.deleted_at is not null then raise exception 'Invalid deleted profile' using errcode='42501'; end if;
 if TG_OP='UPDATE' then
  if old.deleted_at is not null then raise exception 'Deleted access cannot be restored or edited' using errcode='42501'; end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by_user_id is distinct from old.deleted_by_user_id then
   if not private.is_account_admin() or new.deleted_at is null or new.deleted_by_user_id is distinct from auth.uid() or new.active then
    raise exception 'Account administrator required' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end $$;

create or replace function private.delete_user_access(target_user_id uuid, confirmation_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 if not private.is_account_admin() then raise exception 'Account administrator required' using errcode='42501'; end if;
 select * into target from public.profiles where id=target_user_id for update;
 if not found then raise exception 'User not found' using errcode='P0002'; end if;
 if exists(select 1 from private.account_admins where user_id=target_user_id) then raise exception 'Account is protected' using errcode='42501'; end if;
 if confirmation_email is null or lower(btrim(confirmation_email))<>lower(btrim(target.email)) then
  raise exception 'Confirmation email does not match' using errcode='22023';
 end if;
 if target.deleted_at is not null then return jsonb_build_object('success',true); end if;
 update public.profiles set active=false,deleted_at=clock_timestamp(),deleted_by_user_id=auth.uid() where id=target_user_id;
 insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data)
 values(auth.uid(),'USER_DELETED','profiles',target_user_id::text,to_jsonb(target),
  (select to_jsonb(p) from public.profiles p where p.id=target_user_id));
 return jsonb_build_object('success',true);
end $$;

create function private.password_change_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return jsonb_build_object('session_valid',private.password_session_valid(),
  'required',exists(select 1 from private.password_resets where user_id=auth.uid() and required));
end $$;
create function public.password_change_state() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.password_change_state(); $$;

-- Begin first: an interrupted Auth update leaves access blocked, never unlocked.
create function private.begin_password_reset(target_user_id uuid, confirmation_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.profiles; reset_id uuid;
begin
 if not private.is_account_admin() or target_user_id=auth.uid() then
  raise exception 'Account administrator required' using errcode='42501';
 end if;
 select * into target from public.profiles where id=target_user_id for update;
 if not found or not target.active or target.deleted_at is not null then
  raise exception 'Active user required' using errcode='22023';
 end if;
 if confirmation_email is null or lower(btrim(confirmation_email))<>lower(btrim(target.email)) then
  raise exception 'Confirmation email does not match' using errcode='22023';
 end if;
 if exists(select 1 from private.password_resets where user_id=target_user_id and reset_at>now()-interval '5 minutes') then
  raise exception 'Wait five minutes before retrying' using errcode='55000';
 end if;
 insert into private.password_resets(user_id,actor_id,reset_at,expires_at,status)
 values(target_user_id,auth.uid(),clock_timestamp(),clock_timestamp()+interval '24 hours','pending')
 on conflict(user_id) do update set request_id=gen_random_uuid(),actor_id=excluded.actor_id,
 reset_at=excluded.reset_at,expires_at=excluded.expires_at,required=true,status='pending',password_fingerprint=null
 returning request_id into reset_id;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
 values(auth.uid(),'PASSWORD_RESET_REQUESTED','profiles',target_user_id::text,'{"expires_in_hours":24}');
 return reset_id;
end $$;
create function public.begin_password_reset(target_user_id uuid, confirmation_email text) returns uuid
language sql security invoker set search_path='' as $$ select private.begin_password_reset(target_user_id,confirmation_email); $$;

-- Only the server may finalize an Auth change; a browser cannot mark an old
-- password as the new temporary password. No password or Auth hash is returned.
create function private.finish_password_reset(target_user_id uuid, reset_request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare reset private.password_resets; fingerprint text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
    and coalesce(auth.jwt()->>'role','')<>'service_role' then
  raise exception 'Server required' using errcode='42501';
 end if;
 select * into reset from private.password_resets where user_id=target_user_id for update;
 if not found or reset.request_id<>reset_request_id or reset.status<>'pending' or reset.expires_at<=now() then
  raise exception 'Reset request is no longer valid' using errcode='22023';
 end if;
 select md5(encrypted_password) into fingerprint from auth.users where id=target_user_id;
 if fingerprint is null then raise exception 'Password update required'; end if;
 update private.password_resets set status='ready',password_fingerprint=fingerprint,
  reset_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where user_id=target_user_id;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
 values(reset.actor_id,'PASSWORD_RESET_COMPLETED','profiles',target_user_id::text,'{"requires_password_change":true}');
 return true;
end $$;
create function public.finish_password_reset(target_user_id uuid, reset_request_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.finish_password_reset(target_user_id,reset_request_id); $$;

create function private.complete_password_change() returns boolean
language plpgsql security definer set search_path='' as $$
declare reset private.password_resets; fingerprint text;
begin
 if not private.password_session_valid() or not exists(select 1 from public.profiles where id=auth.uid() and active and deleted_at is null) then
  raise exception 'Valid session required' using errcode='42501';
 end if;
 select * into reset from private.password_resets where user_id=auth.uid() for update;
 if not found or not reset.required then return true; end if;
 select md5(encrypted_password) into fingerprint from auth.users where id=auth.uid();
 if reset.status<>'ready' or fingerprint is null or fingerprint=reset.password_fingerprint then
  raise exception 'Change the temporary password first' using errcode='42501';
 end if;
 update private.password_resets set required=false,password_fingerprint=null where user_id=auth.uid();
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
 values(auth.uid(),'PASSWORD_CHANGED','profiles',auth.uid()::text,'{"requires_password_change":false}');
 return true;
end $$;
create function public.complete_password_change() returns boolean
language sql security invoker set search_path='' as $$ select private.complete_password_change(); $$;

revoke all on function private.password_session_valid(),private.is_account_admin(),
 private.grant_account_admin(uuid),public.grant_account_admin(uuid),
 private.password_change_state(),public.password_change_state(),
 private.begin_password_reset(uuid,text),public.begin_password_reset(uuid,text),
 private.finish_password_reset(uuid,uuid),public.finish_password_reset(uuid,uuid),
 private.complete_password_change(),public.complete_password_change() from public,anon,authenticated;
grant execute on function private.grant_account_admin(uuid),public.grant_account_admin(uuid),
 private.password_change_state(),public.password_change_state(),
 private.begin_password_reset(uuid,text),public.begin_password_reset(uuid,text),
 private.complete_password_change(),public.complete_password_change() to authenticated;
grant usage on schema private to service_role;
grant execute on function private.finish_password_reset(uuid,uuid),public.finish_password_reset(uuid,uuid) to service_role;
commit;
