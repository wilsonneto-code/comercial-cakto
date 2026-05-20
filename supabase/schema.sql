-- ============================================================
-- Sistema Comercial – Schema PostgreSQL para Supabase
-- ============================================================

-- -----------------------------------------------------------
-- EXTENSÕES
-- -----------------------------------------------------------
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------
-- TABELA: teams
-- -----------------------------------------------------------
create table if not exists teams (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: users
-- -----------------------------------------------------------
create type user_role as enum (
  'Admin',
  'Head Comercial',
  'Supervisor',
  'Gerente de Contas',
  'Closer',
  'SDR'
);

create table if not exists users (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  email      text not null unique,
  role       user_role not null default 'SDR',
  team_id    uuid references teams(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: activations
-- -----------------------------------------------------------
create type activation_channel as enum ('Inbound', 'Outbound', 'Indicação');

create table if not exists activations (
  id          uuid primary key default uuid_generate_v4(),
  client      text not null,
  email       text,
  phone       text,
  channel     activation_channel not null,
  responsible uuid not null references users(id) on delete restrict,
  date        date not null,
  time        time,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: forms
-- -----------------------------------------------------------
create type form_type   as enum ('Cadastro', 'Pesquisa', 'Indicação', 'Qualificação');
create type form_status as enum ('Publicado', 'Arquivado', 'Rascunho');

create table if not exists forms (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  type       form_type not null,
  slug       text not null unique,
  responses  integer not null default 0,
  active     boolean not null default true,
  color      text not null default '#2997FF',
  status     form_status not null default 'Rascunho',
  fields     jsonb not null default '[]',
  embed_code text not null default '',
  webhook    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: payments
-- -----------------------------------------------------------
create type payment_status as enum ('Pendente', 'Pago', 'Cancelado');

create table if not exists payments (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete restrict,
  value      numeric(12,2) not null,
  ref        text not null,
  status     payment_status not null default 'Pendente',
  nf         boolean not null default false,
  date       date not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: audit_logs
-- -----------------------------------------------------------
create table if not exists audit_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references users(id) on delete set null,
  user_name  text not null,
  action     text not null,
  module     text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------
alter table teams      enable row level security;
alter table users      enable row level security;
alter table activations enable row level security;
alter table forms      enable row level security;
alter table payments   enable row level security;
alter table audit_logs enable row level security;

-- Políticas permissivas para anon/authenticated (ajustar conforme auth real)
create policy "Allow all for authenticated" on teams
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on users
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on activations
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on forms
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on payments
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on audit_logs
  for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------
-- TABELA: calls  (Agenda)
-- -----------------------------------------------------------
create type call_status as enum ('Agendada', 'Realizada', 'Cancelada', 'No-show');

create table if not exists calls (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  date        date not null,
  time        time not null,
  responsible uuid not null references users(id) on delete restrict,
  status      call_status not null default 'Agendada',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: inventory  (Estoque → Itens Internos)
-- -----------------------------------------------------------
create table if not exists inventory (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  category   text not null default '',
  qty        integer not null default 0,
  unit       text not null default 'un',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------
-- TABELA: awards  (Estoque → Premiações)
-- -----------------------------------------------------------
create type award_status as enum ('Pendente', 'Em Trânsito', 'Enviado', 'Entregue', 'Cancelado');

create table if not exists awards (
  id         uuid primary key default uuid_generate_v4(),
  client     text not null,
  award      text not null,
  status     award_status not null default 'Pendente',
  date       date not null,
  tracking   text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calls     enable row level security;
alter table inventory enable row level security;
alter table awards    enable row level security;

create policy "Allow all for authenticated" on calls
  for all to authenticated using (true) with check (true);
create policy "Allow all for authenticated" on inventory
  for all to authenticated using (true) with check (true);
create policy "Allow all for authenticated" on awards
  for all to authenticated using (true) with check (true);
