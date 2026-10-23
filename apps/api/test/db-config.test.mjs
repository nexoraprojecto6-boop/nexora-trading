import assert from "node:assert/strict";
import { loadDatabaseConfig } from "../dist/db/config.js";
import { planMigrations, runMigrations, checksumOf } from "../dist/db/migrate.js";
import { loadConfig } from "../dist/config.js";

const URL_ = "postgresql://utilizador@localhost:5432/exemplo"; // só para validar o formato; nunca é usado para ligar

// ---- config ----
let c = loadDatabaseConfig({ DATABASE_URL: URL_ + "?sslmode=require&application_name=x" }, "development");
assert.ok(c.ok); assert.ok(!c.value.connectionString.includes("sslmode")); assert.ok(c.value.connectionString.includes("application_name=x")); assert.equal(c.value.ssl, "disable");
assert.equal(loadDatabaseConfig({ DATABASE_URL: URL_ }, "production").value.ssl, "verify");
assert.equal(loadDatabaseConfig({ DATABASE_URL: URL_, DATABASE_SSL: "NO-VERIFY" }, "production").value.ssl, "no-verify");
assert.equal(loadDatabaseConfig({}, "production").ok, false);
assert.equal(loadDatabaseConfig({}, "development").value, undefined);
let bad = loadDatabaseConfig({ DATABASE_URL: "mysql://u:SEGREDO@h/db" }, "development"); assert.equal(bad.ok, false); assert.ok(!bad.error.message.includes("SEGREDO"));
bad = loadDatabaseConfig({ DATABASE_URL: "nao e url SEGREDO" }, "development"); assert.equal(bad.ok, false); assert.ok(!bad.error.message.includes("SEGREDO"));
assert.equal(loadDatabaseConfig({ DATABASE_URL: URL_, DATABASE_SSL: "x" }, "development").ok, false);
assert.equal(loadConfig({ NODE_ENV: "production" }).ok, false);

// ---- planMigrations ----
const f = (v, sql = "select 1") => ({ version: v, sql, checksum: checksumOf(sql) });
assert.equal(planMigrations([f("0001_a"), f("0002_b")], [{ version: "0001_a", checksum: checksumOf("select 1") }]).value.length, 1);
assert.equal(planMigrations([f("0001_a", "x")], [{ version: "0001_a", checksum: "outro" }]).ok, false);
assert.equal(planMigrations([], [{ version: "0001_a", checksum: "x" }]).ok, false);
assert.equal(planMigrations([f("0001_a"), f("0001_b")], []).ok, false);
assert.equal(planMigrations([f("0001_a"), f("0002_b"), f("0003_c")], [{ version: "0001_a", checksum: checksumOf("select 1") }, { version: "0003_c", checksum: checksumOf("select 1") }]).ok, false);


console.log("OK: configuração da base de dados e planeamento de migrações");
