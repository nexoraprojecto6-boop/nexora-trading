# Frontend (`apps/web`)

O painel foi reaproveitado do projeto antigo (`frontend-nexora`): **mesma estrutura de pastas, mesmo `index.css` (idêntico byte a byte), mesmos componentes, posições e ecrãs**. O que mudou foi a camada de dados, porque o servidor é outro.

## O que ficou igual
`styles/index.css`, `ChartSection` (gráfico de dígitos, liga à WebSocket pública oficial da Deriv), `TradesTable`, `Footer`, `DepositModal`, `main.tsx`, `VideoLessonsPage`, `AdminPage`, `OperarManualPage`, `lib/money.ts`, `lib/sound.ts`.

## O que mudou e porquê

| Antes (servidor antigo) | Agora (esta API) |
| --- | --- |
| Login por email/senha + "Conectar à Deriv" | "Entrar com a Deriv" e "Criar conta na Deriv" (OAuth no servidor) |
| Token em `localStorage` | Cookie de sessão `HttpOnly`: o browser nunca vê tokens |
| Bots a correr no servidor, eventos por WebSocket | Catálogo, escolha e configuração vêm da API; **ainda sem execução** |
| Saldo por WebSocket do servidor | `GET /me/accounts` (saldo atual via Deriv), refrescado de 30 em 30 s |
| Contador "ONLINES" simulado no browser | Número real: sessões ativas nos últimos 5 minutos |
| Avisos fixos no código | Só avisos reais do servidor (funcionalidade desligada por agora) |
| Dois números de WhatsApp diferentes (com e sem 244) | Um só, em `lib/config.ts` |
| Endereço do servidor escondido por omissão no código | Só `VITE_API_BASE_URL`; sem ela o ecrã de entrada avisa |

## Funcionalidades desligadas (`lib/config.ts → FEATURES`)
`admin`, `manualTrading`, `notifications`: o servidor novo ainda não tem as partes correspondentes. As rotas `/admin` e `/operar-manual` mostram "ainda não disponível". O código das páginas está intacto: quando o servidor existir, liga-se a flag.

## Não portado
`RegisterPage`, `VerifyEmailResultPage`, `VerifyPendingPage`: registo por email (já não existe) e dois ecrãs que chamavam funções que nunca existiram no cliente antigo. Continuam no repositório `frontend-nexora`.

## Bots (importante)
O catálogo tem 6 bots de dígitos (Pares/Ímpares, Over 3, Over 1, Over/Under 3, Under 8, Under 8/Over 7) que operam no servidor; o Play inicia-os e o painel mostra as operações reais. O histórico e o gráfico de resultados ficam vazios até existir execução (ver `docs/bots.md`). Os limites de risco são obrigatórios e não têm valor por omissão: um campo vazio nunca é enviado como 0.

## Configuração
- `VITE_API_BASE_URL` (obrigatória): origem https da API, sem barra no fim.
- `VITE_DERIV_AFFILIATE_TOKEN` (opcional): atribuição do link "Cadastro na corretora".
- O `vercel.json` tem o *fallback* de SPA (as rotas `/callback`, `/dashboard`... abrem o `index.html`) e cabeçalhos de segurança.

## Testes
`pnpm --filter @nexora/web test` corre o código real no Vite com um browser simulado (jsdom): lógica pura, e 7 cenários de interface (login e termos, callback, sessão, menu, painel de controlo com configuração e erros por campo, painel completo, rotas).
