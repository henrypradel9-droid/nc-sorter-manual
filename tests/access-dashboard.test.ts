import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { accessRequestSchema } from "../schemas/access-request.ts";
import { comparison, dateShift, occurrenceLink } from "../lib/dashboard.ts";

test("dashboard navigation preserves filters and comparison handles zero baseline", () => {
  const link=occurrenceLink("from=2026-10-01&to=2026-10-02&grouping=week&shift_id=shift", "occurrence_user", "ana.silva");
  const params=new URL(link,"http://localhost").searchParams;
  assert.equal(params.get("from"),"2026-10-01"); assert.equal(params.get("shift_id"),"shift"); assert.equal(params.get("occurrence_user"),"ana.silva"); assert.equal(params.has("grouping"),false);
  assert.equal(dateShift("2026-10-01",-1),"2026-09-30");
  assert.equal(comparison(5,0),"Sem base anterior para comparação");
  assert.ok(comparison(15,10).includes("50%"));
});

test("public registration rejects ADMIN, unknown fields, weak or mismatched passwords", () => {
  const valid = { name: "Pessoa teste", email: "PESSOA@example.test", username: "Pessoa.Teste", password: "StrongTest123!", confirm_password: "StrongTest123!", requested_role: "OPERADOR" };
  assert.equal(accessRequestSchema.parse(valid).username, "pessoa.teste");
  assert.equal(accessRequestSchema.safeParse({ ...valid, requested_role: "LIDER" }).success, true);
  for (const change of [{ requested_role: "ADMIN" }, { role: "ADMIN" }, { password: "fraca" }, { confirm_password: "diferente" }]) assert.equal(accessRequestSchema.safeParse({ ...valid, ...change }).success, false);
});

