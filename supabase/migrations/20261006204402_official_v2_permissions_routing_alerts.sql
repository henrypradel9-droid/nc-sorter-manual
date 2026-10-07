begin;
-- Expand first. No catalog, legacy FK, profile, or enum is dropped.
alter table public.occurrences add column canalizacao text;
alter table public.occurrences alter column canalizacao_id drop not null;
alter table public.occurrences add column canalizacao_normalized text generated always as (public.normalize_user(canalizacao)) stored;
alter table public.occurrences add constraint occurrences_canalizacao_length check(canalizacao is null or (canalizacao=btrim(canalizacao) and length(canalizacao) between 1 and 150));
create index occurrences_canalizacao_text_date on public.occurrences(canalizacao_normalized,occurred_at desc);
grant insert(canalizacao),update(canalizacao) on public.occurrences to authenticated;
-- A preserved legacy LIDER has registration-only permissions until an ADMIN promotes it.
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select case when role='LIDER' then 'OPERADOR'::public.app_role else role end from public.profiles where id=auth.uid() and active and deleted_at is null;
$$;
alter policy profile_read on public.profiles using(id=(select auth.uid()) or (select private.current_role())='ADMIN');
alter policy occurrence_read on public.occurrences using((select private.current_role())='ADMIN');
alter policy occurrence_add on public.occurrences with check((select private.current_role()) in ('ADMIN','OPERADOR') and registered_by_user_id=(select auth.uid()));
alter policy occurrence_edit on public.occurrences using((select private.current_role())='ADMIN') with check((select private.current_role())='ADMIN');
alter policy alerts_read on public.alerts using((select private.current_role())='ADMIN');
alter policy alerts_edit on public.alerts using((select private.current_role())='ADMIN') with check((select private.current_role())='ADMIN');
alter policy followups_read on public.alert_follow_ups using((select private.current_role())='ADMIN');
alter policy followups_add on public.alert_follow_ups with check((select private.current_role())='ADMIN' and responsible_user_id=(select auth.uid()));
alter policy audit_read on public.audit_logs using((select private.current_role())='ADMIN');
alter policy settings_read on public.system_settings using((select private.current_role())='ADMIN');
do $$ declare t text; begin foreach t in array array['error_types','shifts','canalizacoes'] loop
 execute format('alter policy catalog_add on public.%I with check ((select private.current_role())=''ADMIN'')',t);
 execute format('alter policy catalog_edit on public.%I using ((select private.current_role())=''ADMIN'') with check ((select private.current_role())=''ADMIN'')',t);
 end loop; end $$;
alter policy catalog_read on public.error_types using((select private.current_role())='ADMIN' or ((select private.current_role())='OPERADOR' and active));
alter policy catalog_read on public.shifts using((select private.current_role())='ADMIN' or ((select private.current_role())='OPERADOR' and active));
alter policy catalog_read on public.canalizacoes using((select private.current_role())='ADMIN');
create or replace function private.before_change() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp();
 if TG_TABLE_NAME='occurrences' then
  -- One lock shared with configuration edits: deterministic counts under concurrent writes.
  perform pg_advisory_xact_lock(782314);
  new.occurrence_user=btrim(new.occurrence_user);
  if TG_OP='INSERT' then new.registered_by_user_id=auth.uid(); new.created_at=now(); new.version=1;
  else new.version=old.version+1; end if;
  if (TG_OP='INSERT' or new.error_type_id<>old.error_type_id) and not exists(select 1 from public.error_types where id=new.error_type_id and active) then raise exception 'Inactive error type'; end if;
  if (TG_OP='INSERT' or new.shift_id<>old.shift_id) and not exists(select 1 from public.shifts where id=new.shift_id and active) then raise exception 'Inactive shift'; end if;
  -- Legacy clients may still send an ID while the frontend rollout finishes.
  if new.canalizacao is null or (TG_OP='UPDATE' and new.canalizacao_id is distinct from old.canalizacao_id and new.canalizacao is not distinct from old.canalizacao) then
   select btrim(name) into new.canalizacao from public.canalizacoes where id=new.canalizacao_id;
  end if;
  new.canalizacao=btrim(new.canalizacao);
  if new.canalizacao is null or length(new.canalizacao) not between 1 and 150 then raise exception 'Routing text required'; end if;
 elsif TG_TABLE_NAME='system_settings' then perform pg_advisory_xact_lock(782314);
 elsif TG_TABLE_NAME='profiles' then
  if new.role='LIDER' and (TG_OP='INSERT' or new.role is distinct from old.role) then raise exception 'Legacy role cannot be assigned'; end if;
  if new.id=auth.uid() and (not new.active or new.role<>'ADMIN') then raise exception 'Cannot remove your own administrative access'; end if;
 end if;
 return new;
