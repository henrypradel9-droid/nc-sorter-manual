begin;
-- Operational occurrences are shared; profiles and TL follow-up notes stay restricted.
alter policy occurrence_read on public.occurrences using((select private.current_role()) in ('ADMIN','OPERADOR'));
alter policy catalog_read on public.error_types using((select private.current_role()) in ('ADMIN','OPERADOR'));
alter policy catalog_read on public.shifts using((select private.current_role()) in ('ADMIN','OPERADOR'));
-- SECURITY INVOKER respects shared operational reads and keeps profile and follow-up RLS intact.
create or replace function public.dashboard_v2(filters jsonb default '{}', bucket_by text default 'day') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date; last_day date; n integer; step text; prev_filters jsonb; result jsonb;
begin
 if auth.uid() is null or private.current_role() is null or private.current_role() not in ('ADMIN','OPERADOR') then raise exception 'Active operational profile required' using errcode='42501'; end if;
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
 latest as(select o.*,jsonb_build_object('name',e.name) error_type,jsonb_build_object('name',s.name) shift,jsonb_build_object('name',p.name) registered_by from rows o join public.error_types e on e.id=o.error_type_id join public.shifts s on s.id=o.shift_id left join public.profiles p on p.id=o.registered_by_user_id order by o.created_at desc,o.id desc limit 10)
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
commit;
