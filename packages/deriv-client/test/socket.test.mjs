import assert from "node:assert/strict";
import { DerivSocket, subscribeTicks, ping, parseTick } from "../dist/index.js";

const instances = [];
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.onopen = this.onmessage = this.onerror = this.onclose = null; instances.push(this);
    setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 5); }
  send(d) { const m = JSON.parse(d); this.sent.push(m);
    if (m.ping) return this.reply({ msg_type: "ping", ping: "pong", req_id: m.req_id });
    if (m.ticks) { this.sid = "srv-" + instances.indexOf(this);
      return this.reply({ msg_type: "tick", req_id: m.req_id, subscription: { id: this.sid }, tick: { symbol: "R_100", epoch: 1, quote: 100.5, pip_size: 2, id: "t1" } }); }
    if (m.forget) return this.reply({ msg_type: "forget", forget: 1, req_id: m.req_id });
    if (m.bad) return this.reply({ msg_type: "bad", req_id: m.req_id, error: { code: "InvalidRequest", message: "Pedido inválido" } });
  }
  reply(o) { setTimeout(() => this.onmessage?.({ data: JSON.stringify(o) }), 1); }
  push(o) { this.onmessage?.({ data: JSON.stringify(o) }); }
  close() { this.readyState = 3; setTimeout(() => this.onclose?.({}), 1); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const factory = (u) => new FakeWS(u);

// 1. ws:// recusado
{ const s = new DerivSocket({ url: "ws://x", webSocketFactory: factory }); const r = await s.connect(); assert.equal(r.ok, false); assert.equal(r.error.code, "CONFIG"); }

const statuses = [];
const s = new DerivSocket({ url: "wss://test.invalid/secret?otp=ABC", webSocketFactory: factory, requestTimeoutMs: 100, pingIntervalMs: 20, reconnect: { initialDelayMs: 10, maxDelayMs: 20 }, onStatusChange: (x) => statuses.push(x) });
assert.equal((await s.connect()).ok, true);
assert.equal(s.status, "open");

// 2. request/response + ping
assert.equal((await ping(s)).ok, true);

// 3. erro da Deriv, sem vazar payload/URL
{ const r = await s.request({ bad: 1, token: "SEGREDO" }); assert.equal(r.ok, false); assert.equal(r.error.code, "UPSTREAM");
  assert.ok(!JSON.stringify(r.error.toJSON()).includes("SEGREDO")); assert.ok(!r.error.message.includes("ABC")); }

// 4. timeout
{ const r = await s.request({ silent: 1 }, 30); assert.equal(r.ok, false); assert.match(r.error.message, /Tempo esgotado/); }

// 5. subscrição de ticks
const ticks = [];
const sub = await subscribeTicks(s, "R_100", (t) => ticks.push(t));
assert.equal(sub.ok, true); assert.equal(ticks.length, 1); assert.deepEqual(ticks[0], { symbol: "R_100", epoch: 1, quote: 100.5, id: "t1", pipSize: 2 });
instances[0].push({ msg_type: "tick", subscription: { id: "srv-0" }, tick: { symbol: "R_100", epoch: 2, quote: 101 } });
assert.equal(ticks.length, 2);

// 6. validação de símbolos
assert.equal((await subscribeTicks(s, [], () => {})).ok, false);
assert.equal((await subscribeTicks(s, "a b", () => {})).ok, false);

// 7. reconexão + re-subscrição automática
instances[0].close(); await sleep(150);
assert.equal(s.status, "open"); assert.equal(instances.length, 2);
assert.ok(instances[1].sent.some((m) => m.ticks === "R_100" && m.subscribe === 1));
assert.equal(ticks.length, 3);
assert.ok(statuses.includes("reconnecting"));

// 8. unsubscribe envia forget
assert.equal((await sub.value.unsubscribe()).ok, true);
assert.ok(instances[1].sent.some((m) => m.forget === "srv-1"));

// 9. tick inválido
assert.equal(parseTick({ msg_type: "tick", tick: { symbol: "X", epoch: "1", quote: 1 } }).ok, false);

// 10. close
s.close(); assert.equal(s.status, "closed"); await sleep(30); assert.equal(instances.length, 2);
console.log("TODOS OS TESTES PASSARAM");
process.exit(0);
