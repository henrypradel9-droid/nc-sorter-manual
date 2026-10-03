-- NC SORTER: initial schema, intended ONLY for a new, dedicated Supabase project.
-- Review and apply after explicit account/project authorization.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.app_role as enum ('ADMIN','LIDER','OPERADOR');
create type public.occurrence_status as enum ('PENDENTE','EM_ANDAMENTO','RESOLVIDO');
create type public.alert_status as enum ('NOVO','VISUALIZADO','ACOMPANHAMENTO_REALIZADO');
create function public.normalize_user(value text) returns text language sql immutable strict parallel safe set search_path='' as $$ select lower(btrim(value)); $$;
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null check(length(btrim(name)) between 1 and 150),
 email text not null, role public.app_role not null default 'OPERADOR', active boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where auth.uid() is not null and id=auth.uid() and active;
$$;
revoke all on function private.current_role() from public;
grant execute on function private.current_role() to authenticated;
create table public.error_types (id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 150), normalized_name text generated always as (public.normalize_user(name)) stored unique, description text not null default '' check(length(description)<=1000), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.shifts (id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 150), normalized_name text generated always as (public.normalize_user(name)) stored unique, description text not null default '' check(length(description)<=1000), start_time time, end_time time, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.canalizacoes (id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 150), normalized_name text generated always as (public.normalize_user(name)) stored unique, description text not null default '' check(length(description)<=1000), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.system_settings (id boolean primary key default true check(id), recurrence_limit integer not null default 4 check(recurrence_limit between 1 and 10000), operational_start_hour integer not null default 0 check(operational_start_hour between 0 and 23), timezone text not null default 'America/Sao_Paulo' check(timezone='America/Sao_Paulo'), updated_at timestamptz not null default now());
insert into public.system_settings default values;
insert into public.error_types(name) values ('Canalização em múltiplos insumos sem fechamento'),('HU perdida'),('Missort'),('Múltiplas posições no mesmo insumo'),('Pacote montado e não inserido na HU'),('Pacotes perdidos');
insert into public.shifts(name) values ('T1'),('T2'),('T3');
create table public.occurrences (
 id uuid primary key, occurred_at timestamptz not null,
 package_id text not null default '' check(length(btrim(package_id)) <= 100), hu text not null default '' check(length(btrim(hu)) <= 100),
 occurrence_user text not null check(length(btrim(occurrence_user)) between 1 and 100), occurrence_user_normalized text generated always as (public.normalize_user(occurrence_user)) stored,
 package_quantity integer not null check(package_quantity between 1 and 1000000),
 error_type_id uuid not null references public.error_types(id), shift_id uuid not null references public.shifts(id), canalizacao_id uuid not null references public.canalizacoes(id),
 status public.occurrence_status not null, tt text not null default '' check(length(tt)<=200), observations text not null default '' check(length(observations)<=4000),
 registered_by_user_id uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index occurrences_date on public.occurrences(occurred_at desc,id);
create index occurrences_user_date on public.occurrences(occurrence_user_normalized,occurred_at);
create index occurrences_status_date on public.occurrences(status,occurred_at desc);
create index occurrences_error on public.occurrences(error_type_id,occurred_at desc);
create index occurrences_shift on public.occurrences(shift_id,occurred_at desc);
create index occurrences_canalizacao on public.occurrences(canalizacao_id,occurred_at desc);
create index occurrences_author on public.occurrences(registered_by_user_id,occurred_at desc);
create index occurrences_package on public.occurrences(package_id);
create index occurrences_hu on public.occurrences(hu);
create table public.alerts (
 id uuid primary key default gen_random_uuid(), occurrence_user text not null,
 period_start timestamptz not null, period_end timestamptz not null, occurrence_count integer not null,
 most_frequent_error text, last_occurrence timestamptz, shifts text[] not null default '{}',
 status public.alert_status not null default 'NOVO', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(occurrence_user,period_start,period_end)
);
create index alerts_active_period on public.alerts(active,period_start desc);
create table public.alert_follow_ups (id uuid primary key default gen_random_uuid(), alert_id uuid not null references public.alerts(id), note text not null check(length(btrim(note)) between 3 and 4000), responsible_user_id uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now());
create index followups_alert on public.alert_follow_ups(alert_id,created_at desc);
create index followups_author on public.alert_follow_ups(responsible_user_id);
create table public.audit_logs (id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null, entity text not null, record_id text not null, old_data jsonb, new_data jsonb, created_at timestamptz not null default clock_timestamp());
create index audit_date on public.audit_logs(created_at desc);
create index audit_record on public.audit_logs(entity,record_id,created_at desc);
create index audit_actor on public.audit_logs(actor_id,created_at desc);

-- All exposed tables have explicit RLS and narrow grants.
alter table public.profiles enable row level security;
alter table public.error_types enable row level security;
alter table public.shifts enable row level security;
alter table public.canalizacoes enable row level security;
alter table public.occurrences enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_follow_ups enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.profiles,public.error_types,public.shifts,public.canalizacoes,public.occurrences,public.alerts,public.alert_follow_ups,public.system_settings,public.audit_logs from anon,authenticated;
grant select on public.profiles,public.error_types,public.shifts,public.canalizacoes,public.occurrences,public.alerts,public.alert_follow_ups,public.system_settings,public.audit_logs to authenticated;
grant insert(name,description,active) on public.error_types,public.canalizacoes to authenticated;
grant update(name,description,active) on public.error_types,public.canalizacoes to authenticated;
grant insert(name,description,active,start_time,end_time),update(name,description,active,start_time,end_time) on public.shifts to authenticated;
grant insert(id,occurred_at,package_id,hu,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status,tt,observations) on public.occurrences to authenticated;
grant update(occurred_at,package_id,hu,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status,tt,observations) on public.occurrences to authenticated;
grant update(status) on public.alerts to authenticated;
grant insert(alert_id,note) on public.alert_follow_ups to authenticated;
grant update(name,role,active) on public.profiles to authenticated;
grant insert(id,name,email,role,active) on public.profiles to authenticated;
grant update(recurrence_limit,operational_start_hour) on public.system_settings to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.current_role()) in ('ADMIN','LIDER'));
create policy profile_edit on public.profiles for update to authenticated using((select private.current_role())='ADMIN') with check((select private.current_role())='ADMIN');
create policy profile_add on public.profiles for insert to authenticated with check((select private.current_role())='ADMIN');
create policy occurrence_read on public.occurrences for select to authenticated using((select private.current_role()) in ('ADMIN','LIDER') or ((select private.current_role())='OPERADOR' and registered_by_user_id=(select auth.uid())));
create policy occurrence_add on public.occurrences for insert to authenticated with check((select private.current_role()) is not null and registered_by_user_id=(select auth.uid()));
create policy occurrence_edit on public.occurrences for update to authenticated using((select private.current_role()) in ('ADMIN','LIDER')) with check((select private.current_role()) in ('ADMIN','LIDER'));
create policy alerts_read on public.alerts for select to authenticated using((select private.current_role()) in ('ADMIN','LIDER'));
create policy alerts_edit on public.alerts for update to authenticated using((select private.current_role()) in ('ADMIN','LIDER')) with check((select private.current_role()) in ('ADMIN','LIDER'));
create policy followups_read on public.alert_follow_ups for select to authenticated using((select private.current_role()) in ('ADMIN','LIDER'));
create policy followups_add on public.alert_follow_ups for insert to authenticated with check((select private.current_role()) in ('ADMIN','LIDER') and responsible_user_id=(select auth.uid()));
create policy settings_read on public.system_settings for select to authenticated using((select private.current_role()) is not null);
create policy settings_edit on public.system_settings for update to authenticated using((select private.current_role())='ADMIN') with check((select private.current_role())='ADMIN');
create policy audit_read on public.audit_logs for select to authenticated using((select private.current_role())='ADMIN' or (entity='occurrences' and exists(select 1 from public.occurrences o where o.id::text=record_id)));
do $$ declare t text; begin foreach t in array array['error_types','shifts','canalizacoes'] loop
 execute format('create policy catalog_read on public.%I for select to authenticated using ((select private.current_role()) is not null)',t);
 execute format('create policy catalog_add on public.%I for insert to authenticated with check ((select private.current_role()) in (''ADMIN'',''LIDER''))',t);
 execute format('create policy catalog_edit on public.%I for update to authenticated using ((select private.current_role()) in (''ADMIN'',''LIDER'')) with check ((select private.current_role()) in (''ADMIN'',''LIDER''))',t);
