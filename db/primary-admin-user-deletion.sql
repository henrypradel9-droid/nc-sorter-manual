begin;

-- The first existing profile is the permanent primary administrator.
-- No client can change or claim this identity through role/user metadata.
create table private.app_ownership (
 singleton boolean primary key default true check(singleton),
 primary_admin_user_id uuid not null unique references public.profiles(id)
);
alter table private.app_ownership enable row level security;
revoke all on private.app_ownership from public, anon, authenticated;
insert into private.app_ownership(primary_admin_user_id)
 select id from public.profiles order by created_at,id limit 1;
do $$ begin
 if not exists(select 1 from private.app_ownership o join public.profiles p on p.id=o.primary_admin_user_id where p.role='ADMIN' and p.active) then
  raise exception 'An active first administrator is required';
 end if;
end $$;

alter table public.profiles add column deleted_at timestamptz,
 add column deleted_by_user_id uuid references public.profiles(id),
 add constraint profiles_deleted_consistency check (
  (deleted_at is null and deleted_by_user_id is null) or
  (deleted_at is not null and deleted_by_user_id is not null and not active)
 );
create index profiles_deleted_by_idx on public.profiles(deleted_by_user_id) where deleted_by_user_id is not null;

create or replace function private.current_role() returns public.app_role
language sql stable security definer set search_path='' as $$
 select role from public.profiles where auth.uid() is not null and id=auth.uid() and active and deleted_at is null;
$$;

create function private.user_admin_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare primary_id uuid;
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role then
  raise exception 'Administrator required' using errcode='42501';
 end if;
 select primary_admin_user_id into primary_id from private.app_ownership where singleton;
 return jsonb_build_object('primary_admin_id',primary_id,'can_delete',auth.uid()=primary_id);
end $$;
create function public.user_admin_capabilities() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.user_admin_capabilities(); $$;

create function private.protect_user_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare primary_id uuid;
begin
 if TG_TABLE_NAME='app_ownership' then raise exception 'Primary administrator identity is immutable' using errcode='42501'; end if;
 if TG_OP='DELETE' then raise exception 'User history must be preserved' using errcode='42501'; end if;
 select primary_admin_user_id into primary_id from private.app_ownership where singleton;
 if new.id=primary_id and (new.role<>'ADMIN' or not new.active or new.deleted_at is not null) then
  raise exception 'Primary administrator is protected' using errcode='42501';
 end if;
 if TG_OP='INSERT' and new.deleted_at is not null then raise exception 'Invalid deleted profile' using errcode='42501'; end if;
 if TG_OP='UPDATE' then
  if old.deleted_at is not null then raise exception 'Deleted access cannot be restored or edited' using errcode='42501'; end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by_user_id is distinct from old.deleted_by_user_id then
   if auth.uid() is null or auth.uid()<>primary_id or private.current_role() is distinct from 'ADMIN'::public.app_role
      or new.deleted_at is null or new.deleted_by_user_id is distinct from auth.uid() or new.active then
    raise exception 'Primary administrator required' using errcode='42501';
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger protect_primary_identity before update or delete on private.app_ownership for each row execute function private.protect_user_identity();
create trigger protect_profile_identity before insert or update or delete on public.profiles for each row execute function private.protect_user_identity();

-- Logical deletion: permanently remove access and hide the account from the user
-- list while keeping referenced profiles, occurrences and audits intact.
create function private.delete_user_access(target_user_id uuid, confirmation_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare primary_id uuid; target public.profiles;
begin
 select primary_admin_user_id into primary_id from private.app_ownership where singleton;
 if auth.uid() is null or auth.uid() is distinct from primary_id or private.current_role() is distinct from 'ADMIN'::public.app_role then
  raise exception 'Primary administrator required' using errcode='42501';
 end if;
 if target_user_id=primary_id then raise exception 'Primary administrator cannot be deleted' using errcode='42501'; end if;
 select * into target from public.profiles where id=target_user_id for update;
 if not found then raise exception 'User not found' using errcode='P0002'; end if;
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
create function public.delete_user_access(target_user_id uuid, confirmation_email text) returns jsonb
language sql security invoker set search_path='' as $$ select private.delete_user_access(target_user_id,confirmation_email); $$;

revoke all on function private.protect_user_identity() from public,anon,authenticated;
revoke all on function private.user_admin_capabilities(),public.user_admin_capabilities(),private.delete_user_access(uuid,text),public.delete_user_access(uuid,text) from public,anon,authenticated;
grant execute on function private.user_admin_capabilities(),public.user_admin_capabilities(),private.delete_user_access(uuid,text),public.delete_user_access(uuid,text) to authenticated;
commit;
