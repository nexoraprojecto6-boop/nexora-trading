# Base de dados (PostgreSQL)

## Migrações

Ficheiros SQL em `infrastructure/db/migrations/`, aplicados por ordem numérica.

- Nome: `NNNN_descricao_em_minusculas.sql` (ex.: `0002_criar_utilizadores.sql`).
- Cada ficheiro corre numa transação: se falhar, nada fica a meio.
  Por isso não usar comandos que não correm em transação (ex.: `CREATE INDEX CONCURRENTLY`).
- **Nunca editar uma migração já aplicada.** O sistema guarda um checksum e recusa continuar se o ficheiro mudar. Criar uma migração nova.
- Uma migração nova não pode ter número anterior ao de uma já aplicada.
- Valores monetários e preços: usar `numeric`, nunca `float`/`real`.

## Como executar

Como passo de release, nunca no arranque da API:

```
pnpm --filter @nexora/api build
pnpm --filter @nexora/api migrate
```

Necessita de `DATABASE_URL` (e `DATABASE_SSL`, ver `.env.example`). Usa um advisory lock, por isso execuções simultâneas esperam umas pelas outras. O registo das aplicadas fica na tabela `schema_migrations`.

## TLS

O modo TLS vem **só** de `DATABASE_SSL` (`verify`, `no-verify` ou `disable`). Parâmetros como `sslmode=require` no `DATABASE_URL` são ignorados de propósito, para não haver duas fontes de verdade.
Por omissão: `verify` em produção, `disable` fora dela.
