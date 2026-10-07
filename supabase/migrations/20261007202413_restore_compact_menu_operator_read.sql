begin;
-- Restore the operator's original own-occurrence reading; follow-up notes remain ADMIN-only.
alter policy occurrence_read on public.occurrences using((select private.current_role())='ADMIN' or ((select private.current_role())='OPERADOR' and registered_by_user_id=(select auth.uid())));
alter policy alerts_read on public.alerts using((select private.current_role()) in ('ADMIN','OPERADOR'));
alter policy followups_read on public.alert_follow_ups using((select private.current_role())='ADMIN');
alter policy followups_add on public.alert_follow_ups with check((select private.current_role())='ADMIN' and responsible_user_id=(select auth.uid()));
create or replace function public.filtered_occurrences(filters jsonb default '{}') returns setof public.occurrences language sql stable security invoker set search_path='' as $$
 select o.* from public.occurrences o where (select private.current_role()) in ('ADMIN','OPERADOR') and
 (nullif(filters->>'from_at','') is null or o.occurred_at>=(filters->>'from_at')::timestamptz) and
 (nullif(filters->>'to_at','') is null or o.occurred_at<(filters->>'to_at')::timestamptz) and
 (nullif(filters->>'from','') is null or o.occurred_at>=(filters->>'from')::date::timestamp at time zone 'America/Sao_Paulo') and
 (nullif(filters->>'to','') is null or o.occurred_at<((filters->>'to')::date+1)::timestamp at time zone 'America/Sao_Paulo') and
 (nullif(filters->>'q','') is null or o.package_id ilike '%'||(filters->>'q')||'%' or o.hu ilike '%'||(filters->>'q')||'%' or o.occurrence_user_normalized ilike '%'||public.normalize_user(filters->>'q')||'%' or o.canalizacao_normalized ilike '%'||public.normalize_user(filters->>'q')||'%') and
 (nullif(filters->>'occurrence_user','') is null or o.occurrence_user_normalized=public.normalize_user(filters->>'occurrence_user')) and
 (nullif(filters->>'status','') is null or o.status=(filters->>'status')::public.occurrence_status) and
 (nullif(filters->>'error_type_id','') is null or o.error_type_id=(filters->>'error_type_id')::uuid) and
 (nullif(filters->>'shift_id','') is null or o.shift_id=(filters->>'shift_id')::uuid) and
 (nullif(filters->>'canalizacao','') is null or o.canalizacao_normalized=public.normalize_user(filters->>'canalizacao')) and
 (nullif(filters->>'canalizacao_id','') is null or o.canalizacao_id=(filters->>'canalizacao_id')::uuid) and
 (nullif(filters->>'registered_by_user_id','') is null or o.registered_by_user_id=(filters->>'registered_by_user_id')::uuid);
$$;

commit;
