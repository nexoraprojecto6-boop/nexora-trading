# Notas sobre a Deriv API

Verificado em 22/10/2026 em developers.deriv.com (incluindo o índice `llms.txt` oficial). A documentação evolui; confirmar antes de cada fase de integração.

## Endpoints (novos, usados por este projeto)

| Uso | URL |
| --- | --- |
| REST | `https://api.derivws.com` |
| WebSocket público (sem autenticação) | `wss://api.derivws.com/trading/v1/options/ws/public` |
| WebSocket demo (OTP) | `wss://api.derivws.com/trading/v1/options/ws/demo?otp=...` |
| WebSocket real (OTP) | `wss://api.derivws.com/trading/v1/options/ws/real?otp=...` |

O endpoint antigo (`ws.derivws.com/websockets/v3?app_id=...`), ainda usado no repositório `deriv-com/deriv-api`, **não** é o alvo deste projeto.

## Autenticação (implementada na Fase 6, ver docs/auth.md)

- OAuth 2.0 Authorization Code + PKCE. Autorização: `https://auth.deriv.com/oauth2/auth`. Token: `https://auth.deriv.com/oauth2/token`.
- Também existe Personal Access Token (PAT).
- Cabeçalhos REST: `Authorization: Bearer <token>` (OAuth ou PAT). `Deriv-App-ID` é obrigatório **só com PAT**, não com OAuth.
- WebSocket autenticado: `POST /trading/v1/options/accounts/{accountId}/otp` devolve um URL `wss://` com OTP embutido. Liga-se a esse URL e enviam-se mensagens diretamente, sem passo `authorize`. O OTP vai no URL, por isso **o URL nunca pode ir para logs**.
- Compra em massa (`bulk-purchase`): usa `Deriv-App-ID` e PATs por conta (com scope `trade`) no corpo do pedido. **Nunca** enviar um Bearer token a este endpoint.
- A troca do código OAuth faz-se no backend, nunca no browser.

## Pontos resolvidos

- Confirmado em `llms/authentication.md`: "não há handshake de autenticação no próprio WebSocket"; o OTP vai no URL e não se envia `authorize`.
- `Deriv-App-ID`: obrigatório só com PAT (confirmado no índice oficial).
- A menção a `authorize` na página "Best practices" é texto desatualizado.

## Pontos ainda em aberto

0. **Resposta do endpoint de token:** a documentação não descreve os campos (`expires_in`, `refresh_token`, ...) nem o pedido de renovação. O cliente assume OAuth 2.0 padrão. Ver `docs/auth.md`.

1. **Campo do símbolo:** o índice oficial diz "o campo do símbolo é `underlying_symbol`". O pedido `ticks` usa o campo `ticks`, e a resposta `tick` usa `symbol`. Confirmar nos esquemas se `proposal`, `active_symbols` e `contracts_for` usam `underlying_symbol` antes de tipar esses pedidos.
2. **Campos obrigatórios do tick:** a página de migração diz que `epoch`, `quote` e `symbol` são obrigatórios e `pip_size` opcional; a página `ticks.md` diz o contrário (`pip_size` obrigatório, os restantes opcionais). O parser atual exige `symbol`, `epoch` e `quote` e trata `pip_size` como opcional. Validar contra o `schemas.zip` oficial.
3. `echo_req`: obrigatório segundo `ticks.md`, não obrigatório segundo a migração. O cliente não depende dele.

## Convenções do protocolo WebSocket

- Correlação por `req_id`.
- Subscrições: a resposta traz `subscription.id`; parar com `{ "forget": "<id>" }` ou `{ "forget_all": "<tipo>" }`.
- Manter uma única ligação, `ping` periódico e reconexão com backoff exponencial.
- Verificar sempre o campo `error` antes de usar os dados.

## Limites

- WebSocket (por minuto / hora): `proposal`, `proposal_open_contract`, `buy`, `sell` 360 / 14 400; `balance`, `statement` 100 / 2 000; `portfolio`, `profit_table` 30 / 1 500; todas as outras 220 / 14 400. `ping`: 10 por segundo por ligação.
- REST: 300 pedidos/min e 1 000 por 10 min por IP; 80 pedidos/min por utilizador autenticado.
- A Deriv pode alterar estes valores.

## Esquemas oficiais

Os esquemas JSON e o OpenAPI estão em `https://github.com/deriv-com/deriv-api-schemas/releases/latest/download/schemas.zip`. Usar para gerar/validar tipos nas fases seguintes.

## Fontes

- https://developers.deriv.com/llms.txt (índice oficial)
- https://developers.deriv.com/llms/ticks.md
- https://developers.deriv.com/llms/authentication.md
- https://developers.deriv.com/docs/intro/api-overview/
- https://developers.deriv.com/docs/options/ws-public/
- https://developers.deriv.com/docs/limits/
- https://developers.deriv.com/docs/best-practices/
- https://developers.deriv.com/comparison/ticks/