end $$;
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare prev jsonb; next_value jsonb; action_name text;
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if TG_OP in ('UPDATE','DELETE') then prev=to_jsonb(old); end if;
 if TG_OP='DELETE' then
  insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data) values(auth.uid(),TG_TABLE_NAME||'_DELETE',TG_TABLE_NAME,old.id::text,prev,null);
  return old;
 end if;
 next_value=to_jsonb(new);
 action_name=TG_TABLE_NAME||'_'||TG_OP;
 if TG_TABLE_NAME='occurrences' then
  action_name=case when TG_OP='INSERT' then 'OCORRENCIA_CRIADA' when old.status is distinct from new.status then 'STATUS_ALTERADO' else 'OCORRENCIA_EDITADA' end;
 end if;
 insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data) values(auth.uid(),action_name,TG_TABLE_NAME,next_value->>'id',prev,next_value);
 return new;
end $$;
create trigger audit_delete before delete on public.occurrences for each row execute function private.audit_change();
create trigger audit_delete before delete on public.alerts for each row execute function private.audit_change();
create trigger audit_delete before delete on public.alert_follow_ups for each row execute function private.audit_change();
create or replace function private.refresh_user_alerts(user_key text, only_instant timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare cfg public.system_settings; bucket record; start_at timestamptz; end_at timestamptz; top_error text; shift_names text[]; target_start timestamptz; target_end timestamptz;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'Authenticated actor required'; end if;
 select * into cfg from public.system_settings where id;
 if only_instant is not null then
  target_start=((((only_instant at time zone cfg.timezone)-make_interval(hours=>cfg.operational_start_hour))::date)+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  target_end=target_start+interval '1 day';
 end if;
 -- Preserve follow-up history when an edit makes an existing alert no longer applicable.
 update public.alerts set active=false,occurrence_count=0,updated_at=clock_timestamp() where status<>'ACOMPANHAMENTO_REALIZADO' and occurrence_user=user_key and (only_instant is null or (period_start=target_start and period_end=target_end));
 for bucket in select ((occurred_at at time zone cfg.timezone)-make_interval(hours=>cfg.operational_start_hour))::date as day, count(*) as n,max(occurred_at) as last_at
  from public.occurrences where occurrence_user_normalized=user_key and (only_instant is null or (occurred_at>=target_start and occurred_at<target_end)) group by 1 loop
  start_at=(bucket.day+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  end_at=(bucket.day+1+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  select e.name into top_error from public.occurrences o join public.error_types e on e.id=o.error_type_id where o.occurrence_user_normalized=user_key and occurred_at>=start_at and occurred_at<end_at group by e.id,e.name order by count(*) desc,e.name limit 1;
  select array_agg(distinct s.name order by s.name) into shift_names from public.occurrences o join public.shifts s on s.id=o.shift_id where o.occurrence_user_normalized=user_key and occurred_at>=start_at and occurred_at<end_at;
  if bucket.n>cfg.recurrence_limit or exists(select 1 from public.alerts where occurrence_user=user_key and period_start=start_at and period_end=end_at) then
   insert into public.alerts(occurrence_user,period_start,period_end,occurrence_count,most_frequent_error,last_occurrence,shifts,active)
    values(user_key,start_at,end_at,bucket.n,top_error,bucket.last_at,shift_names,bucket.n>cfg.recurrence_limit)
   on conflict(occurrence_user,period_start,period_end) do update set occurrence_count=excluded.occurrence_count,most_frequent_error=excluded.most_frequent_error,last_occurrence=excluded.last_occurrence,shifts=excluded.shifts,active=excluded.active,updated_at=clock_timestamp() where public.alerts.status<>'ACOMPANHAMENTO_REALIZADO';
  end if;
 end loop;
end $$;
create or replace function private.after_followup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role then raise exception 'Leader required'; end if;
 update public.alerts set status='ACOMPANHAMENTO_REALIZADO',active=false,updated_at=clock_timestamp() where id=new.alert_id;
 return new;
end $$;
create or replace function public.filtered_occurrences(filters jsonb default '{}') returns setof public.occurrences language sql stable security invoker set search_path='' as $$
 select o.* from public.occurrences o where (select private.current_role())='ADMIN' and
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
create or replace function public.dashboard(filters jsonb default '{}') returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as materialized(select * from public.filtered_occurrences(filters)),
 errors as(select e.name as name,o.error_type_id as id,count(*) as total from rows o join public.error_types e on e.id=o.error_type_id group by e.name,o.error_type_id order by total desc),
 days as(select (occurred_at at time zone 'America/Sao_Paulo')::date as name,count(*) as total from rows group by 1 order by 1),
 shifts as(select s.name,o.shift_id as id,count(*) as total from rows o join public.shifts s on s.id=o.shift_id group by s.name,o.shift_id),
 routing as(select o.canalizacao_normalized id,min(o.canalizacao) name,count(*) total from rows o group by o.canalizacao_normalized order by total desc,name),
 users as(select occurrence_user_normalized as name,count(*) as total from rows group by 1 order by total desc limit 10)
 select jsonb_build_object('total',(select count(*) from rows),'pending',(select count(*) from rows where status='PENDENTE'),'progress',(select count(*) from rows where status='EM_ANDAMENTO'),'resolved',(select count(*) from rows where status='RESOLVIDO'),
 'errors',coalesce((select jsonb_agg(errors) from errors),'[]'::jsonb),'days',coalesce((select jsonb_agg(days) from days),'[]'::jsonb),'shifts',coalesce((select jsonb_agg(shifts) from shifts),'[]'::jsonb),'routing',coalesce((select jsonb_agg(routing) from routing),'[]'::jsonb),'users',coalesce((select jsonb_agg(users) from users),'[]'::jsonb),
 'alerts',(select count(distinct a.occurrence_user) from public.alerts a where a.active and a.status in ('NOVO','VISUALIZADO') and exists(select 1 from rows r where r.occurrence_user_normalized=a.occurrence_user and r.occurred_at>=a.period_start and r.occurred_at<a.period_end)));
$$;
create or replace function public.dashboard_v2(filters jsonb default '{}', bucket_by text default 'day') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date; last_day date; n integer; step text; prev_filters jsonb; result jsonb;
begin
 if auth.uid() is null or private.current_role() is null or private.current_role() <>'ADMIN' then raise exception 'Leader required' using errcode='42501'; end if;
 first_day=coalesce(nullif(filters->>'from','')::date,(now() at time zone 'America/Sao_Paulo')::date);
 last_day=coalesce(nullif(filters->>'to','')::date,first_day);
 n=last_day-first_day+1;
 if n<1 or n>3660 then raise exception 'INVALID_DASHBOARD_PERIOD'; end if;
 if bucket_by not in ('day','week','month') then raise exception 'Invalid grouping'; end if;
 step=case when n>730 then 'month' when n>180 and bucket_by='day' then 'week' else bucket_by end;
 filters=(filters-'from_at'-'to_at')||jsonb_build_object('from',first_day,'to',last_day);
 prev_filters=filters||jsonb_build_object('from',first_day-n,'to',first_day-1);
 with rows as materialized(select * from public.filtered_occurrences(filters)),
 previous as materialized(select * from public.filtered_occurrences(prev_filters)),
 buckets as(select generate_series(date_trunc(step,first_day::timestamp),date_trunc(step,last_day::timestamp),('1 '||step)::interval) as bucket),
 grouped as(select date_trunc(step,occurred_at at time zone 'America/Sao_Paulo') as bucket,count(*) total,count(*) filter(where status='PENDENTE') pending,count(*) filter(where status='EM_ANDAMENTO') progress,count(*) filter(where status='RESOLVIDO') resolved from rows group by 1),
 series as(select b.bucket::date as name,coalesce(g.total,0) total,coalesce(g.pending,0) pending,coalesce(g.progress,0) progress,coalesce(g.resolved,0) resolved from buckets b left join grouped g using(bucket) order by b.bucket),
 trend as(select *,case when row_number() over(order by name)>=7 then round(avg(total) over(order by name rows between 6 preceding and current row),2) end as average from series),
 errors as(select e.id,e.name,count(*) total from rows o join public.error_types e on e.id=o.error_type_id group by e.id,e.name order by total desc,e.name),
 shifts as(select s.id,s.name,count(*) total from rows o join public.shifts s on s.id=o.shift_id group by s.id,s.name order by total desc,s.name),
 routing as(select o.canalizacao_normalized id,min(o.canalizacao) name,count(*) total from rows o group by o.canalizacao_normalized order by total desc,name),
 users as(select occurrence_user_normalized as name,count(*) total from rows group by 1 order by total desc,name limit 10),
 heatmap as(select o.canalizacao_normalized id,min(o.canalizacao) name,(extract(hour from o.occurred_at at time zone 'America/Sao_Paulo')::int/2)*2 as hour,count(*) total from rows o group by o.canalizacao_normalized,3 order by name,3),
 latest as(select o.*,jsonb_build_object('name',e.name) error_type,jsonb_build_object('name',s.name) shift,jsonb_build_object('name',p.name) registered_by from rows o join public.error_types e on e.id=o.error_type_id join public.shifts s on s.id=o.shift_id join public.profiles p on p.id=o.registered_by_user_id order by o.created_at desc,o.id desc limit 10)
 select jsonb_build_object(
 'from',first_day,'to',last_day,'grouping',step,
 'total',(select count(*) from rows),'pending',(select count(*) from rows where status='PENDENTE'),'progress',(select count(*) from rows where status='EM_ANDAMENTO'),'resolved',(select count(*) from rows where status='RESOLVIDO'),
 'previous',jsonb_build_object('from',first_day-n,'to',first_day-1,'total',(select count(*) from previous),'pending',(select count(*) from previous where status='PENDENTE'),'progress',(select count(*) from previous where status='EM_ANDAMENTO'),'resolved',(select count(*) from previous where status='RESOLVIDO')),
 'series',coalesce((select jsonb_agg(trend order by name) from trend),'[]'::jsonb),
 'errors',coalesce((select jsonb_agg(errors) from errors),'[]'::jsonb),'shifts',coalesce((select jsonb_agg(shifts) from shifts),'[]'::jsonb),'routing',coalesce((select jsonb_agg(routing) from routing),'[]'::jsonb),'users',coalesce((select jsonb_agg(users) from users),'[]'::jsonb),'heatmap',coalesce((select jsonb_agg(heatmap) from heatmap),'[]'::jsonb),'latest',coalesce((select jsonb_agg(latest) from latest),'[]'::jsonb),
 'alerts',(select count(distinct a.occurrence_user) from public.alerts a where a.active and a.status in ('NOVO','VISUALIZADO') and exists(select 1 from rows r where r.occurrence_user_normalized=a.occurrence_user and r.occurred_at>=a.period_start and r.occurred_at<a.period_end))
 ) into result;
 return result;
end $$;
create or replace function public.export_occurrences(filters jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare payload jsonb; begin
 if private.current_role() <>'ADMIN' or private.current_role() is null then raise exception 'Leader required'; end if;
 select coalesce(jsonb_agg(row),'[]'::jsonb) into payload from (
  select o.*,jsonb_build_object('name',e.name) as error_type,jsonb_build_object('name',s.name) as shift,jsonb_build_object('name',p.name) as registered_by
  from public.filtered_occurrences(filters) o join public.error_types e on e.id=o.error_type_id join public.shifts s on s.id=o.shift_id join public.profiles p on p.id=o.registered_by_user_id
  order by o.occurred_at desc,o.id desc limit 20001
 ) row;
 if jsonb_array_length(payload)>20000 then raise exception 'EXPORT_TOO_LARGE'; end if;
 return payload;
end $$;
create or replace function private.capture_access_request() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; request_row public.access_requests;
begin
 m=new.raw_user_meta_data;
 if m->>'nc_access_request' is distinct from 'true' then return new; end if;
 if m->>'requested_role' is null or m->>'requested_role' <> 'OPERADOR' then raise exception 'Invalid requested role'; end if;
 if exists(select 1 from public.profiles where lower(btrim(email))=lower(btrim(new.email))) then raise exception 'Email already registered'; end if;
 insert into public.access_requests(auth_user_id,name,email,username,requested_role)
 values(new.id,btrim(m->>'name'),lower(btrim(new.email)),lower(btrim(m->>'username')),(m->>'requested_role')::public.app_role)
 returning * into request_row;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
 values(null,'ACCESS_REQUEST_CREATED','access_requests',request_row.id::text,to_jsonb(request_row));
 return new;
end $$;
create or replace function private.decide_access_request(request_id uuid, decision text, approved_role public.app_role default null, reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.access_requests; updated public.access_requests;
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role then raise exception 'Administrator required' using errcode='42501'; end if;
 select * into r from public.access_requests where id=request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if r.status<>'PENDENTE' then raise exception 'REQUEST_ALREADY_DECIDED'; end if;
 if decision='APROVADO' then
  if approved_role is null or approved_role <> 'OPERADOR' then raise exception 'Invalid approved role'; end if;
  update public.access_requests set status='APROVADO',approved_role=decide_access_request.approved_role,approved_by_user_id=auth.uid(),approved_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id returning * into updated;
  insert into public.profiles(id,name,email,role,active) values(r.auth_user_id,r.name,r.email,approved_role,true);
 elsif decision='RECUSADO' then
  if reason is null or length(btrim(reason)) not between 3 and 2000 then raise exception 'Reason required'; end if;
  update public.access_requests set status='RECUSADO',rejected_by_user_id=auth.uid(),rejected_at=clock_timestamp(),rejection_reason=btrim(reason),updated_at=clock_timestamp() where id=r.id returning * into updated;
 else raise exception 'Invalid decision'; end if;
 insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data)
 values(auth.uid(),case when decision='APROVADO' then 'ACCESS_REQUEST_APPROVED' else 'ACCESS_REQUEST_REJECTED' end,'access_requests',r.id::text,to_jsonb(r),to_jsonb(updated));
 return to_jsonb(updated);
end $$;
-- A minimal receipt preserves POST retry idempotency without exposing an operator's history.
create function private.occurrence_receipt(record_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_role() is not null and exists(select 1 from public.occurrences where id=record_id and registered_by_user_id=auth.uid());
$$;
create function public.occurrence_receipt(record_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.occurrence_receipt(record_id); $$;
revoke all on function private.occurrence_receipt(uuid),public.occurrence_receipt(uuid) from public,anon;
grant execute on function private.occurrence_receipt(uuid),public.occurrence_receipt(uuid) to authenticated;
-- Data work requires a real authenticated primary ADMIN session. All existing triggers stay enabled.
create function private.prepare_official_v2() returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; outro_id uuid;
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role or auth.uid() is distinct from (select primary_admin_user_id from private.app_ownership where singleton) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(782314);
 update public.occurrences o set canalizacao=btrim(c.name) from public.canalizacoes c where c.id=o.canalizacao_id and o.canalizacao is null;
 get diagnostics n=row_count;
 if exists(select 1 from public.occurrences where canalizacao is null or btrim(canalizacao)='') then raise exception 'Historical routing incomplete'; end if;
 insert into public.error_types(name,description,active) values('Outro','Utilize quando o tipo de erro da ocorrência não estiver disponível na lista.',true)
 on conflict(normalized_name) do update set active=true,description=excluded.description where not public.error_types.active or public.error_types.description<>excluded.description;
 select id into outro_id from public.error_types where normalized_name='outro';
 update public.alerts set active=false where status='ACOMPANHAMENTO_REALIZADO' and active;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data) values(auth.uid(),'OFFICIAL_V2_PREPARED','maintenance','official_v2',jsonb_build_object('backfilled',n,'outro_id',outro_id));
 return jsonb_build_object('backfilled',n,'outro_id',outro_id);
end $$;
create function public.prepare_official_v2() returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_official_v2(); $$;
create function private.cleanup_jpradel_tests(confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; a integer; f integer; others jsonb;
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role or auth.uid() is distinct from (select primary_admin_user_id from private.app_ownership where singleton) then raise exception 'Primary administrator required' using errcode='42501'; end if;
 if confirmation is distinct from 'REMOVER TESTES J PRADEL V2' then raise exception 'Confirmation required'; end if;
 perform pg_advisory_xact_lock(782314);
 if exists(select 1 from public.audit_logs where action='J_PRADEL_TESTS_CLEANED_V2') then return jsonb_build_object('already_completed',true); end if;
 lock table public.occurrences,public.alerts,public.alert_follow_ups in share row exclusive mode;
 select count(*) into n from public.occurrences where occurrence_user_normalized='jpradel';
 select count(*) into a from public.alerts where public.normalize_user(occurrence_user)='jpradel';
 select count(*) into f from public.alert_follow_ups where alert_id in(select id from public.alerts where public.normalize_user(occurrence_user)='jpradel');
 if n<>7 or a<>2 or f<>1 then raise exception 'Unexpected test counts: %, %, %',n,a,f; end if;
 select jsonb_agg(to_jsonb(o) order by id) into others from public.occurrences o where occurrence_user_normalized<>'jpradel';
 delete from public.alert_follow_ups where alert_id in(select id from public.alerts where public.normalize_user(occurrence_user)='jpradel');
 delete from public.alerts where public.normalize_user(occurrence_user)='jpradel';
 delete from public.occurrences where occurrence_user_normalized='jpradel';
 if others is distinct from (select jsonb_agg(to_jsonb(o) order by id) from public.occurrences o where occurrence_user_normalized<>'jpradel') then raise exception 'Unrelated data changed'; end if;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data) values(auth.uid(),'J_PRADEL_TESTS_CLEANED_V2','maintenance','jpradel',jsonb_build_object('occurrences',n,'alerts',a,'followups',f));
 return jsonb_build_object('occurrences_removed',n,'alerts_removed',a,'followups_removed',f);
end $$;
create function public.cleanup_jpradel_tests(confirmation text) returns jsonb language sql security invoker set search_path='' as $$ select private.cleanup_jpradel_tests(confirmation); $$;
revoke all on function private.prepare_official_v2(),public.prepare_official_v2(),private.cleanup_jpradel_tests(text),public.cleanup_jpradel_tests(text) from public,anon;
grant execute on function private.prepare_official_v2(),public.prepare_official_v2(),private.cleanup_jpradel_tests(text),public.cleanup_jpradel_tests(text) to authenticated;
commit;
