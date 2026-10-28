import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DerivApiError } from '../src/errors.js';
import { DigitStats, lastDigit } from '../src/digits.js';
import { RateLimiter } from '../src/rate-limiter.js';
import { DerivSession, type SocketLike } from '../src/session.js';
import { loadEnvConfig } from '../src/config.js';

describe('lastDigit / DigitStats', () => {
  it('extrai o último dígito respeitando o pip_size', () => {
    assert.equal(lastDigit(1234.5, 2), 0);
    assert.equal(lastDigit(1234.56, 2), 6);
    assert.equal(lastDigit(0.1, 3), 0);
    assert.equal(lastDigit(100.123, 3), 3);
    assert.equal(lastDigit(7, 0), 7);
  });

  it('calcula percentagens na janela', () => {
    const s = new DigitStats(10);
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((d) => s.push(d));
    assert.equal(s.overPct(5), 40);
    assert.equal(s.underPct(8), 80);
    assert.equal(s.evenPct(), 50);
    s.push(0);
    assert.equal(s.count, 10);
  });
});

describe('RateLimiter', () => {
  it('atrasa a chamada que excede a janela', async () => {
    let t = 0;
    const waits: number[] = [];
    const rl = new RateLimiter([{ windowMs: 1000, max: 2 }], () => t, async (ms) => {
      waits.push(ms);
      t += ms;
    });
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    assert.equal(waits.length, 1);
    assert.ok(waits[0]! >= 1000);
  });

  it('não atrasa abaixo do limite', async () => {
    const waits: number[] = [];
    const rl = new RateLimiter([{ windowMs: 1000, max: 5 }], () => 0, async (ms) => void waits.push(ms));
    for (let i = 0; i < 5; i++) await rl.acquire();
    assert.equal(waits.length, 0);
  });
});

describe('loadEnvConfig', () => {
  it('exige token e bloqueia conta real sem confirmação', () => {
    assert.throws(() => loadEnvConfig({}));
    assert.throws(() => loadEnvConfig({ DERIV_TOKEN: 'x', DERIV_ACCOUNT_TYPE: 'real' }));
    assert.throws(() => loadEnvConfig({ DERIV_TOKEN: 'x', DERIV_ACCOUNT_TYPE: 'xpto' }));
    assert.equal(loadEnvConfig({ DERIV_TOKEN: 'x' }).accountType, 'demo');
    assert.equal(
      loadEnvConfig({ DERIV_TOKEN: 'x', DERIV_ACCOUNT_TYPE: 'real', DERIV_ALLOW_REAL: 'yes' }).accountType,
      'real',
    );
  });
});

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  sent: any[] = [];
  constructor(public url: string, private script: (s: FakeSocket, m: any) => void) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(d: string) {
    const m = JSON.parse(d);
    this.sent.push(m);
    this.script(this, m);
  }
  reply(obj: unknown) {
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(obj) }));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('DerivSession', () => {
  const calls: { url: string; method?: string; headers: any }[] = [];
  const fetchFn = (async (url: string, init: any) => {
    calls.push({ url, method: init?.method, headers: init?.headers });
    if (url.endsWith('/accounts')) {
      return jsonRes({
        data: [
          { account_id: 'REAL1', balance: 50, currency: 'USD', group: 'g', status: 'active', account_type: 'real' },
          { account_id: 'DEMO1', balance: 10000, currency: 'USD', group: 'g', status: 'active', account_type: 'demo' },
        ],
      });
    }
    if (url.endsWith('/otp')) return jsonRes({ data: { url: 'wss://example/ws/demo?otp=abc' } });
    return jsonRes({}, 404);
  }) as unknown as typeof fetch;

  const script = (s: FakeSocket, m: any) => {
    if (m.buy === 1) {
      s.reply({
        msg_type: 'buy',
        req_id: m.req_id,
        buy: { contract_id: 77, buy_price: 1, payout: 1.1, balance_after: 9999 },
      });
      s.reply({
        msg_type: 'proposal_open_contract',
        req_id: m.req_id,
        proposal_open_contract: { contract_id: 77, status: 'won', is_sold: 1, profit: '0.10' },
      });
    } else if (m.bad) {
      s.reply({ msg_type: 'buy', req_id: m.req_id, error: { code: 'InputValidationFailed', message: 'nope' } });
    } else if (m.ping) {
      s.reply({ msg_type: 'ping', req_id: m.req_id, ping: 'pong' });
    }
  };

  it('autentica (demo), obtém OTP, liga e casa req_id', async () => {
    let socket!: FakeSocket;
    const session = new DerivSession({
      token: 'T',
      appId: 'APP',
      accountType: 'demo',
      fetchFn,
      socketFactory: (url) => (socket = new FakeSocket(url, script)),
    });
    await session.ready();
    assert.equal(session.accountId, 'DEMO1');
    assert.equal(socket.url, 'wss://example/ws/demo?otp=abc');
    assert.equal(calls[0]!.headers.Authorization, 'Bearer T');
    assert.equal(calls[0]!.headers['Deriv-App-ID'], 'APP');
    assert.equal(calls[1]!.method, 'POST');

    const seen: any[] = [];
    const res = await session.request({ buy: 1, price: 1, parameters: {} });
    assert.equal(res.buy.contract_id, 77);
    session.watchContract(77, (p) => seen.push(p)); // chega já com o último estado
    assert.equal(seen[0].status, 'won');

    await assert.rejects(session.request({ proposal: 1, bad: true }), (e: unknown) => {
      return e instanceof DerivApiError && e.code === 'InputValidationFailed' && e.msgType === 'buy';
    });
    const pong = await session.request({ ping: 1 });
    assert.equal(pong.ping, 'pong');
    session.close();
  });

  it('recusa conta real quando o tipo configurado é demo', async () => {
    const session = new DerivSession({
      token: 'T',
      accountType: 'demo',
      accountId: 'REAL1',
      fetchFn,
      socketFactory: (url) => new FakeSocket(url, script),
    });
    await assert.rejects(session.ready(), /REAL1/);
  });

  it('dá timeout quando não há resposta', async () => {
    const session = new DerivSession({
      token: 'T',
      accountType: 'demo',
      fetchFn,
      requestTimeoutMs: 30,
      socketFactory: (url) => new FakeSocket(url, () => {}),
    });
    await assert.rejects(session.request({ ticks: 'R_100' }), /Timeout/);
    session.close();
  });
});
