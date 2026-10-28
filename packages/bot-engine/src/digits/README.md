# Bots de dígitos (execução rápida)

Sem dependências novas (o `pnpm-lock.yaml` continua válido). Requer Node 22+ (WebSocket global).

## Porque era lento / errava dígitos
- Ligava e subscrevia ticks só ao clicar -> atraso. Agora `TickFeed` e `TradeSocket` ficam ligados desde o arranque da API.
- Fazia `proposal` antes de `buy`. Agora `buy` directo com `parameters` (um round-trip a menos).
- Dígito calculado com `String(quote)` perde zeros finais (1234.50 -> "1234.5"). Agora usa `toFixed(pip_size)`.

## Bots
| id | contrato | notas |
|---|---|---|
| scalper_over3 | DIGITOVER 3 | entra se último dígito < 3, uma compra por tick, sem esperar resultado, sem martingale |
| digit3 / digit1 | DIGITMATCH | filtro: dígito "quente" na janela de 50 |
| over5 / under8 | DIGITOVER 5 / DIGITUNDER 8 | filtro rápido nos últimos 20 |
| even / odd | DIGITEVEN / DIGITODD | filtro nos últimos 10 |

Clicar = primeira entrada imediata (sem filtro, excepto no scalper). Martingale inteligente em todos menos o scalper:
stake = (perda acumulada + alvo) / retorno real do último contrato, com `maxSteps` e `maxStake`.

## Ligação (exemplo, na API)
```ts
import { TickFeed, TradeSocket, BotRunner } from "./digits/index.js";

const feed = new TickFeed("R_100");           // underlying_symbol
const trade = new TradeSocket(async () => {
  const r = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Deriv-App-ID": appId }, // App-ID só com PAT
  });
  return (await r.json()).data.url;           // OTP é de uso único
});
feed.start(); await trade.start();            // no arranque, não no clique

const runner = new BotRunner(feed, trade, { symbol: "R_100", currency: "USD", onEvent: console.log });
runner.start("scalper_over3", { stake: 1 });
runner.start("over5", { stake: 1, martingale: { maxSteps: 4, maxStake: 20 }, stopLoss: 20, takeProfit: 10 });
runner.stop();
```

## Por verificar na conta demo
- Formato de `proposal_open_contract` com `buy.subscribe=1` (campos `is_sold`, `profit`) segue a doc, mas não foi testado com ligação real.
- Teste primeiro em conta demo e confirma `latencyMs` nos eventos `entry`.
