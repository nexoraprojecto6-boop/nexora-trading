import assert from "node:assert/strict";
import { mkdtemp, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "../dist/db/migrate.js";
import { createDatabase } from "../dist/db/pool.js";
import { buildApp } from "../dist/app.js";
import { AppError } from "@nexora/shared";

import { testDatabaseUrl } from "./helpers.mjs";

const URL_ = testDatabaseUrl();
if (URL_ === undefined) {
  console.log("TEST_DATABASE_URL não definida: testes com base de dados ignorados.");
  process.exit(0);
}
const MIG_DIR = fileURLToPath(new URL("../../../infrastructure/db/migrations", import.meta.url));
const CLI = fileURLToPath(new URL("../dist/db/migrate-cli.js", import.meta.url));

// ---- integração real ----
const admin = new pg.Client({ connectionString: URL_ }); await admin.connect();
await admin.query("drop schema public cascade; create schema public;");
const dir = await mkdtemp(join(tmpdir(), "mig-"));
await cp(MIG_DIR, dir, { recursive: true });
await writeFile(join(dir, "0003_tabela_teste.sql"), "create table teste (id serial primary key, updated_at timestamptz not null default now(), v int);\ncreate trigger t before update on teste for each row execute function set_updated_at();");
const cfg = { connectionString: URL_, ssl: "disable" };

let r = await runMigrations(cfg, dir); assert.ok(r.ok, r.error?.message); assert.deepEqual(r.value.applied, ["0001_funcao_updated_at", "0002_autenticacao", "0003_tabela_teste"]);
r = await runMigrations(cfg, dir); assert.deepEqual(r.value.applied, []); assert.equal(r.value.alreadyApplied, 3);
await admin.query("insert into teste(v) values (1)"); const before = (await admin.query("select updated_at from teste")).rows[0].updated_at;
await new Promise((x) => setTimeout(x, 20)); await admin.query("update teste set v=2"); const after = (await admin.query("select updated_at from teste")).rows[0].updated_at;
assert.ok(after > before, "trigger set_updated_at deve funcionar");

// falha faz rollback total
await writeFile(join(dir, "0004_falha.sql"), "create table nao_deve_existir (id int);\nselect * from tabela_inexistente;");
r = await runMigrations(cfg, dir); assert.equal(r.ok, false); assert.match(r.error.message, /0004_falha/); assert.equal(r.error.details.pgCode, "42P01");
assert.equal((await admin.query("select to_regclass('nao_deve_existir') as t")).rows[0].t, null);
assert.equal((await admin.query("select count(*)::int n from schema_migrations")).rows[0].n, 3);
await import("node:fs/promises").then((fs) => fs.rm(join(dir, "0004_falha.sql")));

// checksum alterado é recusado
await writeFile(join(dir, "0003_tabela_teste.sql"), "-- alterado\ncreate table teste2 (id int);");
r = await runMigrations(cfg, dir); assert.equal(r.ok, false); assert.match(r.error.message, /alterada/);
await writeFile(join(dir, "0003_tabela_teste.sql"), "create table teste (id serial primary key, updated_at timestamptz not null default now(), v int);\ncreate trigger t before update on teste for each row execute function set_updated_at();");

// execuções concorrentes: aplica uma só vez
await admin.query("drop schema public cascade; create schema public;");
const results = await Promise.all([runMigrations(cfg, dir), runMigrations(cfg, dir), runMigrations(cfg, dir)]);
assert.ok(results.every((x) => x.ok), results.map((x) => x.error?.message).join()); assert.equal(results.reduce((n, x) => n + x.value.applied.length, 0), 3);

// nome inválido
await writeFile(join(dir, "Mau Nome.sql"), "select 1");
r = await runMigrations(cfg, dir); assert.equal(r.ok, false); assert.match(r.error.message, /Nome de migração inválido/);
await import("node:fs/promises").then((fs) => fs.rm(join(dir, "Mau Nome.sql")));

// URL errado: erro sem vazar credenciais
r = await runMigrations({ connectionString: "postgresql://u:SEGREDO@127.0.0.1:1/x", ssl: "disable" }, dir);
assert.equal(r.ok, false); assert.ok(!JSON.stringify(r.error.toJSON()).includes("SEGREDO")); assert.ok(!r.error.message.includes("SEGREDO"));

// ---- /ready ----
const base = { nodeEnv: "test", logLevel: "error", host: "127.0.0.1", port: 0, database: undefined };
let app = await await buildApp(base); await app.ready();
let res = await app.inject({ url: "/ready" }); assert.equal(res.statusCode, 503); assert.deepEqual(res.json(), { status: "unavailable", checks: { database: "not_configured" } }); await app.close();

const db = createDatabase(cfg, () => {});
app = await await buildApp(base, { database: db }); await app.ready();
res = await app.inject({ url: "/ready" }); assert.equal(res.statusCode, 200); assert.deepEqual(res.json(), { status: "ok", checks: { database: "ok" } });
await app.close(); // fecha o pool

const down = { ping: async () => ({ ok: false, error: new AppError("UPSTREAM", "connect ECONNREFUSED 10.0.0.5:5432 SEGREDO") }), close: async () => {} };
app = await await buildApp(base, { database: down }); await app.ready();
res = await app.inject({ url: "/ready" }); assert.equal(res.statusCode, 503); assert.ok(!res.body.includes("SEGREDO") && !res.body.includes("10.0.0.5")); await app.close();

// ---- CLI ----
await admin.query("drop schema public cascade; create schema public;");
const run = (env) => new Promise((resolve) => { const p = spawn("node", [CLI], { env: { PATH: process.env.PATH, ...env } }); let o = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d)); p.on("exit", (code) => resolve({ code, o })); });
let o = await run({ DATABASE_URL: URL_ }); assert.equal(o.code, 0, o.o); assert.match(o.o, /Aplicadas 2: 0001_funcao_updated_at, 0002_autenticacao/);
o = await run({ DATABASE_URL: URL_ }); assert.equal(o.code, 0); assert.match(o.o, /Nada a aplicar \(2 já aplicadas\)/);
o = await run({}); assert.equal(o.code, 1); assert.match(o.o, /DATABASE_URL em falta/);
o = await run({ DATABASE_URL: "postgresql://u:SEGREDO@127.0.0.1:1/x" }); assert.equal(o.code, 1); assert.ok(!o.o.includes("SEGREDO"));

await admin.end();
console.log("TODOS OS TESTES DB PASSARAM");
process.exit(0);
