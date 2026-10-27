# Autenticação (OAuth 2.0 da Deriv)

## Fluxo

1. `GET /auth/login`: gera `state` e PKCE (S256), guarda-os (hash do state; verifier cifrado) e redireciona para a Deriv com `scope=trade`. Define o cookie `nx_oauth` (nonce) que liga a tentativa a este browser.
2. A Deriv redireciona para `GET /auth/callback?code=...&state=...`.
3. A API consome a tentativa (uso único), confirma que o cookie corresponde, troca o `code` **no backend**, obtém as contas (`GET /trading/v1/options/accounts`) e abre a sessão.
4. Redireciona sempre para `WEB_ORIGIN/callback` (sucesso) ou `WEB_ORIGIN/callback?error=access_denied|login_failed` (falha, sem detalhes). Nunca existe redirecionamento para um destino vindo do pedido, nem se repete texto do pedido.
5. `GET /auth/login?prompt=registration` abre o registo de conta na Deriv (com a atribuição de afiliado, se `DERIV_AFFILIATE_TOKEN` estiver definido).
6. `GET /me` devolve o utilizador e as contas; `GET /me/accounts` devolve-as com o saldo atual (via Deriv; `live:false` se o token da Deriv expirou); `GET /online-count` devolve as sessões ativas nos últimos 5 minutos.
7. `GET /me` `POST /auth/logout` termina a sessão (exige `Origin` igual a `WEB_ORIGIN`).

## Decisões de segurança

- Cliente público com PKCE: não há `client_secret`.
- Sessão: token aleatório de 32 bytes no cookie `HttpOnly; SameSite=Lax; Secure` (prefixo `__Host-` em produção). Na BD só existe o hash SHA-256. Duração: 8 horas.
- Tokens da Deriv: cifrados com AES-256-GCM (`APP_ENCRYPTION_KEY`), com o utilizador como dados autenticados. Nunca aparecem em respostas nem logs.
- Login CSRF: o cookie `nx_oauth` tem de corresponder à tentativa. Logout CSRF: verificação de `Origin`.
- Identidade: um utilizador é o conjunto das suas contas Deriv. Uma conta nunca muda de dono. Logins simultâneos da mesma conta são serializados.
- Âmbito pedido: apenas `trade` (mínimo para listar contas e, mais tarde, obter o OTP do WebSocket).

## Decisões em aberto

1. **Logout apaga as credenciais Deriv guardadas.** Para os bots operarem com o utilizador offline (fase do worker) será preciso um consentimento explícito e persistente. Decidir nessa fase.
2. **Sem refresh de token.** O token de acesso dura cerca de 1 hora; a documentação indica `refresh_token` mas não descreve o pedido de renovação. Ficou por implementar. Hoje, depois de o token expirar, as chamadas à Deriv falham e é preciso novo login.
3. **Formato da resposta do token** (`access_token`, `token_type`, `expires_in`, `refresh_token`, `scope`) assumido como OAuth 2.0 padrão; confirmar no primeiro login real em conta demo.
4. **Cookies e domínios.** `SameSite=Lax` exige frontend e API no mesmo "site". Decisão: frontend em `nexoraforex.pro` e API em `api.nexoraforex.pro` (domínio personalizado no Render). Com o domínio `*.onrender.com` o cookie não seria enviado. Ver `docs/deploy.md`.
5. **CORS** ativo quando a autenticação está configurada: só `WEB_ORIGIN`, com credenciais, métodos GET/POST/OPTIONS. O frontend usa `credentials: "include"`.
6. **Limite de pedidos** em `/auth/login` e `/auth/callback` não existe nesta fase (cada login cria uma linha temporária, limpa oportunisticamente). Configurar limites no serviço de alojamento ou adicionar `@fastify/rate-limit`.
7. **Rotação da chave** de cifra: o formato (`v1.`) já está versionado, mas só existe uma chave.

## Configuração

Ver `.env.example`: `DERIV_APP_ID`, `DERIV_OAUTH_REDIRECT_URI`, `WEB_ORIGIN`, `APP_ENCRYPTION_KEY`. Registar o mesmo `redirect_uri` na Deriv (comparação exata).
