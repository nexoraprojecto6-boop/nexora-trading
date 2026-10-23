# Motor de bots

> **Aviso de risco.** Negociar com robôs pode causar perdas, incluindo a perda total do valor investido. Nenhuma estratégia garante lucro e este projeto não dá aconselhamento financeiro. Qualquer utilização com dinheiro real é por conta e risco de quem a ativa.

## O que existe (`packages/bot-engine`)

Núcleo de decisão, **sem rede e sem execução**. Não compra nada.

| Peça | Função |
| --- | --- |
| `CandleAggregator` | Agrega ticks de um símbolo em candles de duração fixa. Ignora ticks de outro símbolo, atrasados ou inválidos. |
| `Strategy` | Interface: recebe um candle e devolve um sinal (`up`/`down`) ou nada. **Não há estratégias de trading incluídas.** |
| `RiskManager` | Porteiro obrigatório de todas as operações (ver abaixo). |
| `BotRunner` | Liga ticks → candles → estratégia → risco e devolve eventos e *intenções* de operação. |
| `toMinorUnits` | Converte valores para inteiros em unidades mínimas da moeda. Nunca se somam decimais. |

## Regras de segurança implementadas

- **Todos os limites são obrigatórios** e têm de ser inteiros positivos: valor máximo por operação, perda máxima por dia, operações por dia, posições abertas, perdas seguidas. Não existe "sem limite".
- **Pior caso diário:** a perda do dia mais o valor já em risco nas posições abertas mais a nova operação não pode exceder o limite diário.
- **Perdas seguidas:** ao atingir o limite, o robô pára e só retoma com `resume()` explícito (nem a mudança de dia o retoma).
- **Falha segura:** se a estratégia lançar uma exceção, o robô pára (`strategy_error`) e nenhuma operação é aprovada.
- **Interruptor de emergência:** `halt(razão)` bloqueia tudo até `resume()`.
- **Dinheiro em inteiros:** valores em unidades mínimas da moeda, sem erros de vírgula flutuante.
- **Determinismo:** o "relógio" é o `epoch` dos ticks; a mesma sequência de ticks dá os mesmos eventos.

O `BotRunner` **não executa nem regista nada sozinho**: quem executa tem de chamar `recordOpened` e `recordClosed` no `RiskManager`.

## O que falta para executar operações (Fase 9b, worker)

Decisões a tomar **antes** de escrever o executor:

1. **Só conta demo primeiro.** Contas reais ficam bloqueadas por uma flag explícita, ativada por utilizador.
2. **Consentimento para operar offline.** Hoje o logout apaga as credenciais Deriv. Para um robô operar sem o utilizador ligado é preciso um consentimento explícito, token guardado cifrado, revogação a qualquer momento e renovação do token (o pedido de renovação **não está documentado** pela Deriv).
3. **Limites por utilizador.** Definidos pelo próprio utilizador, obrigatórios e sem valores por omissão que permitam operar.
4. **Estado do risco após reinício.** O `RiskManager` vive em memória; o worker tem de repor o estado (resultado do dia, posições abertas) a partir do histórico real da Deriv antes de aprovar qualquer operação.
5. **Contratos da Deriv por verificar.** Os pedidos `proposal` e `buy` (campo `underlying_symbol`, tipos de contrato, durações) têm de ser confirmados nos esquemas oficiais e testados em demo.
6. **Compras idempotentes.** Uma reconexão ou um timeout nunca pode comprar duas vezes: é preciso identificar cada intenção e reconciliar com o histórico antes de repetir.
7. **Limites da Deriv.** `proposal`, `buy` e `sell`: 360 por minuto no WebSocket. O executor tem de os respeitar.
8. **Alojamento.** No Render, um *background worker* é um serviço pago e deve correr em **uma só instância**.
9. **Estratégias.** Escolher e validar (backtest e depois demo) fora deste repositório de infraestrutura, antes de qualquer uso real.
10. **Controlo pelo utilizador.** Botão de paragem imediata e notificação quando o robô pára.
