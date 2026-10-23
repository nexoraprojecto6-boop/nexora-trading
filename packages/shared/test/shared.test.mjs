import assert from "node:assert/strict";
import {
  AppError, assertNever, err, isAppError, ok,
  parseLogLevel, parseNodeEnv, parsePort, requireEnv,
} from "../dist/index.js";

// Result
assert.deepEqual(ok(1), { ok: true, value: 1 });
const e = new AppError("NOT_FOUND", "Falta", { details: { id: 1 }, cause: new Error("interno SEGREDO") });
assert.deepEqual(err(e), { ok: false, error: e });

// AppError: serialização segura (sem stack nem causa)
const json = JSON.stringify(e.toJSON());
assert.ok(!json.includes("SEGREDO") && !json.includes("stack"));
assert.deepEqual(e.toJSON(), { code: "NOT_FOUND", message: "Falta", details: { id: 1 } });
assert.deepEqual(new AppError("CONFIG", "x").toJSON(), { code: "CONFIG", message: "x" });
assert.equal(isAppError(e), true); assert.equal(isAppError(new Error("x")), false);
assert.equal(e.cause.message, "interno SEGREDO");

// Configuração
assert.equal(parseNodeEnv(undefined).value, "development");
assert.equal(parseNodeEnv(" Production ").value, "production");
assert.equal(parseNodeEnv("staging").ok, false);
assert.equal(parseLogLevel("DEBUG").value, "debug");
const bad = parseLogLevel("SEGREDO123"); assert.equal(bad.ok, false); assert.ok(!bad.error.message.includes("SEGREDO123"));
assert.equal(parsePort(undefined, 3000).value, 3000);
assert.equal(parsePort("8080", 1).value, 8080);
for (const v of ["0", "65536", "-1", "80.5", "abc", "1e3", " "]) {
  if (v.trim() === "") assert.equal(parsePort(v, 3000).value, 3000); else assert.equal(parsePort(v, 1).ok, false, v);
}
assert.equal(requireEnv("X", "  ").ok, false);
assert.equal(requireEnv("X", " v ").value, "v");

// assertNever
assert.throws(() => assertNever("x"), (x) => isAppError(x) && x.code === "INTERNAL");
console.log("OK: @nexora/shared");