end loop; end $$;

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare prev jsonb; next_value jsonb; action_name text;
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if TG_OP='UPDATE' then prev=to_jsonb(old); end if;
 next_value=to_jsonb(new);
 action_name=TG_TABLE_NAME||'_'||TG_OP;
 if TG_TABLE_NAME='occurrences' then
  action_name=case when TG_OP='INSERT' then 'OCORRENCIA_CRIADA' when old.status is distinct from new.status then 'STATUS_ALTERADO' else 'OCORRENCIA_EDITADA' end;
 end if;
 insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data) values(auth.uid(),action_name,TG_TABLE_NAME,next_value->>'id',prev,next_value);
 return new;
end $$;
create function private.before_change() returns trigger language plpgsql set search_path='' as $$
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
  if (TG_OP='INSERT' or new.canalizacao_id<>old.canalizacao_id) and not exists(select 1 from public.canalizacoes where id=new.canalizacao_id and active) then raise exception 'Inactive routing'; end if;
 elsif TG_TABLE_NAME='system_settings' then perform pg_advisory_xact_lock(782314);
 elsif TG_TABLE_NAME='profiles' then
  if new.id=auth.uid() and (not new.active or new.role<>'ADMIN') then raise exception 'Cannot remove your own administrative access'; end if;
 end if;
 return new;
