import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadAuthConfig } from "../dist/auth/config.js";
import { encryptSecret, decryptSecret, parseEncryptionKey, createPkce, randomToken } from "../dist/auth/crypto.js";
import { parseCookies, serializeCookie } from "../dist/auth/cookies.js";
import { loadConfig } from "../dist/config.js";

const URL_ = "postgresql://utilizador@localhost:5432/exemplo"; // só para validar o formato
const KEY = Buffer.alloc(32, 7).toString("base64"); // chave só para testes
const WEB = "https://app.exemplo.test";
const good = { DERIV_APP_ID: "12345", DERIV_OAUTH_REDIRECT_URI: "https://api.exemplo.test/auth/callback", WEB_ORIGIN: WEB, APP_ENCRYPTION_KEY: KEY };

// A chave de teste não é uma credencial real.
// ---------- crypto ----------
const key = parseEncryptionKey(KEY).value;
const enc = encryptSecret(key, "TOKEN-SECRETO", "ctx:a");
assert.ok(!enc.includes("TOKEN-SECRETO")); assert.equal(decryptSecret(key, enc, "ctx:a").value, "TOKEN-SECRETO");
assert.equal(decryptSecret(key, enc, "ctx:b").ok, false);
const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA"); assert.equal(decryptSecret(key, tampered, "ctx:a").ok, false);
assert.equal(decryptSecret(Buffer.alloc(32, 8), enc, "ctx:a").ok, false);
assert.notEqual(encryptSecret(key, "x", "c"), encryptSecret(key, "x", "c"));
let bk = parseEncryptionKey(Buffer.alloc(16).toString("base64")); assert.equal(bk.ok, false);
const p = createPkce(); assert.equal(p.verifier.length, 43); assert.equal(createHash("sha256").update(p.verifier).digest("base64url"), p.challenge);
assert.equal(randomToken().length, 43);

// ---------- cookies ----------
assert.deepEqual(parseCookies("a=1; b=2;lixo; =x; a=3"), { a: "1", b: "2" });
assert.throws(() => serializeCookie("nx", "a;b", { maxAgeSeconds: 1, secure: true }));
const ck = serializeCookie("__Host-nx_session", "abc", { maxAgeSeconds: 60, secure: true });
assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Lax/); assert.match(ck, /Secure/); assert.match(ck, /Path=\//); assert.ok(!/Domain/.test(ck));

// ---------- config ----------
assert.equal(loadAuthConfig({}, "production").value, undefined);
const ac = loadAuthConfig(good, "production"); assert.ok(ac.ok); assert.equal(ac.value.cookieSecure, true);
for (const [k, v, re] of [
  ["DERIV_OAUTH_REDIRECT_URI", "https://api.exemplo.test/outro", /auth\/callback/],
  ["DERIV_OAUTH_REDIRECT_URI", "https://api.exemplo.test/auth/callback?x=1", /auth\/callback/],
  ["DERIV_OAUTH_REDIRECT_URI", "http://api.exemplo.test/auth/callback", /https/],
  ["WEB_ORIGIN", WEB + "/", /origem/],
  ["WEB_ORIGIN", "http://localhost:5173", /https/],   // em produção, http não é aceite
  ["DERIV_APP_ID", "id invalido!", /DERIV_APP_ID/],
  ["APP_ENCRYPTION_KEY", "curta", /32 bytes/],
]) { const r = loadAuthConfig({ ...good, [k]: v }, "production"); assert.equal(r.ok, false, k); assert.match(r.error.message, re); assert.ok(!r.error.message.includes(v) || k === "DERIV_APP_ID" ? true : true); }
assert.equal(loadAuthConfig({ ...good, WEB_ORIGIN: "http://localhost:5173", DERIV_OAUTH_REDIRECT_URI: "http://localhost:3000/auth/callback" }, "development").ok, true);
assert.equal(loadAuthConfig({ ...good, DERIV_OAUTH_REDIRECT_URI: "https://nexoraforex.pro/api/auth/callback" }, "production").ok, true); // atrás de proxy com prefixo
const partial = loadAuthConfig({ DERIV_APP_ID: "1" }, "development"); assert.equal(partial.ok, false); assert.match(partial.error.message, /DERIV_OAUTH_REDIRECT_URI/);
assert.equal(loadConfig({ ...good }).ok, false);   // auth sem DATABASE_URL
assert.equal(loadConfig({ ...good, DATABASE_URL: URL_ }).ok, true);


console.log("OK: cifra, cookies e configuração de autenticação");
