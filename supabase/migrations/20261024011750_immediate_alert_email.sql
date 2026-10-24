create or replace function private.enqueue_alert_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.active or new.status='ACOMPANHAMENTO_REALIZADO' then return new; end if;
 if TG_OP='UPDATE' then
  if (new.occurrence_user,new.milestone,new.occurrence_count,new.most_frequent_error,new.shifts,new.last_occurrence,new.status,new.active)
   is not distinct from
   (old.occurrence_user,old.milestone,old.occurrence_count,old.most_frequent_error,old.shifts,old.last_occurrence,old.status,old.active)
  then return new; end if;
 end if;
 perform private.dispatch_email_job();
 return new;
exception when others then
 -- An email outage must not prevent an operational record from being saved.
 -- The existing 15-minute job retries pending notifications.
 raise warning 'NC SORTER immediate email dispatch failed';
 return new;
end $$;
revoke all on function private.enqueue_alert_email() from public,anon,authenticated;
create trigger enqueue_alert_email after insert or update on public.alerts
for each row execute function private.enqueue_alert_email();