test("approval workflow, RLS, audit and aggregated dashboard regression", async () => {
  const db = new PGlite();
  const admin = "10000000-0000-4000-8000-000000000001";
  const ids = [2,3,4,5].map(n => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL("../db/schema.sql",import.meta.url),"utf8"));
  await db.exec(`insert into auth.users(id,email) values('${admin}','admin@example.test'); select set_config('request.jwt.claim.sub','${admin}',false); insert into public.profiles(id,name,email,role,active) values('${admin}','Original Admin','admin@example.test','ADMIN',true);`);
  const original = (await db.query(`select * from public.profiles where id='${admin}'`)).rows[0];
  await db.exec(await readFile(new URL("../db/access-requests-dashboard.sql",import.meta.url),"utf8"));
  assert.deepEqual((await db.query(`select * from public.profiles where id='${admin}'`)).rows[0], original);
  for (let i=0;i<ids.length;i++) await db.query("insert into auth.users values($1,$2,$3)",[ids[i],`test${i}@example.test`,JSON.stringify({nc_access_request:true,name:`Pessoa ${i}`,username:`user${i}`,requested_role:i===0?'OPERADOR':'LIDER'})]);
  await assert.rejects(db.query("insert into auth.users values(gen_random_uuid(),'duplicate@example.test',$1)",[JSON.stringify({nc_access_request:true,name:'Duplicado',username:'USER0',requested_role:'OPERADOR'})]));
  await assert.rejects(db.query("insert into auth.users values(gen_random_uuid(),'test0@example.test',$1)",[JSON.stringify({nc_access_request:true,name:'Duplicado',username:'othername',requested_role:'OPERADOR'})]));
  await assert.rejects(db.query("insert into auth.users values(gen_random_uuid(),'invalid@example.test',$1)",[JSON.stringify({nc_access_request:true,name:'Inválido',username:'invalid',requested_role:'ADMIN'})]));
  const reqs = (await db.query<{id:string;auth_user_id:string}>("select id,auth_user_id from public.access_requests order by username")).rows;
  const as = async(id:string) => { await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`); };
  const count = async(sql:string) => Number((await db.query<{n:number}>(sql)).rows[0].n);
  await as(ids[0]);
  assert.equal(await count('select count(*) n from public.occurrences'),0);
  assert.equal(await count('select count(*) n from public.access_requests'),0);
  assert.equal(await count('select count(*) n from public.error_types'),0);
  await assert.rejects(db.query("select public.dashboard_v2('{}','day')"));
  await assert.rejects(db.query("select public.decide_access_request($1,'APROVADO','OPERADOR')",[reqs[0].id]));
  await as(admin);
  assert.equal(await count("select count(*) n from public.access_requests where status='PENDENTE'"),4);
  await assert.rejects(db.query("select public.decide_access_request($1,'APROVADO','ADMIN')",[reqs[0].id]));
  await db.query("select public.decide_access_request($1,'APROVADO','OPERADOR')",[reqs[0].id]);
  await db.query("select public.decide_access_request($1,'APROVADO','LIDER')",[reqs[1].id]);
  await db.query("select public.decide_access_request($1,'APROVADO','OPERADOR')",[reqs[2].id]);
  await db.query("select public.decide_access_request($1,'RECUSADO',null,'Sem vínculo confirmado')",[reqs[3].id]);
  await assert.rejects(db.query("select public.decide_access_request($1,'APROVADO','OPERADOR')",[reqs[0].id]));
  assert.equal(await count("select count(*) n from public.access_requests where status='PENDENTE'"),0);
  assert.equal(await count("select count(*) n from public.audit_logs where action='ACCESS_REQUEST_CREATED'"),4);
  assert.equal(await count("select count(*) n from public.audit_logs where action='ACCESS_REQUEST_APPROVED'"),3);
  assert.equal(await count("select count(*) n from public.audit_logs where action='ACCESS_REQUEST_REJECTED'"),1);
  assert.equal(await count(`select count(*) n from public.profiles where id='${ids[2]}' and role='OPERADOR'`),1);
  await db.exec(`update public.profiles set role='ADMIN' where id='${ids[2]}'; update public.profiles set active=false where id='${ids[2]}';`);
  assert.equal(await count("select count(*) n from public.audit_logs where action='USER_ROLE_CHANGED'"),1);
  assert.equal(await count("select count(*) n from public.audit_logs where action='USER_DEACTIVATED'"),1);
  for (const id of [ids[0],ids[1],ids[2],ids[3]]) { await as(id); assert.equal(await count('select count(*) n from public.access_requests'),0); }
  await as(ids[3]); await assert.rejects(db.query("select public.dashboard_v2('{}','day')"));
  await as(admin);
  await db.exec("insert into public.canalizacoes(name) values('Real test channel');");
  await db.exec(`insert into public.occurrences(id,occurred_at,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status) select gen_random_uuid(),'2026-10-02T14:00:00-03:00',' Person.Test ',1,(select id from public.error_types limit 1),(select id from public.shifts limit 1),(select id from public.canalizacoes limit 1),'PENDENTE' from generate_series(1,5);`);
  await db.exec(`insert into public.occurrences(id,occurred_at,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status) select gen_random_uuid(),'2026-10-01T23:59:00-03:00','Other',1,(select id from public.error_types limit 1),(select id from public.shifts limit 1),(select id from public.canalizacoes limit 1),'RESOLVIDO';`);
  const dashboard = async(f:object,g='day') => (await db.query<{d:Record<string,unknown>}>("select public.dashboard_v2($1,$2) d",[JSON.stringify(f),g])).rows[0].d;
  const d=await dashboard({from:'2026-10-02',to:'2026-10-02'});
  assert.equal(d.total,5); assert.equal(d.pending,5); assert.equal(d.alerts,1);
  assert.equal((d.previous as {total:number}).total,1);
  assert.deepEqual(d.users,[{name:'person.test',total:5}]);
  assert.equal((d.heatmap as {hour:number;total:number}[])[0].hour,14);
  assert.equal((d.heatmap as {total:number}[])[0].total,5);
  assert.equal((d.latest as unknown[]).length,5);
  const empty=await dashboard({from:'2026-10-02',to:'2026-10-02',status:'RESOLVIDO'});
  assert.equal(empty.total,0); assert.deepEqual(empty.errors,[]); assert.deepEqual(empty.heatmap,[]); assert.deepEqual(empty.latest,[]);
  for (const key of ['error_type_id','shift_id','canalizacao_id']) {
    const filtered=await dashboard({from:'2026-10-02',to:'2026-10-02',[key]:'99999999-9999-4999-8999-999999999999'});
    assert.equal(filtered.total,0);assert.equal(filtered.alerts,0);assert.deepEqual(filtered.users,[]);assert.deepEqual(filtered.latest,[]);assert.deepEqual(filtered.heatmap,[]);assert.equal((filtered.previous as {total:number}).total,0);
  }
  const span=await dashboard({from:'2026-09-01',to:'2026-10-02'});
  assert.equal((span.series as unknown[]).length,32);
  assert.equal((await dashboard({from:'2026-09-01',to:'2026-10-02'},'week')).grouping,'week');
  assert.equal((await dashboard({from:'2026-09-01',to:'2026-10-02'},'month')).grouping,'month');
  assert.equal((await db.query<{d:unknown[]}>("select public.export_occurrences('{}') d")).rows[0].d.length,6);
  await as(ids[1]); assert.equal((await dashboard({from:'2026-10-02',to:'2026-10-02'})).total,5);
  await as(ids[0]); await assert.rejects(dashboard({from:'2026-10-02',to:'2026-10-02'}));
  assert.equal(await count('select count(*) n from public.occurrences'),0);
  await db.close();
});
