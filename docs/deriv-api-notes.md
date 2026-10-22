# Notas sobre a Deriv API

Verificado em 22/10/2026 em developers.deriv.com. A documentação evolui; confirmar antes de cada fase de integração.

## Endpoints (novos, usados por este projeto)

| Uso | URL |
| --- | --- |
| REST | `https://api.derivws.com` |
| WebSocket público (sem autenticação) | `wss://api.derivws.com/trading/v1/options/ws/public` |
| WebSocket demo (OTP) | `wss://api.derivws.com/trading/v1/options/ws/demo?otp=...` |
| WebSocket real (OTP) | `wss://api.derivws.com/trading/v1/options/ws/real?otp=...` |

O endpoint antigo (`ws.derivws.com/websockets/v3?app_id=...`), ainda usado no repositório `deriv-com/deriv-api`, **não** é o alvo deste projeto.

## Autenticação (Fase 4, ainda não implementada)

- OAuth 2.0 Authorization Code + PKCE. Autorização: `https://auth.deriv.com/oauth2/auth`. Token: `https://auth.deriv.com/oauth2/token`.
- Também existe Personal Access Token (PAT).
- Para o WebSocket autenticado: `POST /trading/v1/options/accounts/{accountId}/otp` devolve um URL `wss://` com OTP embutido. O OTP vai no URL, por isso **o URL nunca pode ir para logs**.
- A troca do código OAuth faz-se no backend, nunca no browser.

## Pontos a esclarecer antes da Fase 4

1. A página "Authentication" diz que não há handshake no WebSocket; a página "Best practices" ainda fala em enviar `authorize`. Confirmar qual vale para os endpoints demo/real.
2. O cabeçalho `Deriv-App-ID`: uma página diz que é obrigatório em todas as chamadas REST autenticadas; outra diz que só é obrigatório com PAT e não com OAuth. Confirmar.

## Convenções do protocolo WebSocket

- Correlação por `req_id`. Não depender de `echo_req` (deixou de ser obrigatório).
- Subscrições: resposta traz `subscription.id`; parar com `{ "forget": "<id>" }` ou `{ "forget_all": "<tipo>" }`.
- `ticks`: `tick.epoch`, `tick.quote` e `tick.symbol` são obrigatórios; `pip_size` é opcional. A validação por padrão do símbolo foi removida.
- Manter uma única ligação, `ping` periódico e reconexão com backoff exponencial.
- Verificar sempre o campo `error` antes de usar os dados.

## Limites

- WebSocket (por minuto / hora): `proposal`, `proposal_open_contract`, `buy`, `sell` 360 / 14 400; `balance`, `statement` 100 / 2 000; `portfolio`, `profit_table` 30 / 1 500; todas as outras 220 / 14 400. `ping`: 10 por segundo por ligação.
- REST: 300 pedidos/min e 1 000 por 10 min por IP; 80 pedidos/min por utilizador autenticado.
- A Deriv pode alterar estes valores.

## Esquemas oficiais

Os esquemas JSON e o OpenAPI estão em `https://github.com/deriv-com/deriv-api-schemas/releases/latest/download/schemas.zip`. Usar para gerar/validar tipos nas fases seguintes.

## Fontes

- https://developers.deriv.com/docs/intro/api-overview/
- https://developers.deriv.com/llms/authentication.md
- https://developers.deriv.com/docs/options/ws-public/
- https://developers.deriv.com/docs/limits/
- https://developers.deriv.com/docs/best-practices/
- https://developers.deriv.com/comparison/ticks/
