# NEXORA TRADING

Plataforma de trading em tempo real, construída sobre a API oficial da Deriv (REST e WebSocket).

> **Estado do projeto:** Fase 1, estrutura raiz do monorepo. Ainda não existe qualquer funcionalidade implementada.

## Âmbito desta fase

- Estrutura de pastas e configuração raiz do monorepo.
- Sem autenticação, OAuth, bots nem operações de compra.
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

## Fases previstas

1. Estrutura raiz do monorepo (esta fase)
2. Pacote `shared`
3. Pacote `deriv-client`
4. API (`apps/api`)
5. Base de dados e migrações
6. Motor de bots e worker
7. Frontend
8. CI/CD e publicação

## Licença

A definir.
