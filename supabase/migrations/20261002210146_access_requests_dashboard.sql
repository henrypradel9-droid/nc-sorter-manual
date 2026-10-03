-- Incremental upgrade; no existing accounts or occurrences are rewritten.
begin;
create table public.access_requests (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null unique references auth.users(id),
 name text not null check(length(btrim(name)) between 3 and 150),
 email text not null unique check(email=lower(btrim(email)) and length(email)<=254),
 username text not null unique check(username ~ '^[a-z0-9._-]{3,50}$'),
 requested_role public.app_role not null check(requested_role in ('OPERADOR','LIDER')),
 status text not null default 'PENDENTE' check(status in ('PENDENTE','APROVADO','RECUSADO')),
 approved_role public.app_role check(approved_role in ('OPERADOR','LIDER')),
 approved_by_user_id uuid references public.profiles(id), approved_at timestamptz,
 rejected_by_user_id uuid references public.profiles(id), rejected_at timestamptz, rejection_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((status='PENDENTE' and approved_role is null and approved_by_user_id is null and approved_at is null and rejected_by_user_id is null and rejected_at is null and rejection_reason is null)
 or (status='APROVADO' and approved_role is not null and approved_by_user_id is not null and approved_at is not null and rejected_by_user_id is null and rejected_at is null and rejection_reason is null)
 or (status='RECUSADO' and approved_role is null and approved_by_user_id is null and approved_at is null and rejected_by_user_id is not null and rejected_at is not null and length(btrim(rejection_reason)) between 3 and 2000))
);
create index access_requests_status_date on public.access_requests(status,created_at desc,id);
create index access_requests_approver on public.access_requests(approved_by_user_id) where approved_by_user_id is not null;
create index access_requests_rejecter on public.access_requests(rejected_by_user_id) where rejected_by_user_id is not null;
alter table public.access_requests enable row level security;
revoke all on public.access_requests from public,anon,authenticated;
grant select on public.access_requests to authenticated;
create policy access_requests_admin_read on public.access_requests for select to authenticated using((select private.current_role())='ADMIN');

-- Auth owns password hashing. This INSERT-only trigger creates a pending application,
-- never a profile/role. User-editable metadata cannot approve or grant any access.
-- No JWT actor exists on a public application; applicant UUID is recorded in the audit payload.
create function private.capture_access_request() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; request_row public.access_requests;
begin
 m=new.raw_user_meta_data;
 if m->>'nc_access_request' is distinct from 'true' then return new; end if;
 if m->>'requested_role' is null or m->>'requested_role' not in ('OPERADOR','LIDER') then raise exception 'Invalid requested role'; end if;
 if exists(select 1 from public.profiles where lower(btrim(email))=lower(btrim(new.email))) then raise exception 'Email already registered'; end if;
 insert into public.access_requests(auth_user_id,name,email,username,requested_role)
 values(new.id,btrim(m->>'name'),lower(btrim(new.email)),lower(btrim(m->>'username')),(m->>'requested_role')::public.app_role)
 returning * into request_row;
 insert into public.audit_logs(actor_id,action,entity,record_id,new_data)
 values(null,'ACCESS_REQUEST_CREATED','access_requests',request_row.id::text,to_jsonb(request_row));
 return new;
end $$;
revoke all on function private.capture_access_request() from public,anon,authenticated;
create trigger nc_capture_access_request after insert on auth.users for each row execute function private.capture_access_request();

