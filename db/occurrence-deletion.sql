begin;

-- Deletion stays explicit and auditable. ADMIN may delete any occurrence;
-- OPERADOR may delete only a record they registered themselves.
create function private.audit_occurrence_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data)
 values(auth.uid(),'OCORRENCIA_EXCLUIDA','occurrences',old.id::text,to_jsonb(old),null);
 return old;
end $$;
drop trigger audit_delete on public.occurrences;
create trigger audit_occurrence_deletion before delete on public.occurrences
for each row execute function private.audit_occurrence_deletion();

create function private.delete_occurrence(target_occurrence_id uuid, expected_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare target public.occurrences;
begin
 if auth.uid() is null or private.current_role() is null then
  raise exception 'Active operational profile required' using errcode='42501';
 end if;
 select * into target from public.occurrences where id=target_occurrence_id for update;
 if not found then raise exception 'Occurrence not found' using errcode='P0002'; end if;
 if expected_version is null or expected_version<>target.version then
  raise exception 'Occurrence was changed' using errcode='40001';
 end if;
 if private.current_role()<>'ADMIN' and target.registered_by_user_id<>auth.uid() then
  raise exception 'Only the author or an administrator can delete this occurrence' using errcode='42501';
 end if;
 -- This lock matches occurrence writes and configuration recalculation.
 perform pg_advisory_xact_lock(782314);
 delete from public.occurrences where id=target_occurrence_id;
 perform private.refresh_user_alerts(target.occurrence_user_normalized,target.occurred_at);
 return true;
end $$;

create function public.delete_occurrence(target_occurrence_id uuid, expected_version integer) returns boolean
language sql security invoker set search_path='' as $$
 select private.delete_occurrence(target_occurrence_id,expected_version);
$$;

revoke all on function private.audit_occurrence_deletion(),private.delete_occurrence(uuid,integer),public.delete_occurrence(uuid,integer) from public,anon,authenticated;
grant execute on function private.delete_occurrence(uuid,integer),public.delete_occurrence(uuid,integer) to authenticated;
commit;
