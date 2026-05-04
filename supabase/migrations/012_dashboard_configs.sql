create table if not exists dashboard_configs (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null unique references auth.users(id) on delete cascade,
  config      jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

alter table dashboard_configs enable row level security;

create policy "owner full access"
  on dashboard_configs for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
