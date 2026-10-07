import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('official V2 migration, operator restrictions, text routing, history, exact audited cleanup and primary preservation',async()=>{
 const db=new PGlite();try{
 const primary='10000000-0000-4000-8000-000000000001',operator='10000000-0000-4000-8000-000000000002',legacy='10000000-0000-4000-8000-000000000003';
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[primary]);
 for(const [i,id] of [primary,operator,legacy].entries()){await db.query('insert into auth.users(id,email) values($1,$2)',[id,`v2${i}@example.test`]);await db.query('insert into profiles(id,name,email,role,active,created_at) values($1,$2,$3,$4,true,$5)',[id,`V2 ${i}`,`v2${i}@example.test`,['ADMIN','OPERADOR','LIDER'][i],`2026-10-0${i+1}T12:00:00Z`]);}
 await db.exec(await readFile(new URL('../db/access-requests-dashboard.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../db/primary-admin-user-deletion.sql',import.meta.url),'utf8'));
 const original=(await db.query('select * from profiles where id=$1',[primary])).rows[0];
 await db.exec("insert into canalizacoes(name) values(' CH01 ')");
 const insertOld=async(user:string,day:number)=>db.query(`insert into occurrences(id,occurred_at,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status) select gen_random_uuid(),$1::timestamptz,$2,1,(select id from error_types limit 1),(select id from shifts limit 1),(select id from canalizacoes limit 1),'PENDENTE'`,[`2026-10-0${day}T12:00:00Z`,user]);
 for(let i=0;i<7;i++)await insertOld(i%2?' JPrAdEl ':'jpradel',i<5?1:2);
 for(let i=0;i<6;i++)await insertOld(i===0?'jpradel2':'real.user',3);
 // Preserve a historical alert produced under a previous threshold.
 await db.exec("insert into alerts(occurrence_user,period_start,period_end,occurrence_count,status) values('jpradel','2026-10-02T03:00Z','2026-10-03T03:00Z',2,'VISUALIZADO')");
 await db.exec("insert into alert_follow_ups(alert_id,note) select id,'Acompanhamento teste' from alerts where occurrence_user='jpradel' order by period_start limit 1");
 await db.exec(await readFile(new URL('../db/official-v2.sql',import.meta.url),'utf8'));
 const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const n=async(sql:string)=>Number((await db.query<{n:number}>(sql)).rows[0].n);
 await as(primary);await db.query('select prepare_official_v2()');
 assert.equal(await n("select count(*) n from occurrences where canalizacao='CH01'"),13);
 assert.equal(await n("select count(*) n from error_types where normalized_name='outro' and active"),1);
 const others=(await db.query("select * from occurrences where occurrence_user_normalized<>'jpradel' order by id")).rows;
 await as(operator);assert.equal(await n('select count(*) n from occurrences'),0);
 await assert.rejects(db.query("insert into error_types(name) values('Negado')"),/row-level security/);
 await assert.rejects(db.query("insert into canalizacoes(name) values('Negado')"),/row-level security/);
 assert.equal(await n('select count(*) n from audit_logs'),0);
 await assert.rejects(db.query("select dashboard_v2('{}','day')"));
 await assert.rejects(db.query('select prepare_official_v2()'));
 await assert.rejects(db.query("select cleanup_jpradel_tests('REMOVER TESTES J PRADEL V2')"));
 await as(legacy);assert.equal((await db.query<{r:string}>('select private.current_role() r')).rows[0].r,'OPERADOR');await assert.rejects(db.query("select dashboard_v2('{}','day')"));
 await as(primary);
 const removed=(await db.query<{r:{occurrences_removed:number;alerts_removed:number;followups_removed:number}}>("select cleanup_jpradel_tests('REMOVER TESTES J PRADEL V2') r")).rows[0].r;
 assert.deepEqual(removed,{occurrences_removed:7,alerts_removed:2,followups_removed:1});
 assert.equal(await n("select count(*) n from occurrences where occurrence_user_normalized='jpradel'"),0);assert.equal(await n("select count(*) n from alerts where occurrence_user='jpradel'"),0);
 assert.deepEqual((await db.query("select * from occurrences where occurrence_user_normalized<>'jpradel' order by id")).rows,others);
 assert.equal(await n("select count(*) n from audit_logs where action in ('occurrences_DELETE','alerts_DELETE','alert_follow_ups_DELETE')"),10);
 await db.query("select cleanup_jpradel_tests('REMOVER TESTES J PRADEL V2')");
 const add=async(day:number,canal:string)=>db.query(`insert into occurrences(id,occurred_at,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao,status) select gen_random_uuid(),$1::timestamptz,' Bob ',1,(select id from error_types where normalized_name='outro'),(select id from shifts limit 1),$2,'PENDENTE'`,[`2026-10-0${day}T12:00:00Z`,canal]);
 await as(operator);for(let i=0;i<5;i++)await add(4,i%2?' ch01 ':'CH01');
 await as(primary);assert.equal(await n("select count(*) n from alerts where occurrence_user='bob' and active"),1);
 const dashboard=(await db.query<{r:{total:number;routing:{total:number}[]}}>(`select dashboard_v2('{"from":"2026-10-04","to":"2026-10-04","canalizacao":" Ch01 "}','day') r`)).rows[0].r;assert.equal(dashboard.total,5);assert.equal(dashboard.routing.length,1);assert.equal(dashboard.routing[0].total,5);
 await db.exec("insert into alert_follow_ups(alert_id,note) select id,'Acompanhamento real' from alerts where occurrence_user='bob'");
 await as(operator);await add(4,'CH01');for(let i=0;i<5;i++)await add(5,'CH01');
 await as(primary);assert.equal(await n("select count(*) n from alerts where occurrence_user='bob' and active"),1);assert.equal(await n("select count(*) n from alerts where occurrence_user='bob' and status='ACOMPANHAMENTO_REALIZADO' and occurrence_count=5 and not active"),1);
 const exp=(await db.query<{r:{canalizacao:string}[]}>(`select export_occurrences('{"canalizacao":"ch01"}') r`)).rows[0].r;assert(exp.length>0);assert(exp.every(x=>typeof x.canalizacao==='string'));
 await assert.rejects(db.query("update profiles set role='LIDER' where id=$1",[operator]),/Legacy role/);
 await db.query("update profiles set role='ADMIN' where id=$1",[legacy]);assert.equal(await n("select count(*) n from audit_logs where action='USER_ROLE_CHANGED'"),1);
 assert.deepEqual((await db.query('select * from profiles where id=$1',[primary])).rows[0],original);
 await db.exec('reset role');await assert.rejects(db.query("insert into auth.users values(gen_random_uuid(),'newleader@example.test',$1)",[JSON.stringify({nc_access_request:true,name:'New Leader',username:'newleader',requested_role:'LIDER'})]),/Invalid requested role/);
 }finally{await db.close();}
});
