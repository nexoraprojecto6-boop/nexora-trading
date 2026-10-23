# NEXORA TRADING

Plataforma de trading em tempo real, construída sobre a API oficial da Deriv (REST e WebSocket).

> **Estado do projeto:** em construção. Existem a API (health, readiness, login OAuth da Deriv), o cliente da Deriv, a base de dados com migrações e um frontend mínimo de login. **Ainda não há bots nem operações de compra.**

## Âmbito atual

- Autenticação com a Deriv (OAuth 2.0 + PKCE), sessões e contas.
- Sem bots nem operações de compra.
- Sem credenciais de nenhum tipo no repositório.

## Stack

| Área | Tecnologia |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, TypeScript, Fastify |
| Monorepo | pnpm workspaces, Turborepo |
| Motor de bots | TypeScript, worker independente |
| Integração de trading | API oficial da Deriv (REST e WebSocket) |
| Base de dados | PostgreSQL |
| Cache / filas | Redis (opcional, só com necessidade arquitetural comprovada) |
| CI/CD | Serviços online (GitHub Actions e plataformas cloud) |

## Estrutura

```
nexora-trading/
├── .github/workflows/     # Pipelines de CI/CD
├── apps/
│   ├── web/               # Frontend (React + Vite)
│   ├── api/               # Backend (Fastify)
│   └── worker/            # Worker do motor de bots
├── packages/
│   ├── deriv-client/      # Cliente da API da Deriv
│   ├── bot-engine/        # Lógica do motor de bots
│   └── shared/            # Tipos e utilitários partilhados
├── infrastructure/        # Configuração de alojamento e base de dados
└── docs/                  # Documentação técnica
```

## Princípios

1. **Segurança primeiro:** nenhum segredo é guardado no repositório. Toda a configuração sensível é injetada por variáveis de ambiente na plataforma de alojamento.
2. **Desenvolvimento 100% online:** o fluxo assenta em GitHub, CI/CD e cloud, sem dependência de execução local.
3. **Dependências mínimas:** só se adiciona uma dependência quando existe necessidade concreta.
4. **Separação de responsabilidades:** a lógica de trading fica em pacotes isolados, reutilizáveis pela API e pelo worker.

## Configuração

Consulta o ficheiro `.env.example` para a lista de variáveis esperadas. Os valores reais nunca devem ser submetidos ao Git.

## Documentação

- `docs/auth.md`: fluxo de autenticação e decisões de segurança.
- `docs/deploy.md`: publicação (GitHub, Render, Vercel) e limites do plano gratuito.
- `docs/bots.md`: motor de bots, regras de risco e decisões em aberto.
- `docs/deriv-api-notes.md`: notas verificadas sobre a API da Deriv.
- `infrastructure/db/README.md`: base de dados e migrações.

## Estado das fases

1. Estrutura raiz do monorepo (feito)
2. Pacote `shared` (feito)
3. Pacote `deriv-client` (feito: WebSocket público e OAuth)
4. API (feito)
5. Base de dados e migrações (feito)
6. Autenticação OAuth da Deriv (feito)
7. Frontend de login e publicação (feito)
8. CI/CD (feito)
9a. Núcleo do motor de bots: candles, estratégias e gestão de risco, sem execução (feito)
9b. Worker e execução de operações (por fazer, ver `docs/bots.md`)

## Licença

A definir.
