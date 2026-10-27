# Publicação (GitHub + Render + Vercel)

## Arquitetura

| Parte | Onde | Endereço |
| --- | --- | --- |
| Frontend (`apps/web`) | Vercel | `https://nexoraforex.pro` |
| API (`apps/api`) | Render (web service) | `https://api.nexoraforex.pro` (domínio personalizado) |
| Base de dados | Render Postgres | interna, sem acesso externo |

## Porque `api.nexoraforex.pro` e não o domínio `*.onrender.com`

O cookie de sessão é `SameSite=Lax`. Entre `nexoraforex.pro` e `xxx.onrender.com` (sites diferentes) o browser não envia esse cookie nos pedidos do frontend à API, e muitos browsers bloqueiam cookies de terceiros. Resultado: o login parece funcionar, mas `/me` responde sempre 401.
Com `api.nexoraforex.pro` os dois estão no mesmo "site" e o cookie funciona. O domínio é teu, por isso basta um registo DNS.

**Alternativa sem domínio da API** (não recomendada): um *rewrite* na Vercel de `/api/*` para o URL do Render, com `VITE_API_BASE_URL` igual a `https://nexoraforex.pro/api` e `DERIV_OAUTH_REDIRECT_URI` igual a `https://nexoraforex.pro/api/auth/callback`. Funciona para HTTP, mas não para WebSockets (fase dos bots), e coloca a Vercel no caminho de todos os pedidos.

## Ordem dos passos

1. **GitHub:** colocar todos os ficheiros das fases no repositório (incluindo `render.yaml` e `pnpm-lock.yaml` na raiz).
2. **Render:** *New → Blueprint*, escolher o repositório. O Render cria `nexora-api` e `nexora-db` e pede 3 valores:
   - `WEB_ORIGIN` = `https://nexoraforex.pro`
   - `DERIV_OAUTH_REDIRECT_URI` = `https://api.nexoraforex.pro/auth/callback`
   - `DERIV_APP_ID` = App ID da tua aplicação registada na Deriv
   Têm de ser preenchidos os 3: se faltar algum, a API recusa arrancar de propósito.
   A `APP_ENCRYPTION_KEY` **não precisas de criar**: o Render gera-a sozinho (valor aleatório de 256 bits, criado uma só vez).
3. **Backup da chave:** depois do primeiro deploy, no serviço `nexora-api` → *Environment*, mostra o valor de `APP_ENCRYPTION_KEY` e guarda uma cópia num gestor de palavras-passe. Se o serviço for apagado e recriado, a chave nova não decifra os tokens antigos (os utilizadores voltam a fazer login).
4. **Domínio da API:** no serviço `nexora-api`, *Settings → Custom Domains*, adicionar `api.nexoraforex.pro` e criar no teu DNS o registo CNAME que o Render indicar. Esperar pelo certificado TLS.
5. **Deriv:** na aplicação registada, definir o *redirect URI* exatamente igual ao do passo 2 (`https://api.nexoraforex.pro/auth/callback`).
6. **Vercel:** *Add New → Project*, escolher o repositório e definir:
   - Root Directory: `apps/web`
   - Environment Variable: `VITE_API_BASE_URL` = `https://api.nexoraforex.pro`
   - Environment Variable (opcional): `VITE_DERIV_AFFILIATE_TOKEN` = o teu token de afiliado da Deriv
   - Node.js Version: 22.x
   Depois, em *Domains*, adicionar `nexoraforex.pro` e seguir os registos DNS que a Vercel indicar.
7. **Testar** com uma conta **demo**: abrir `https://nexoraforex.pro`, "Entrar com a Deriv", autorizar, e confirmar que as contas aparecem.

Os *preview deployments* da Vercel têm outros endereços, por isso o login só funciona no domínio de produção.

## O site mostra "Não foi possível contactar o servidor"

- **`WEB_ORIGIN` tem de ser igual ao endereço que aparece na barra do browser.** Se a Vercel redireciona `nexoraforex.pro` para `www.nexoraforex.pro`, usa `https://www.nexoraforex.pro`. Com a origem errada, o browser bloqueia a resposta da API (CORS).
- O `apps/web/vercel.json` não define `Content-Security-Policy` de propósito: uma política presa a um domínio bloqueou a ligação à API quando o domínio mudou. Os restantes cabeçalhos de segurança mantêm-se. Se quiseres voltar a ter CSP, acrescenta-a só depois de confirmar o domínio final.

## Se o build falhar

- `Cannot find type definition file for 'node'` (ou `typescript` não encontrado): o Render define `NODE_ENV=production` no build e o pnpm salta as devDependencies. O `buildCommand` do `render.yaml` já usa `pnpm install --frozen-lockfile --production=false` para isso.
- Falha a falar de lockfile: falta o `pnpm-lock.yaml` no repositório.

## Se a ligação à base de dados falhar

Nos logs do Render, um erro de TLS/SSL ao ligar:
- `DATABASE_SSL=no-verify` é o valor do Blueprint (ligação interna cifrada, sem validar o certificado).
- Se o servidor não aceitar TLS, mudar para `DATABASE_SSL=disable` (a rede interna do Render não é acessível de fora).
Não foi possível confirmar este comportamento sem uma instância real do Render.

## Limites do plano gratuito (importante)

Segundo a documentação do Render:
- **A base de dados gratuita expira 30 dias após a criação**, com 14 dias para passar a plano pago antes de ser apagada. **Não tem backups.** Serve só para testes, nunca para dados que não possas perder.
- **O serviço gratuito adormece** após cerca de 15 minutos sem pedidos. O primeiro pedido seguinte demora até cerca de um minuto, e é acompanhado do arranque e das migrações.
- Só pode existir uma base de dados gratuita por conta.

Antes de qualquer utilização com dinheiro real: planos pagos para a API e a base de dados (com backups), `preDeployCommand` para migrações, e rever os pontos em aberto de `docs/auth.md`.

## Lockfile e CI

O repositório inclui o `pnpm-lock.yaml`, e o Render e o CI instalam com `--frozen-lockfile` (versões exatas, builds reproduzíveis). Se alterares dependências nos `package.json`, atualiza o lockfile sem terminal:

1. GitHub → separador **Actions** → **Gerar lockfile** → **Run workflow** (na branch pretendida).
2. O workflow corre `pnpm install --lockfile-only` e faz commit do `pnpm-lock.yaml`.

O workflow **CI** corre em cada pull request e em cada push para `main`: typecheck, build e testes (com um PostgreSQL descartável, sem palavra-passe). A auditoria de dependências é informativa e não bloqueia.

Definições recomendadas no GitHub (*Settings*):
- **Branches → regra para `main`**: exigir pull request e o check "Typecheck, build e testes" a passar antes de fazer merge.
- **Code security**: ativar *Secret scanning* e *Push protection* (bloqueia o envio acidental de segredos).
- **Actions → General → Workflow permissions**: manter "Read repository contents" por omissão (o workflow do lockfile pede a permissão de escrita só para si).
