-- A new alert at each cumulative milestone; preserve completed follow-up history.
alter table public.alerts add column if not exists milestone integer check(milestone>0);
alter table public.alerts drop constraint if exists alerts_occurrence_user_period_start_period_end_key;
create unique index if not exists alerts_user_milestone on public.alerts(occurrence_user,milestone) where milestone is not null;

create or replace function private.refresh_user_alerts(user_key text, only_instant timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
declare cfg public.system_settings; total integer; step_size integer; mark integer; item record;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'Authenticated actor required'; end if;
 perform pg_advisory_xact_lock(782314);
 select * into cfg from public.system_settings where id;
 step_size=cfg.recurrence_limit+1;
 select count(*) into total from public.occurrences where occurrence_user_normalized=user_key;
 -- Old daily alerts remain available in history.
 update public.alerts set active=false,updated_at=clock_timestamp()
 where occurrence_user=user_key and milestone is null and status<>'ACOMPANHAMENTO_REALIZADO' and active;
 for mark in
  select m from generate_series(step_size,total,step_size) m
  union select milestone from public.alerts where occurrence_user=user_key and milestone is not null and status<>'ACOMPANHAMENTO_REALIZADO'
 loop
  with prefix as (
   select o.occurred_at,o.error_type_id,o.shift_id from public.occurrences o
   where o.occurrence_user_normalized=user_key order by o.occurred_at,o.id limit mark
  ) select count(*)::integer as n,min(occurred_at) as first_at,max(occurred_at) as last_at,
   (select e.name from prefix p join public.error_types e on e.id=p.error_type_id group by e.id,e.name order by count(*) desc,e.name limit 1) as top_error,
   (select coalesce(array_agg(distinct s.name order by s.name),'{}'::text[]) from prefix p join public.shifts s on s.id=p.shift_id) as shift_names
   into item from prefix;
  if item.n=0 then
   update public.alerts set active=false,occurrence_count=0,updated_at=clock_timestamp()
    where occurrence_user=user_key and milestone=mark and status<>'ACOMPANHAMENTO_REALIZADO';
  else
   insert into public.alerts(occurrence_user,milestone,period_start,period_end,occurrence_count,most_frequent_error,last_occurrence,shifts,active)
   values(user_key,mark,item.first_at,item.last_at+interval '1 millisecond',item.n,item.top_error,item.last_at,item.shift_names,total>=mark and mark%step_size=0)
   on conflict(occurrence_user,milestone) where milestone is not null do update
   set period_start=excluded.period_start,period_end=excluded.period_end,occurrence_count=excluded.occurrence_count,
    most_frequent_error=excluded.most_frequent_error,last_occurrence=excluded.last_occurrence,shifts=excluded.shifts,
    active=excluded.active,updated_at=clock_timestamp()
   where public.alerts.status<>'ACOMPANHAMENTO_REALIZADO'
    and (public.alerts.period_start,public.alerts.period_end,public.alerts.occurrence_count,public.alerts.most_frequent_error,public.alerts.shifts,public.alerts.active)
     is distinct from (excluded.period_start,excluded.period_end,excluded.occurrence_count,excluded.most_frequent_error,excluded.shifts,excluded.active);
  end if;
 end loop;
end $$;

-- Recompute existing users under an active administrator for the existing audit triggers.
do $$
declare actor uuid; previous_sub text; u record;
begin
 select id into actor from public.profiles where active and role='ADMIN' order by created_at,id limit 1;
 if actor is null then raise exception 'Active administrator required for alert backfill'; end if;
 previous_sub=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 for u in select distinct occurrence_user_normalized from public.occurrences
 loop perform private.refresh_user_alerts(u.occurrence_user_normalized); end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
end $$;
