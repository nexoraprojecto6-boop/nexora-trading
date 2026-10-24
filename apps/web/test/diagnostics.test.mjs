import assert from "node:assert/strict";
import { diagnose } from "../.test-out/diagnostics.js";

const base = { base: "https://api.x.pro", pageOrigin: "https://www.x.pro", buildTime: "2026-10-26T10:00:00.000Z", violations: [] };
const calls = [];
const mk = (handler) => async (url, init) => { calls.push({ url, init }); return handler(url, init); };
const ok = (status = 200) => new Response("{}", { status });

// tudo bem
let lines = await diagnose({ ...base, fetchFn: mk((u) => ok(u.endsWith("/me") ? 401 : 200)) });
assert.match(lines.join("\n"), /Versão do site: 2026-10-26/);
assert.ok(lines.includes("1) Ligação à API: OK")); assert.match(lines.join("\n"), /2\) CORS: OK/); assert.match(lines.join("\n"), /3\) \/me com cookies: OK \(estado 401/);
assert.ok(lines.includes("CSP: nenhuma violação registada"));
assert.equal(calls.find((c) => c.url.endsWith("/me")).init.credentials, "include");

// ligação básica falha (DNS/rede/CSP): pára no passo 1
calls.length = 0;
lines = await diagnose({ ...base, fetchFn: mk(() => { throw new TypeError("Failed to fetch"); }) });
assert.match(lines.join("\n"), /1\) Ligação à API: FALHOU/); assert.equal(calls.length, 1); assert.ok(!lines.some((l) => l.startsWith("2)")));

// CORS bloqueado: o passo 1 (no-cors) passa e o passo 2 falha, e a mensagem diz a origem exata
lines = await diagnose({ ...base, fetchFn: mk((u, init) => { if (init?.mode === "no-cors") return ok(); throw new TypeError("Failed to fetch"); }) });
assert.ok(lines.includes("1) Ligação à API: OK")); assert.match(lines.join("\n"), /2\) CORS: BLOQUEADO.*https:\/\/www\.x\.pro/); assert.ok(!lines.some((l) => l.startsWith("3)")));

// CORS com credenciais falha só no passo 3
lines = await diagnose({ ...base, fetchFn: mk((u, init) => { if (init?.credentials === "include") throw new TypeError("x"); return ok(); }) });
assert.match(lines.join("\n"), /3\) \/me com cookies: FALHOU/);

// violações de CSP são mostradas (no máximo 5)
const v = Array.from({ length: 8 }, (_, i) => ({ directive: "connect-src", blockedUri: `https://a${i}.pro` }));
lines = await diagnose({ ...base, violations: v, fetchFn: mk(() => ok()) });
assert.equal(lines.filter((l) => l.startsWith("CSP bloqueou:")).length, 5); assert.ok(lines.includes("CSP bloqueou: connect-src -> https://a0.pro"));

// nunca expõe cookies/tokens: só endereços públicos e estados
assert.ok(!lines.join("\n").toLowerCase().includes("cookie:"));
console.log("OK: diagnóstico");
