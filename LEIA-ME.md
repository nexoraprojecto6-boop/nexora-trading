# Bots de dígitos: scalper Over 3 + martingale inteligente

Substitui 3 ficheiros em apps/api/src/digit-bots/ (mesmos nomes, sem mexer em session.ts, errors.ts, runner.ts):
  bot.ts, feed.ts, types.ts

O que mudou
- feed.ts: DigitStats ganhou subscribe() e last (o scalper reage a cada tick). O dígito já usava toFixed(pip_size).
- types.ts: campos novos, todos OPCIONAIS (nada existente parte):
  mode ('sequential'|'scalper'), scalperBelow, maxOpen, smartMartingale, martingaleMaxSteps, martingaleProfitMult.
- bot.ts: modo scalper (1 compra por tick, sem esperar a liquidação, sem martingale) e martingale inteligente
  (recupera a perda acumulada + lucro alvo com o retorno real do recibo; volta à stake base se passar dos passos ou do maxStake).

Falta (ficheiros que ainda não vi: PRESETS e catálogo)
1) Preset do scalper, no ficheiro dos PRESETS:
   { id: 'scalper-over-3', label: 'Scalper Acima de 3', mode: 'scalper', scalperBelow: 3, maxOpen: 3,
     options: [{ contractType: 'DIGITOVER', barrier: 3 }], adaptive: false, symbol: 'R_100',
     stake: 1, stopLoss: 10, takeProfit: 10, maxConsecutiveLosses: 0, maxTrades: 0,
     stakeMultiplierOnLoss: 1, maxStake: 0, cooldownMs: 0 }
2) Nos outros 6 presets: smartMartingale: true, martingaleMaxSteps: 4, martingaleProfitMult: 1,
   maxStake: <teto em USD> (obrigatório > 0), cooldownMs: 0.
3) Catálogo (paramFields/riskFields): expor smartMartingale, martingaleMaxSteps, maxStake.
   O ecrã desenha os campos sozinho.

Cuidado: nos Differs (digit-3, digit-1) o retorno é ~10%, por isso recuperar 1 perda pede ~10x a stake.
Com maxStake baixo a sequência é cortada logo no 1.º passo; defina o maxStake a pensar nisso.
Testado só com sessão simulada; teste em conta demo.
