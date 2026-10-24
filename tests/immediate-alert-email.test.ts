import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("immediate email ignores technical changes and keeps writes working during outages",async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema private; create role anon; create role authenticated;
 create table calls(id integer); create function private.dispatch_email_job() returns bigint language plpgsql as $$begin insert into public.calls values(1); return 1; end$$;
 create table public.alerts(occurrence_user text,milestone integer,occurrence_count integer,most_frequent_error text,shifts text[],last_occurrence timestamptz,status text,active boolean,updated_at timestamptz);`);
 await db.exec(await readFile(new URL("../supabase/migrations/20261024011750_immediate_alert_email.sql",import.meta.url),"utf8"));
 const count=async()=>Number((await db.query<{n:number}>("select count(*) n from calls")).rows[0].n);
 await db.exec("insert into alerts values('person',5,5,'Error',array['T1'],now(),'NOVO',true,now())");
 assert.equal(await count(),1);
 await db.exec("update alerts set updated_at=clock_timestamp()");
 assert.equal(await count(),1);
 await db.exec("update alerts set status='VISUALIZADO'");
 assert.equal(await count(),2);
 await db.exec("update alerts set status='ACOMPANHAMENTO_REALIZADO'");
 assert.equal(await count(),2);
 await db.exec(`create or replace function private.dispatch_email_job() returns bigint language plpgsql as $$begin raise exception 'offline'; end$$;`);
 await db.exec("update alerts set status='NOVO'");
 assert.equal((await db.query<{status:string}>("select status from alerts")).rows[0].status,"NOVO");
 }finally{await db.close();}
});
