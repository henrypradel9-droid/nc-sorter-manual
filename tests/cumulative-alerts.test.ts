import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("cumulative milestones span days, remain idempotent and preserve completed history", async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   create schema private; create schema auth;
   create function auth.uid() returns uuid language sql as $$select '10000000-0000-4000-8000-000000000001'::uuid$$;
   create function private.current_role() returns text language sql as $$select 'ADMIN'::text$$;
   create table system_settings(id boolean,recurrence_limit integer);
   insert into system_settings values(true,4);
   create table error_types(id integer,name text); insert into error_types values(1,'Missort');
   create table shifts(id integer,name text); insert into shifts values(1,'T1');
   create table occurrences(id integer,occurred_at timestamptz,occurrence_user_normalized text,error_type_id integer,shift_id integer);
   create table alerts(id uuid default gen_random_uuid(),occurrence_user text,period_start timestamptz,period_end timestamptz,
    occurrence_count integer,most_frequent_error text,last_occurrence timestamptz,shifts text[],active boolean,
    status text default 'NOVO',created_at timestamptz default now(),updated_at timestamptz default now(),
    unique(occurrence_user,period_start,period_end));
  `);
  await db.exec(await readFile(new URL("../db/cumulative-alerts.sql",import.meta.url),"utf8"));
  const refresh = () => db.query("select private.refresh_user_alerts('person')");
  const rows = async () => (await db.query<{milestone:number;occurrence_count:number;active:boolean}>("select milestone,occurrence_count,active from alerts order by milestone")).rows;
  for (let i=1;i<=15;i++) {
   await db.query("insert into occurrences values($1::integer,'2026-10-01'::timestamptz + $1::integer * interval '1 day','person',1,1)",[i]);
   await refresh();
   assert.equal((await rows()).filter(r=>r.active).length,Math.floor(i/5));
  }
  assert.deepEqual((await rows()).map(r=>r.milestone),[5,10,15]);
  const snapshot=await db.query("select * from alerts order by milestone");
  await refresh();
  assert.deepEqual(await db.query("select * from alerts order by milestone"),snapshot);
  await db.exec("update alerts set status='ACOMPANHAMENTO_REALIZADO' where milestone=5; delete from occurrences where id=15");
  await refresh();
  assert.deepEqual((await rows()).at(-1),{milestone:15,occurrence_count:14,active:false});
  assert.equal((await db.query<{n:number}>("select occurrence_count n from alerts where milestone=5")).rows[0].n,5);
  await db.exec("insert into occurrences values(16,'2026-10-20','person',1,1)");
  await refresh();
  assert.equal((await rows()).length,3);
  assert.equal((await rows()).at(-1)?.active,true);
  await db.exec("update occurrences set occurred_at='2026-10-20' where id>5");
  await refresh();
  assert.equal((await rows()).length,3);
 } finally {await db.close();}
});
