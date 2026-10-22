-- Função utilitária, neutra quanto ao domínio: atualiza a coluna updated_at
-- numa tabela sempre que uma linha é alterada. Será usada por triggers das
-- tabelas futuras, por exemplo:
--   create trigger tabela_set_updated_at before update on tabela
--   for each row execute function set_updated_at();
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
