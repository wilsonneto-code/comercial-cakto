-- Adiciona coluna image_urls na tabela calls
-- Permite que o closer envie imagens ao marcar uma call como Não Ativado
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
