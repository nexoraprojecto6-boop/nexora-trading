import assert from "node:assert/strict";
import { createApiClient, normalizeApiBase } from "../.test-out/api.js";

assert.equal(normalizeApiBase("https://api.nexoraforex.pro/"), "https://api.nexoraforex.pro");
assert.equal(normalizeApiBase("https://api.nexoraforex.pro"), "https://api.nexoraforex.pro");
assert.equal(normalizeApiBase("http://localhost:3000"), "http://localhost:3000");
assert.equal(normalizeApiBase("http://api.nexoraforex.pro"), undefined);   // http fora de localhost
assert.equal(normalizeApiBase("javascript:alert(1)"), undefined);
assert.equal(normalizeApiBase("https://u:p@x.pro"), undefined);
assert.equal(normalizeApiBase("https://x.pro/?a=1"), undefined);
assert.equal(normalizeApiBase(""), undefined);
assert.equal(normalizeApiBase(undefined), undefined);

const res = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
let seen;
const mk = (fn) => createApiClient("https://api.x.pro", async (u, i) => { seen = { u, i }; return fn(u, i); });

assert.equal(mk(() => res(200, {})).loginUrl, "https://api.x.pro/auth/login");

let c = mk(() => res(200, { user: { id: "u1", accounts: [{ accountId: "CR1", accountType: "real", currency: "USD", status: "active" }] } }));
let s = await c.fetchSession();
assert.equal(s.kind, "authenticated"); assert.equal(s.user.accounts[0].accountId, "CR1");
assert.equal(seen.u, "https://api.x.pro/me"); assert.equal(seen.i.credentials, "include");

assert.equal((await mk(() => res(401, {})).fetchSession()).kind, "anonymous");
s = await mk(() => res(503, {})).fetchSession(); assert.equal(s.kind, "error"); assert.match(s.message, /configurada/);
assert.equal((await mk(() => res(500, {})).fetchSession()).kind, "error");
assert.equal((await mk(() => { throw new TypeError("Failed to fetch"); }).fetchSession()).kind, "error");
assert.equal((await mk(() => res(200, { user: { id: 5, accounts: [] } })).fetchSession()).kind, "error");           // id inválido
assert.equal((await mk(() => res(200, { user: { id: "u", accounts: [{ accountId: "A", accountType: "x" }] } })).fetchSession()).kind, "error");
assert.equal((await mk(() => new Response("não é json", { status: 200 })).fetchSession()).kind, "error");

assert.equal(await mk(() => res(204)).logout(), true);
assert.equal(seen.u, "https://api.x.pro/auth/logout"); assert.equal(seen.i.method, "POST"); assert.equal(seen.i.credentials, "include");
assert.equal(await mk(() => res(403, {})).logout(), false);
assert.equal(await mk(() => { throw new Error("x"); }).logout(), false);
console.log("TODOS OS TESTES DO FRONTEND (api.ts) PASSARAM");
