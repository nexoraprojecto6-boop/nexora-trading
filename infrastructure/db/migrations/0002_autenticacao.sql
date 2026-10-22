-- Autenticação via OAuth da Deriv: utilizadores, contas, sessões e credenciais.
-- Segredos (tokens, code_verifier) são guardados cifrados (AES-256-GCM, na aplicação).
-- Tokens de sessão e state do OAuth são guardados apenas como hash SHA-256.

create table users (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- A identidade de um utilizador é o conjunto das suas contas Deriv.
create table deriv_accounts (
  account_id   text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  account_type text not null check (account_type in ('demo', 'real')),
  currency     text not null,
  status       text not null check (status in ('active', 'inactive')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index deriv_accounts_user_id_idx on deriv_accounts (user_id);
create trigger deriv_accounts_set_updated_at before update on deriv_accounts
  for each row execute function set_updated_at();

-- Tentativas de login em curso (uso único, curta duração).
create table oauth_login_attempts (
  state_hash        text primary key,
  browser_hash      text not null,
  code_verifier_enc text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);
create index oauth_login_attempts_expires_at_idx on oauth_login_attempts (expires_at);

create table sessions (
  token_hash   text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table deriv_credentials (
  user_id           uuid primary key references users(id) on delete cascade,
  access_token_enc  text not null,
  access_expires_at timestamptz,
  refresh_token_enc text,
  scope             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger deriv_credentials_set_updated_at before update on deriv_credentials
  for each row execute function set_updated_at();
