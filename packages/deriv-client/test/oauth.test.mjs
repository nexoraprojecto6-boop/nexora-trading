import assert from "node:assert/strict";
import { buildAuthorizeUrl, createDerivAuthClient } from "../dist/index.js";

const good = { DERIV_OAUTH_REDIRECT_URI: "https://api.exemplo.test/auth/callback" };

// ---------- cliente OAuth (fetch simulado) ----------
const au = new URL(buildAuthorizeUrl({ clientId: "12345", redirectUri: good.DERIV_OAUTH_REDIRECT_URI, scopes: ["trade", "account_manage"], state: "ST", codeChallenge: "CH" }));
assert.equal(au.origin + au.pathname, "https://auth.deriv.com/oauth2/auth");
assert.deepEqual(Object.fromEntries(au.searchParams), { response_type: "code", client_id: "12345", redirect_uri: good.DERIV_OAUTH_REDIRECT_URI, scope: "trade account_manage", state: "ST", code_challenge: "CH", code_challenge_method: "S256" });
const jr = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const input = { clientId: "1", code: "CODIGO-SEGREDO", redirectUri: "https://x/auth/callback", codeVerifier: "VERIFIER-SEGREDO" };
let seen;
let cl = createDerivAuthClient({ fetch: async (u, init) => { seen = { u, init }; return jr(200, { access_token: "AT", token_type: "Bearer", expires_in: 3600.9, refresh_token: "RT", scope: "trade" })(); } });
let t = await cl.exchangeCode(input); assert.deepEqual(t.value, { accessToken: "AT", refreshToken: "RT", expiresInSeconds: 3600, scope: "trade" });
assert.equal(seen.u, "https://auth.deriv.com/oauth2/token"); assert.equal(seen.init.method, "POST");
assert.deepEqual(Object.fromEntries(new URLSearchParams(seen.init.body)), { grant_type: "authorization_code", client_id: "1", code: "CODIGO-SEGREDO", redirect_uri: "https://x/auth/callback", code_verifier: "VERIFIER-SEGREDO" });
assert.equal(seen.init.redirect, "error");
cl = createDerivAuthClient({ fetch: jr(400, { error: "invalid_grant", error_description: "CODIGO-SEGREDO expirou" }) });
t = await cl.exchangeCode(input); assert.equal(t.ok, false); assert.equal(t.error.code, "UNAUTHORIZED"); assert.equal(t.error.details.oauthError, "invalid_grant");
assert.ok(!JSON.stringify(t.error.toJSON()).includes("SEGREDO"));
cl = createDerivAuthClient({ fetch: async () => { throw new Error("ECONNREFUSED VERIFIER-SEGREDO"); } });
t = await cl.exchangeCode(input); assert.equal(t.ok, false); assert.ok(!JSON.stringify(t.error.toJSON()).includes("SEGREDO"));
assert.equal((await createDerivAuthClient({ fetch: jr(200, { token_type: "bearer" }) }).exchangeCode(input)).ok, false);
assert.equal((await createDerivAuthClient({ fetch: jr(200, { access_token: "x", token_type: "mac" }) }).exchangeCode(input)).ok, false);
assert.equal((await createDerivAuthClient({ fetch: jr(500, {}) }).exchangeCode(input)).error.code, "UPSTREAM");
cl = createDerivAuthClient({ fetch: async (u, init) => { seen = { u, init }; return jr(200, { data: [{ account_id: "CR1", account_type: "real", currency: "USD", status: "active", balance: 5 }, { account_id: "VRTC1", account_type: "demo", currency: "USD", status: "active", balance: 10000 }] })(); } });
let ls = await cl.listAccounts("AT-SEGREDO"); assert.deepEqual(ls.value, [{ accountId: "CR1", accountType: "real", currency: "USD", status: "active" }, { accountId: "VRTC1", accountType: "demo", currency: "USD", status: "active" }]);
assert.equal(seen.u, "https://api.derivws.com/trading/v1/options/accounts"); assert.equal(seen.init.headers.Authorization, "Bearer AT-SEGREDO");
assert.equal((await createDerivAuthClient({ fetch: jr(401, {}) }).listAccounts("x")).error.code, "UNAUTHORIZED");
assert.equal((await createDerivAuthClient({ fetch: jr(403, {}) }).listAccounts("x")).error.code, "FORBIDDEN");
assert.equal((await createDerivAuthClient({ fetch: jr(200, { data: [{ account_id: "A", account_type: "xxx" }] }) }).listAccounts("x")).ok, false);


console.log("OK: cliente OAuth da Deriv");
