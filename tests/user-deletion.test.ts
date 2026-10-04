import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { accessRequestSchema } from "../schemas/access-request.ts";
import { passwordLengthSchema } from "../schemas/password.ts";

test("password limits accept eight characters and preserve signup complexity", () => {
  assert.equal(passwordLengthSchema.safeParse("Aa123456").success, true);
  assert.equal(passwordLengthSchema.safeParse("Aa12345").success, false);
  assert.equal(passwordLengthSchema.safeParse("a".repeat(128)).success, true);
  assert.equal(passwordLengthSchema.safeParse("a".repeat(129)).success, false);
  const registration = { name:"Pessoa teste", email:"test@example.test", username:"test.user", requested_role:"OPERADOR", password:"Aa123456", confirm_password:"Aa123456" };
  assert.equal(accessRequestSchema.safeParse(registration).success,true);
  assert.equal(accessRequestSchema.safeParse({...registration,password:"abcdefgh",confirm_password:"abcdefgh"}).success,false);
});

test("only the immutable primary administrator can delete access; history and session RLS are preserved", async () => {
  const db = new PGlite();
  try {
    const ids=[1,2,3,4].map(n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
    const [primary,secondary,operator,leader]=ids;
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[primary]);
    for(let i=0;i<ids.length;i++) {
      await db.query('insert into auth.users(id,email) values($1,$2)',[ids[i],`person${i}@example.test`]);
      await db.query('insert into public.profiles(id,name,email,role,active,created_at) values($1,$2,$3,$4,true,$5)',[ids[i],`Person ${i}`,`person${i}@example.test`,['ADMIN','ADMIN','OPERADOR','LIDER'][i],`2026-10-0${i+1}T12:00:00Z`]);
    }
    await db.exec(await readFile(new URL('../db/access-requests-dashboard.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../db/primary-admin-user-deletion.sql',import.meta.url),'utf8'));
    const original=(await db.query('select * from public.profiles where id=$1',[primary])).rows[0];
    const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const caps=async()=> (await db.query<{value:{can_delete:boolean;primary_admin_id:string}}>('select public.user_admin_capabilities() value')).rows[0].value;
    const remove=(id:string,email:string)=>db.query('select public.delete_user_access($1,$2)',[id,email]);
    await as(primary);
    assert.deepEqual(await caps(),{primary_admin_id:primary,can_delete:true});
    await db.exec("insert into public.canalizacoes(name) values('Canal teste')");
    await as(operator);
    await db.exec(`insert into public.occurrences(id,occurred_at,package_id,hu,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status) select '20000000-0000-4000-8000-000000000001',now(),'','','pessoa',1,(select id from public.error_types limit 1),(select id from public.shifts limit 1),(select id from public.canalizacoes limit 1),'PENDENTE'`);
    for(const actor of [secondary,operator,leader]) {
      await as(actor); await assert.rejects(remove(operator,'person2@example.test'),/Primary administrator required/);
      if(actor===secondary) assert.equal((await caps()).can_delete,false);
      else await assert.rejects(caps(),/Administrator required/);
    }
    await as(secondary);
    await assert.rejects(db.query('update public.profiles set active=false where id=$1',[primary]),/protected/);
    await assert.rejects(db.query("update public.profiles set role='OPERADOR' where id=$1",[primary]),/protected/);
    await assert.rejects(db.query('update private.app_ownership set primary_admin_user_id=$1',[secondary]),/permission denied/);
    await assert.rejects(db.query('update public.profiles set deleted_at=now() where id=$1',[operator]),/permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(remove(operator,'person2@example.test'),/permission denied/);
    await as(primary);
    await assert.rejects(remove(primary,'person0@example.test'),/cannot be deleted/);
    await assert.rejects(remove(operator,'wrong@example.test'),/does not match/);
    await remove(operator,'PERSON2@example.test');
    await remove(operator,'person2@example.test');
    const deleted=(await db.query<{active:boolean;deleted_at:string;deleted_by_user_id:string}>('select active,deleted_at,deleted_by_user_id from public.profiles where id=$1',[operator])).rows[0];
    assert.equal(deleted.active,false);assert.ok(deleted.deleted_at);assert.equal(deleted.deleted_by_user_id,primary);
    assert.equal(Number((await db.query<{n:number}>("select count(*) n from public.audit_logs where action='USER_DELETED'")).rows[0].n),1);
    assert.equal(Number((await db.query<{n:number}>('select count(*) n from public.occurrences')).rows[0].n),1);
    assert.equal(Number((await db.query<{n:number}>('select count(*) n from public.profiles where deleted_at is null')).rows[0].n),3);
    await assert.rejects(db.query('update public.profiles set active=true where id=$1',[operator]),/cannot be restored/);
    await assert.rejects(db.query('delete from public.profiles where id=$1',[operator]),/permission denied/);
    await as(operator);
    assert.equal((await db.query('select private.current_role() role')).rows[0].role,null);
    assert.equal(Number((await db.query<{n:number}>('select count(*) n from public.occurrences')).rows[0].n),0);
    await assert.rejects(db.query("select public.dashboard_v2('{}','day')"),/Leader required/);
    await as(primary);
    await remove(secondary,'person1@example.test');
    assert.deepEqual((await db.query('select * from public.profiles where id=$1',[primary])).rows[0],original);
  } finally { await db.close(); }
});
