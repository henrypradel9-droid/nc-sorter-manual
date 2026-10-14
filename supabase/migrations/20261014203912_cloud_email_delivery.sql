create table public.email_deliveries (
 delivery_key text primary key,
 recipient text not null,
 subject text not null,
 message_id text not null,
 state text not null check(state in ('sending','sent','review_required')),
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public,anon,authenticated;
grant select,insert,update on public.email_deliveries to service_role;
comment on table public.email_deliveries is 'Server-only SMTP delivery ledger. Uncertain deliveries require Sent-folder reconciliation; never automatically resend.';