end $$;
create function private.refresh_user_alerts(user_key text, only_instant timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare cfg public.system_settings; bucket record; start_at timestamptz; end_at timestamptz; top_error text; shift_names text[]; target_start timestamptz; target_end timestamptz;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'Authenticated actor required'; end if;
 select * into cfg from public.system_settings where id;
 if only_instant is not null then
  target_start=((((only_instant at time zone cfg.timezone)-make_interval(hours=>cfg.operational_start_hour))::date)+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  target_end=target_start+interval '1 day';
 end if;
 -- Preserve follow-up history when an edit makes an existing alert no longer applicable.
 update public.alerts set active=false,occurrence_count=0,updated_at=clock_timestamp() where occurrence_user=user_key and (only_instant is null or (period_start=target_start and period_end=target_end));
 for bucket in select ((occurred_at at time zone cfg.timezone)-make_interval(hours=>cfg.operational_start_hour))::date as day, count(*) as n,max(occurred_at) as last_at
  from public.occurrences where occurrence_user_normalized=user_key and (only_instant is null or (occurred_at>=target_start and occurred_at<target_end)) group by 1 loop
  start_at=(bucket.day+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  end_at=(bucket.day+1+make_interval(hours=>cfg.operational_start_hour)) at time zone cfg.timezone;
  select e.name into top_error from public.occurrences o join public.error_types e on e.id=o.error_type_id where o.occurrence_user_normalized=user_key and occurred_at>=start_at and occurred_at<end_at group by e.id,e.name order by count(*) desc,e.name limit 1;
  select array_agg(distinct s.name order by s.name) into shift_names from public.occurrences o join public.shifts s on s.id=o.shift_id where o.occurrence_user_normalized=user_key and occurred_at>=start_at and occurred_at<end_at;
  if bucket.n>cfg.recurrence_limit or exists(select 1 from public.alerts where occurrence_user=user_key and period_start=start_at and period_end=end_at) then
   insert into public.alerts(occurrence_user,period_start,period_end,occurrence_count,most_frequent_error,last_occurrence,shifts,active)
    values(user_key,start_at,end_at,bucket.n,top_error,bucket.last_at,shift_names,bucket.n>cfg.recurrence_limit)
   on conflict(occurrence_user,period_start,period_end) do update set occurrence_count=excluded.occurrence_count,most_frequent_error=excluded.most_frequent_error,last_occurrence=excluded.last_occurrence,shifts=excluded.shifts,active=excluded.active,updated_at=clock_timestamp();
  end if;
 end loop;
end $$;
create function private.after_occurrence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if TG_OP='UPDATE' then
  if old.occurrence_user_normalized<>new.occurrence_user_normalized or old.occurred_at<>new.occurred_at then perform private.refresh_user_alerts(old.occurrence_user_normalized,old.occurred_at); end if;
 end if;
 perform private.refresh_user_alerts(new.occurrence_user_normalized,new.occurred_at); return new;
end $$;
create function private.after_settings() returns trigger language plpgsql security definer set search_path='' as $$
declare u record; begin
 if auth.uid() is null or private.current_role()<>'ADMIN' then raise exception 'Administrator required'; end if;
 for u in select distinct occurrence_user_normalized from public.occurrences loop perform private.refresh_user_alerts(u.occurrence_user_normalized); end loop;
 return new;
end $$;
create function private.after_followup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() not in ('ADMIN','LIDER') then raise exception 'Leader required'; end if;
 update public.alerts set status='ACOMPANHAMENTO_REALIZADO',updated_at=clock_timestamp() where id=new.alert_id;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['profiles','error_types','shifts','canalizacoes','occurrences','system_settings'] loop
 execute format('create trigger before_change before insert or update on public.%I for each row execute function private.before_change()',t);
 execute format('create trigger audit_change after insert or update on public.%I for each row execute function private.audit_change()',t);
end loop; end $$;
create trigger audit_followup after insert on public.alert_follow_ups for each row execute function private.audit_change();
create trigger audit_alert_status after update of status on public.alerts for each row when(old.status is distinct from new.status) execute function private.audit_change();
create trigger refresh_alerts after insert or update on public.occurrences for each row execute function private.after_occurrence();
create trigger refresh_settings after update on public.system_settings for each row execute function private.after_settings();
create trigger complete_followup after insert on public.alert_follow_ups for each row execute function private.after_followup();
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.current_role() to authenticated;

-- Filtered relation is an invoker function: all callers remain subject to RLS.
create function public.filtered_occurrences(filters jsonb default '{}') returns setof public.occurrences language sql stable security invoker set search_path='' as $$
 select o.* from public.occurrences o where
 (nullif(filters->>'from_at','') is null or o.occurred_at>=(filters->>'from_at')::timestamptz) and
 (nullif(filters->>'to_at','') is null or o.occurred_at<(filters->>'to_at')::timestamptz) and
 (nullif(filters->>'from','') is null or o.occurred_at>=(filters->>'from')::date::timestamp at time zone 'America/Sao_Paulo') and
 (nullif(filters->>'to','') is null or o.occurred_at<((filters->>'to')::date+1)::timestamp at time zone 'America/Sao_Paulo') and
 (nullif(filters->>'q','') is null or o.package_id ilike '%'||(filters->>'q')||'%' or o.hu ilike '%'||(filters->>'q')||'%' or o.occurrence_user_normalized ilike '%'||public.normalize_user(filters->>'q')||'%') and
 (nullif(filters->>'occurrence_user','') is null or o.occurrence_user_normalized=public.normalize_user(filters->>'occurrence_user')) and
 (nullif(filters->>'status','') is null or o.status=(filters->>'status')::public.occurrence_status) and
 (nullif(filters->>'error_type_id','') is null or o.error_type_id=(filters->>'error_type_id')::uuid) and
 (nullif(filters->>'shift_id','') is null or o.shift_id=(filters->>'shift_id')::uuid) and
 (nullif(filters->>'canalizacao_id','') is null or o.canalizacao_id=(filters->>'canalizacao_id')::uuid) and
 (nullif(filters->>'registered_by_user_id','') is null or o.registered_by_user_id=(filters->>'registered_by_user_id')::uuid);
$$;
create function public.dashboard(filters jsonb default '{}') returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as materialized(select * from public.filtered_occurrences(filters)),
 errors as(select e.name as name,o.error_type_id as id,count(*) as total from rows o join public.error_types e on e.id=o.error_type_id group by e.name,o.error_type_id order by total desc),
 days as(select (occurred_at at time zone 'America/Sao_Paulo')::date as name,count(*) as total from rows group by 1 order by 1),
 shifts as(select s.name,o.shift_id as id,count(*) as total from rows o join public.shifts s on s.id=o.shift_id group by s.name,o.shift_id),
 routing as(select c.name,o.canalizacao_id as id,count(*) as total from rows o join public.canalizacoes c on c.id=o.canalizacao_id group by c.name,o.canalizacao_id),
 users as(select occurrence_user_normalized as name,count(*) as total from rows group by 1 order by total desc limit 10)
 select jsonb_build_object('total',(select count(*) from rows),'pending',(select count(*) from rows where status='PENDENTE'),'progress',(select count(*) from rows where status='EM_ANDAMENTO'),'resolved',(select count(*) from rows where status='RESOLVIDO'),
 'errors',coalesce((select jsonb_agg(errors) from errors),'[]'::jsonb),'days',coalesce((select jsonb_agg(days) from days),'[]'::jsonb),'shifts',coalesce((select jsonb_agg(shifts) from shifts),'[]'::jsonb),'routing',coalesce((select jsonb_agg(routing) from routing),'[]'::jsonb),'users',coalesce((select jsonb_agg(users) from users),'[]'::jsonb),
 'alerts',(select count(distinct a.occurrence_user) from public.alerts a where a.active and exists(select 1 from rows r where r.occurrence_user_normalized=a.occurrence_user and r.occurred_at>=a.period_start and r.occurred_at<a.period_end)));
$$;
create function public.suggest_users(prefix text) returns table(name text) language sql stable security invoker set search_path='' as $$
 select distinct occurrence_user_normalized from public.occurrences where length(prefix)>=2 and occurrence_user_normalized like public.normalize_user(prefix)||'%' order by 1 limit 10;
$$;
revoke all on function public.filtered_occurrences(jsonb), public.dashboard(jsonb),public.suggest_users(text),public.normalize_user(text) from public,anon;
grant execute on function public.filtered_occurrences(jsonb),public.dashboard(jsonb),public.suggest_users(text),public.normalize_user(text) to authenticated;

create function public.export_occurrences(filters jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare payload jsonb; begin
 if private.current_role() not in ('ADMIN','LIDER') or private.current_role() is null then raise exception 'Leader required'; end if;
 select coalesce(jsonb_agg(row),'[]'::jsonb) into payload from (
  select o.*,jsonb_build_object('name',e.name) as error_type,jsonb_build_object('name',s.name) as shift,jsonb_build_object('name',c.name) as canalizacao,jsonb_build_object('name',p.name) as registered_by
  from public.filtered_occurrences(filters) o join public.error_types e on e.id=o.error_type_id join public.shifts s on s.id=o.shift_id join public.canalizacoes c on c.id=o.canalizacao_id join public.profiles p on p.id=o.registered_by_user_id
  order by o.occurred_at desc,o.id desc limit 20001
 ) row;
 if jsonb_array_length(payload)>20000 then raise exception 'EXPORT_TOO_LARGE'; end if;
 return payload;
end $$;
revoke all on function public.export_occurrences(jsonb) from public,anon;
grant execute on function public.export_occurrences(jsonb) to authenticated;

commit;
