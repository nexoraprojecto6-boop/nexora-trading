-- Escolha e configuração de bots por utilizador.
-- Os bots em si vivem no código (catálogo do servidor); aqui só ficam as escolhas do utilizador.
-- Valores monetários ficam como texto decimal exato dentro do JSON (nunca como número).

create table user_bot_configs (
  user_id    uuid not null references users(id) on delete cascade,
  bot_id     text not null,
  params     jsonb not null,
  risk       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);
create trigger user_bot_configs_set_updated_at before update on user_bot_configs
  for each row execute function set_updated_at();

create table user_selected_bot (
  user_id    uuid primary key references users(id) on delete cascade,
  bot_id     text not null,
  updated_at timestamptz not null default now()
);
create trigger user_selected_bot_set_updated_at before update on user_selected_bot
  for each row execute function set_updated_at();
