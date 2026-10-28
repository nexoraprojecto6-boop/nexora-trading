# @nexora/digit-bots

Seis bots de dígitos para a **nova API da Deriv** (WebSocket com OTP), com compra imediata,
gestão de risco e limite de pedidos. Sem dependências de runtime (usa o `WebSocket` e o `fetch` do Node 22).

| Bot id    | Contrato                      | Ganha quando o último dígito…      |
|-----------|-------------------------------|------------------------------------|
| `digit-3` | `DIGITDIFF` barrier 3         | é diferente de 3                   |
| `digit-1` | `DIGITDIFF` barrier 1         | é diferente de 1                   |
| `over-5`  | `DIGITOVER` barrier 5         | é maior que 5 (6-9)                |
| `under-8` | `DIGITUNDER` barrier 8        | é menor que 8 (0-7)                |
| `even`    | `DIGITEVEN`                   | é par                              |
| `odd`     | `DIGITODD`                    | é ímpar                            |

> **"Dígito 3" e "Dígito 1"**: assumi *Differs*. Para *Matches* use
> `{ contractType: 'DIGITMATCH' }` nos overrides (ou, no CLI, edite o preset em `src/presets.ts`).
> Todos os contratos são de **1 tick**.

## Importante: sobre "assertivos"

Nenhum bot de dígitos consegue ser "assertivo" de forma garantida. Cada dígito é aleatório e
independente do anterior, e o *payout* da Deriv já embute uma margem da casa. Por exemplo, *Under 8*
acerta ~80% das vezes, mas paga pouco, e uma única perda apaga vários ganhos. O que este pacote
garante é **execução rápida e correta** e **limites de risco**, não lucro.
**Comece sempre em conta demo.**

## Como a entrada é rápida

1. `warmUp()` abre a ligação **antes** do play (REST → OTP → WebSocket já aberto).
2. No play, o bot envia `buy: 1` + `parameters` (sem `proposal`, sem esperar tick): **uma única
   ida-e-volta**. A latência de cada compra vem em `TradeRecord.latencyMs`.
3. `subscribe: 1` no próprio `buy` faz a Deriv enviar as atualizações do contrato sem pedidos
   extra (poupa o limite de 360 pedidos/min).
4. Quando o contrato liquida (1 tick), compra a seguinte **sem pausa** (`cooldownMs: 0`).

O tempo até liquidar depende do mercado: `R_100` dá 1 tick a cada 2 s; índices de 1 segundo
(ex.: `1HZ100V`, se estiver disponível na sua conta) liquidam em ~1 s. Troque com `BOT_SYMBOL`.

## Gestão de risco (por bot)

`stopLoss`, `takeProfit`, `maxConsecutiveLosses`, `maxTrades`, `stake`, `maxStake`.
O martingale está **desligado** (`stakeMultiplierOnLoss: 1`); se ligar, o stake nunca passa de `maxStake`.
Padrões: stake 1, stop loss 20, take profit 10, 5 perdas seguidas. Conta **real exige**
`DERIV_ALLOW_REAL=yes`. Ordens de compra **não são repetidas às cegas** (a Deriv recomenda
confirmar o estado antes de repetir): erro de validação/credenciais para o bot de imediato,
5 falhas de ligação seguidas também.

## Instalação no monorepo

1. Copie `packages/digit-bots/` para o repositório e substitua o `pnpm-lock.yaml` da raiz pelo
   incluído (ele só acrescenta a entrada de `packages/digit-bots`, e o `frozen-lockfile` da
   Vercel/Render passa). Confirme que o `pnpm-workspace.yaml` inclui `packages/*`.
2. `pnpm install` e depois `pnpm --filter @nexora/digit-bots test`.

## Uso pela linha de comandos

```bash
cp .env.example .env   # preencha DERIV_TOKEN (e DERIV_APP_ID se for PAT)
export $(grep -v '^#' .env | xargs)
pnpm --filter @nexora/digit-bots build
node packages/digit-bots/dist/src/cli.js list
node packages/digit-bots/dist/src/cli.js run all --stake 1 --stop-loss 10 --take-profit 5
node packages/digit-bots/dist/src/cli.js run over-5 even --max-trades 50
```

`Ctrl+C` para tudo e imprime o resumo por bot.

## Uso em código (ex.: botão Play/Stop)

```ts
import { BotManager, DerivSession, loadEnvConfig } from '@nexora/digit-bots';

const cfg = loadEnvConfig();
const session = new DerivSession(cfg);
const manager = new BotManager({ session, defaults: { symbol: cfg.symbol } });

await manager.warmUp();               // ao arrancar o servidor
manager.on('trade', (t) => broadcast(t));   // WebSocket/SSE para o dashboard
manager.on('stop', (s) => broadcast(s));

manager.start('over-5', { stake: 1 }); // PLAY: compra na hora
await manager.stop('over-5');          // STOP
manager.status();                      // estado dos 6 bots
```

Exemplo de rotas Fastify para `apps/api` (veja `docs/INTEGRACAO.md`).

## Limites da Deriv respeitados

`buy`/`proposal`/`proposal_open_contract`/`sell`: 360/min e 14 400/h por ligação. O `RateLimiter`
partilhado entre os bots usa 300/min e 14 000/h. Com 6 bots em R_100 gasta-se ~3 compras/s.

## Testes

29 testes (`node:test`) cobrem: parâmetros de compra dos 6 bots, stop loss/take profit/perdas
seguidas, martingale com teto, erros (saldo, validação, ligação), limitador, sessão
(REST/OTP/req_id/erros/timeout) e bloqueio de conta real.
**Não foram executados contra a Deriv real** (sem acesso à rede neste ambiente): valide em demo.