create function private.decide_access_request(request_id uuid, decision text, approved_role public.app_role default null, reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.access_requests; updated public.access_requests;
begin
 if auth.uid() is null or private.current_role() is distinct from 'ADMIN'::public.app_role then raise exception 'Administrator required' using errcode='42501'; end if;
 select * into r from public.access_requests where id=request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if r.status<>'PENDENTE' then raise exception 'REQUEST_ALREADY_DECIDED'; end if;
 if decision='APROVADO' then
  if approved_role is null or approved_role not in ('OPERADOR','LIDER') then raise exception 'Invalid approved role'; end if;
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
revoke all on function private.decide_access_request(uuid,text,public.app_role,text) from public,anon;
grant execute on function private.decide_access_request(uuid,text,public.app_role,text) to authenticated;
create function public.decide_access_request(request_id uuid, decision text, approved_role public.app_role default null, reason text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.decide_access_request(request_id,decision,approved_role,reason); $$;
revoke all on function public.decide_access_request(uuid,text,public.app_role,text) from public,anon;
grant execute on function public.decide_access_request(uuid,text,public.app_role,text) to authenticated;

create function private.audit_profile_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if TG_OP='UPDATE' and old.role is distinct from new.role then
  insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data) values(auth.uid(),'USER_ROLE_CHANGED','profiles',new.id::text,to_jsonb(old),to_jsonb(new));
 end if;
 if (TG_OP='INSERT' and new.active) or (TG_OP='UPDATE' and old.active is distinct from new.active) then
  insert into public.audit_logs(actor_id,action,entity,record_id,old_data,new_data) values(auth.uid(),case when new.active then 'USER_ACTIVATED' else 'USER_DEACTIVATED' end,'profiles',new.id::text,case when TG_OP='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 end if;
 return new;
end $$;
revoke all on function private.audit_profile_access() from public,anon,authenticated;
create trigger audit_profile_access after insert or update on public.profiles for each row execute function private.audit_profile_access();

-- Block attempts to bypass the approval workflow through existing profile APIs.
create function private.check_request_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
 if new.active and exists(select 1 from public.access_requests where auth_user_id=new.id and status<>'APROVADO') then raise exception 'Approval required' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.check_request_approval() from public,anon,authenticated;
create trigger check_request_approval before insert or update on public.profiles for each row execute function private.check_request_approval();

create function public.dashboard_v2(filters jsonb default '{}', bucket_by text default 'day') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date; last_day date; n integer; step text; prev_filters jsonb; result jsonb;
begin
 if auth.uid() is null or private.current_role() is null or private.current_role() not in ('ADMIN','LIDER') then raise exception 'Leader required' using errcode='42501'; end if;
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
 routing as(select c.id,c.name,count(*) total from rows o join public.canalizacoes c on c.id=o.canalizacao_id group by c.id,c.name order by total desc,c.name),
 users as(select occurrence_user_normalized as name,count(*) total from rows group by 1 order by total desc,name limit 10),
 heatmap as(select c.id,c.name,(extract(hour from o.occurred_at at time zone 'America/Sao_Paulo')::int/2)*2 as hour,count(*) total from rows o join public.canalizacoes c on c.id=o.canalizacao_id group by c.id,c.name,3 order by c.name,3),
 latest as(select o.*,jsonb_build_object('name',e.name) error_type,jsonb_build_object('name',s.name) shift,jsonb_build_object('name',c.name) canalizacao,jsonb_build_object('name',p.name) registered_by from rows o join public.error_types e on e.id=o.error_type_id join public.shifts s on s.id=o.shift_id join public.canalizacoes c on c.id=o.canalizacao_id join public.profiles p on p.id=o.registered_by_user_id order by o.created_at desc,o.id desc limit 10)
 select jsonb_build_object(
 'from',first_day,'to',last_day,'grouping',step,
 'total',(select count(*) from rows),'pending',(select count(*) from rows where status='PENDENTE'),'progress',(select count(*) from rows where status='EM_ANDAMENTO'),'resolved',(select count(*) from rows where status='RESOLVIDO'),
 'previous',jsonb_build_object('from',first_day-n,'to',first_day-1,'total',(select count(*) from previous),'pending',(select count(*) from previous where status='PENDENTE'),'progress',(select count(*) from previous where status='EM_ANDAMENTO'),'resolved',(select count(*) from previous where status='RESOLVIDO')),
 'series',coalesce((select jsonb_agg(trend order by name) from trend),'[]'::jsonb),
 'errors',coalesce((select jsonb_agg(errors) from errors),'[]'::jsonb),'shifts',coalesce((select jsonb_agg(shifts) from shifts),'[]'::jsonb),'routing',coalesce((select jsonb_agg(routing) from routing),'[]'::jsonb),'users',coalesce((select jsonb_agg(users) from users),'[]'::jsonb),'heatmap',coalesce((select jsonb_agg(heatmap) from heatmap),'[]'::jsonb),'latest',coalesce((select jsonb_agg(latest) from latest),'[]'::jsonb),
 'alerts',(select count(distinct a.occurrence_user) from public.alerts a where a.active and exists(select 1 from rows r where r.occurrence_user_normalized=a.occurrence_user and r.occurred_at>=a.period_start and r.occurred_at<a.period_end))
 ) into result;
 return result;
end $$;
revoke all on function public.dashboard_v2(jsonb,text) from public,anon;
grant execute on function public.dashboard_v2(jsonb,text) to authenticated;
commit;

