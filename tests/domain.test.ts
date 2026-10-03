import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  normalizeUser,
  exceedsLimit,
  csvCell,
  operationalDate,
} from "../lib/domain.ts";

test("normalization, strict threshold, CSV formula protection and São Paulo date", () => {
  assert.equal(normalizeUser(" JOAO.SILVA "), "joao.silva");
  assert.equal(exceedsLimit(4, 4), false);
  assert.equal(exceedsLimit(5, 4), true);
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(operationalDate("2026-10-02T01:00:00Z"), "2026-10-01");
});

test("PostgreSQL integration: RLS, audits, recurrence, edits, inactive accounts and catalogs", async () => {
  const db = new PGlite();
  const admin = "10000000-0000-4000-8000-000000000001";
  const operator = "10000000-0000-4000-8000-000000000002";
  const leader = "10000000-0000-4000-8000-000000000003";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    `insert into auth.users values('${admin}'),('${operator}'),('${leader}');select set_config('request.jwt.claim.sub','${admin}',false);insert into public.profiles(id,name,email,role,active) values('${admin}','Admin teste','admin@ncsorter.local','ADMIN',true),('${operator}','Maria teste','operador@ncsorter.local','OPERADOR',true),('${leader}','Líder teste','lider@ncsorter.local','LIDER',true);set role authenticated;`,
  );
  await db.exec(`insert into public.canalizacoes(name) values('CANAL TESTE');`);
  const error = (
    await db.query<{ id: string }>(
      `select id from public.error_types where name='Missort'`,
    )
  ).rows[0].id;
  const shift = (
    await db.query<{ id: string }>(
      `select id from public.shifts where name='T1'`,
    )
  ).rows[0].id;
  const canal = (
    await db.query<{ id: string }>(
      `select id from public.canalizacoes where name='CANAL TESTE'`,
    )
  ).rows[0].id;
  const as = async (id: string) =>
    db.exec(`select set_config('request.jwt.claim.sub','${id}',false)`);
  const scalar = async (sql: string) =>
    (await db.query<{ n: number }>(sql)).rows[0].n;
  const insert = async (
    n: number,
    user = " Joao.Silva ",
    status = "PENDENTE",
  ) =>
    db.exec(
      `insert into public.occurrences(id,occurred_at,package_id,hu,occurrence_user,package_quantity,error_type_id,shift_id,canalizacao_id,status) values('20000000-0000-4000-8000-${String(n).padStart(12, "0")}','2026-10-01T14:32:00-03:00','PKG-${n}','HU-${n}','${user}',1,'${error}','${shift}','${canal}','${status}')`,
    );
  await as(operator);
  for (let n = 1; n <= 4; n++) await insert(n);
  await as(leader);
  assert.equal(
    Number(await scalar("select count(*) as n from public.alerts")),
    0,
  );
  await as(operator);
  await insert(5, "JOAO.SILVA", "RESOLVIDO");
  await as(leader);
  assert.equal(
    Number(
      await scalar("select count(*) as n from public.alerts where active"),
    ),
    1,
  );
  assert.equal(
    await scalar("select occurrence_count as n from public.alerts"),
    5,
  );
  await insert(6, "joao.silva", "EM_ANDAMENTO");
  assert.equal(
    Number(await scalar("select count(*) as n from public.alerts")),
    1,
  );
  assert.equal(
    await scalar("select occurrence_count as n from public.alerts"),
    6,
  );
  assert.equal(
    Number(
      await scalar(
        `select count(*) as n from public.alerts where occurrence_user='Maria teste'`,
      ),
    ),
    0,
  );
  await db.exec(
    `insert into public.alert_follow_ups(alert_id,note) select id,'Orientação operacional de teste' from public.alerts`,
  );
  assert.equal(
    Number(
      await scalar(
        `select count(*) as n from public.alerts where status='ACOMPANHAMENTO_REALIZADO'`,
      ),
    ),
    1,
  );
  await db.exec(
    `update public.occurrences set occurrence_user='novo.usuario' where package_id='PKG-6'`,
  );
  assert.equal(
    await scalar(
      `select occurrence_count as n from public.alerts where occurrence_user='joao.silva'`,
    ),
    5,
  );
  await db.exec(
    `update public.occurrences set occurred_at='2026-10-02T14:32:00-03:00' where package_id='PKG-5'`,
  );
  assert.equal(
    Number(
      await scalar("select count(*) as n from public.alerts where active"),
    ),
    0,
  );
  assert.equal(
    Number(await scalar("select count(*) as n from public.alert_follow_ups")),
    1,
  );
  await assert.rejects(
    db.exec(`insert into public.error_types(name) values(' MISSORT ')`),
  );
  await db.exec(
    `insert into public.error_types(name) values('Erro teste');insert into public.shifts(name,start_time,end_time) values('T4 teste','22:00','06:00');`,
  );
  assert.equal(
    Number(
      await scalar(
        `select count(*) as n from public.filtered_occurrences('{"status":"RESOLVIDO"}')`,
      ),
    ),
    1,
  );
  const aggregate = (
    await db.query<{ v: { total: number } }>(
      `select public.dashboard('{}') as v`,
    )
  ).rows[0].v;
  assert.equal(aggregate.total, 6);
  const exported = (
    await db.query<{ v: unknown[] }>(
      `select public.export_occurrences('{"status":"RESOLVIDO"}') as v`,
    )
  ).rows[0].v;
  assert.equal(exported.length, 1);
  assert.equal(
    Number(
      await scalar(
        `select count(*) as n from (select * from public.filtered_occurrences('{}') order by occurred_at,id limit 2 offset 2) p`,
      ),
    ),
    2,
  );
  assert.equal(
    Number(
      await scalar(
        `select count(*) as n from public.filtered_occurrences('{"from_at":"2026-10-01T00:00:00-03:00","to_at":"2026-10-02T00:00:00-03:00"}')`,
      ),
    ),
    5,
  );
  await assert.rejects(insert(6));

  assert.equal(
    Number(
      await scalar(`select count(*) as n from public.suggest_users('joa')`),
    ),
    1,
  );
  await as(operator);
  assert.equal(
    Number(await scalar("select count(*) as n from public.occurrences")),
    5,
  );
  assert.equal(
    Number(await scalar("select count(*) as n from public.alerts")),
    0,
  );
  await assert.rejects(
    db.exec(`insert into public.error_types(name) values('Sem permissão')`),
  );
  await db.exec(
    `update public.profiles set role='ADMIN' where id='${operator}'`,
  );
  assert.equal(
    (
      await db.query<{ role: string }>(
        `select role from public.profiles where id='${operator}'`,
      )
    ).rows[0].role,
    "OPERADOR",
  );
  await assert.rejects(db.exec("delete from public.audit_logs"));
  await assert.rejects(
    db.exec(
      `insert into public.audit_logs(action,entity,record_id) values('FORGED','occurrences','x')`,
    ),
  );
  await as(admin);
  await assert.rejects(
    db.exec(`update public.profiles set active=false where id='${admin}'`),
  );
  await db.exec(
    "update public.system_settings set recurrence_limit=3 where id=true",
  );
  assert.equal(
    Number(
      await scalar("select count(*) as n from public.alerts where active"),
    ),
    1,
  );
  assert.ok(
    Number(
      await scalar(
        `select count(*) as n from public.audit_logs where action='OCORRENCIA_CRIADA'`,
      ),
    ) >= 6,
  );
  await db.exec(
    `update public.canalizacoes set active=false where id='${canal}'`,
  );
  await as(operator);
  await assert.rejects(insert(7));
  await as(admin);
  await db.exec(
    `update public.profiles set active=false where id='${operator}'`,
  );
  await as(operator);
  assert.equal(
    Number(await scalar("select count(*) as n from public.occurrences")),
    0,
  );
  await assert.rejects(insert(8));
  await db.close();
});
