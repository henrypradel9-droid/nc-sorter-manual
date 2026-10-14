# NC SORTER cloud email

Production runs on Vercel; Supabase pg_cron invokes the authenticated POST endpoint
`/api/internal/email` every 15 minutes through pg_net. The job is
`nc-sorter-cloud-email`. No local computer is needed.

- Sender: henrypradel9@gmail.com through Gmail SMTP.
- Recipients: werles.ldias@mercadolivre.com and amandafer.nascimento@mercadolivre.com.
- Alert changes: deduplicated by meaningful alert fields and recipient.
- Weekly report: Sunday 08:00 America/Sao_Paulo (11:00 UTC), with a fixed previous
  seven-day window. Later Sunday runs can catch up, without resending confirmed mail.
- Full CSV includes all paginated occurrence records in the report window.

Production variables: SMTP_USER, SMTP_PASS (Secret), CRON_SECRET (Secret),
EMAIL_AUTOMATION_ENABLED=true. The same CRON_SECRET is stored in Supabase Vault
as nc_sorter_email_cron_secret. Never commit or log these credentials.

`public.email_deliveries` is accessible only by service_role, with RLS enabled.
`sent` means Gmail SMTP accepted the message; it does not confirm inbox placement.
`sending` or `review_required` must be reconciled against Gmail Sent using the stored
Message-ID before any manual retry. Never clear these records just to retry.

Inspect cron.job, cron.job_run_details and net._http_response for scheduler/HTTP
failures, and email_deliveries for SMTP state. The authenticated test mode
`?mode=test` sends only to Henry, once per deployment. No secret is accepted in a URL.

The previous two local Codex automations were removed after the cloud test and
scheduler activation to prevent duplicate sends.

To stop sends, deactivate the cron job. To recreate it after restoring Vault:

```sql
select cron.schedule('nc-sorter-cloud-email', '*/15 * * * *',
  'select private.dispatch_email_job();');
```
