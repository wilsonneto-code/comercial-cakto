-- ============================================================
-- Migration 003: Personalização visual dos formulários
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS bg_color        text    NOT NULL DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS field_bg_color  text    NOT NULL DEFAULT '#1e293b',
  ADD COLUMN IF NOT EXISTS bg_opacity      integer NOT NULL DEFAULT 60
                                                   CHECK (bg_opacity BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS redirect_url    text    NOT NULL DEFAULT '';

-- Garante que a policy anon para leitura de forms publicados existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forms' AND policyname = 'Anon pode ler formularios publicados'
  ) THEN
    CREATE POLICY "Anon pode ler formularios publicados" ON public.forms
      FOR SELECT TO anon
      USING (active = true AND status = 'Publicado');
  END IF;
END $$;
