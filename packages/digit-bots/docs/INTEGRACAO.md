# Integração com apps/api (Fastify)

1. Em `apps/api/package.json`, acrescente em `dependencies`:
   `"@nexora/digit-bots": "workspace:*"` e rode `pnpm install` para atualizar o lockfile
   (ou use o workflow `fix-lockfile.yml`).
2. Crie `apps/api/src/routes/digit-bots.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { BotManager, DerivSession, loadEnvConfig, PRESETS } from '@nexora/digit-bots';

export async function digitBotsRoutes(app: FastifyInstance) {
  const cfg = loadEnvConfig();
  const session = new DerivSession({ ...cfg, log: (m) => app.log.info(m) });
  const manager = new BotManager({ session, defaults: { symbol: cfg.symbol } });
  const lastTrades: unknown[] = [];

  manager.on('trade', (t) => {
    lastTrades.unshift(t);
    lastTrades.length = Math.min(lastTrades.length, 200);
  });

  void manager.warmUp().catch((e) => app.log.error(e)); // pré-aquece: o play entra sem esperar

  app.get('/bots', async () => ({ presets: PRESETS, status: manager.status() }));
  app.get('/bots/trades', async () => lastTrades);

  app.post<{ Params: { id: string }; Body: { stake?: number; stopLoss?: number; takeProfit?: number } }>(
    '/bots/:id/start',
    async (req, reply) => {
      try {
        manager.start(req.params.id, req.body ?? {});
        return { ok: true };
      } catch (e) {
        return reply.code(400).send({ ok: false, error: (e as Error).message });
      }
    },
  );

  app.post<{ Params: { id: string } }>('/bots/:id/stop', async (req) => {
    await manager.stop(req.params.id);
    return { ok: true };
  });

  app.addHook('onClose', async () => {
    await manager.stopAll();
    session.close();
  });
}
```

3. Registe em `apps/api/src/index.ts`: `await app.register(digitBotsRoutes);`
4. Proteja estas rotas com autenticação: elas movimentam dinheiro.
5. No Render, defina `DERIV_TOKEN`, `DERIV_APP_ID` (se PAT) e `DERIV_ACCOUNT_TYPE=demo`.
   Para real: `DERIV_ACCOUNT_TYPE=real` **e** `DERIV_ALLOW_REAL=yes`.

Eventos em tempo real para o dashboard: `manager.on('trade', ...)` e `manager.on('stop', ...)`
(encaminhe por SSE ou WebSocket).
