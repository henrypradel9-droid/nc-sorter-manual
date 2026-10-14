create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function private.dispatch_email_job() returns bigint
language plpgsql security definer set search_path='' as $$
declare token text; request_id bigint;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='nc_sorter_email_cron_secret';
 if token is null then raise exception 'Email cron secret missing'; end if;
 select net.http_post(
  url:='https://nc-sorter-manual.vercel.app/api/internal/email',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
  body:='{}'::jsonb,timeout_milliseconds:=300000
 ) into request_id;
 return request_id;
end $$;
revoke all on function private.dispatch_email_job() from public,anon,authenticated;
