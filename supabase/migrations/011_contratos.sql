create table if not exists contratos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),

  -- dados do cliente
  nome        text not null,
  email       text not null,
  whatsapp    text not null default '',
  cpf         text not null,

  -- endereço
  rua         text not null default '',
  numero      text not null default '',
  bairro      text not null default '',
  cidade      text not null default '',
  estado      text not null default '',

  -- plano
  plano       text not null,
  taxas       text not null default ''
);

alter table contratos enable row level security;

-- usuários autenticados podem inserir e ler
create policy "auth insert contratos"
  on contratos for insert
  to authenticated
  with check (true);

create policy "auth select contratos"
  on contratos for select
  to authenticated
  using (true);
