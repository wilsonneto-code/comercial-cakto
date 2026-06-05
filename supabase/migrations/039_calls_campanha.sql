-- Adiciona coluna campanha na tabela calls
alter table calls add column if not exists campanha text not null default '';
