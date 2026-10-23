import assert from "node:assert/strict";
import { loadConfig } from "../dist/config.js";
import { buildApp } from "../dist/app.js";
import { AppError } from "@nexora/shared";

// config
const d = loadConfig({}); assert.ok(d.ok); assert.deepEqual(d.value, { nodeEnv: "development", logLevel: "info", host: "0.0.0.0", port: 3000, database: undefined, auth: undefined });
assert.equal(loadConfig({ PORT: "abc" }).ok, false);
const bad = loadConfig({ LOG_LEVEL: "SEGREDO123" }); assert.equal(bad.ok, false); assert.ok(!bad.error.message.includes("SEGREDO123"));
assert.equal(loadConfig({ NODE_ENV: "production", PORT: "8080", API_HOST: "127.0.0.1", DATABASE_URL: "postgresql://u:p@h/d" }).value.port, 8080);

const app = await buildApp({ nodeEnv: "test", logLevel: "error", host: "127.0.0.1", port: 0 });
app.get("/boom", async () => { throw new Error("detalhe interno SEGREDO"); });
app.get("/nf", async () => { throw new AppError("NOT_FOUND", "Conta não encontrada."); });
app.get("/cfg", async () => { throw new AppError("CONFIG", "variavel X em falta"); });
app.post("/json", async (req) => req.body);
await app.ready();

let r = await app.inject({ url: "/health" });
assert.equal(r.statusCode, 200);
const b = r.json(); assert.equal(b.status, "ok"); assert.equal(b.service, "nexora-api"); assert.equal(typeof b.uptimeSeconds, "number");
assert.equal(r.headers["x-content-type-options"], "nosniff"); assert.equal(r.headers["cache-control"], "no-store");

r = await app.inject({ url: "/nao-existe" }); assert.equal(r.statusCode, 404); assert.equal(r.json().error.code, "NOT_FOUND");
r = await app.inject({ url: "/boom" }); assert.equal(r.statusCode, 500); assert.ok(!r.body.includes("SEGREDO")); assert.equal(r.json().error.code, "INTERNAL");
r = await app.inject({ url: "/nf" }); assert.equal(r.statusCode, 404); assert.equal(r.json().error.message, "Conta não encontrada.");
r = await app.inject({ url: "/cfg" }); assert.equal(r.statusCode, 500); assert.ok(!r.body.includes("variavel X"));
r = await app.inject({ method: "POST", url: "/json", headers: { "content-type": "application/json" }, payload: "{mau" });
assert.equal(r.statusCode, 400); assert.equal(r.json().error.code, "VALIDATION");
await app.close();

// arranque real + shutdown
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const PORT = String(30000 + Math.floor(Math.random() * 20000));
const p = spawn("node", [MAIN], { env: { ...process.env, PORT, LOG_LEVEL: "error" } });
// Espera até o servidor responder (em vez de uma pausa fixa, que falha com a máquina carregada).
async function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return (await fetch(`http://127.0.0.1:${port}/health`)).status;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((res) => setTimeout(res, 100));
    }
  }
}
assert.equal(await waitForHealth(PORT), 200);
p.kill("SIGTERM"); const code = await new Promise((res) => p.on("exit", res)); assert.equal(code, 0);
const q = spawn("node", [MAIN], { env: { ...process.env, PORT: "xyz" } });
let out = ""; q.stderr.on("data", (d) => (out += d)); const c2 = await new Promise((res) => q.on("exit", res));
assert.equal(c2, 1); assert.ok(out.includes("Configuração inválida") && !out.includes("xyz"));
console.log("TODOS OS TESTES PASSARAM");
