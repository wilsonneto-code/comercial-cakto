-- ============================================================
-- Migration 005: Tabela de submissões e logo_width nos forms
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Largura da logo no formulário público
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS logo_width integer NOT NULL DEFAULT 120;

-- Tabela de respostas dos formulários públicos
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      uuid        NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  data         jsonb       NOT NULL DEFAULT '{}',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'form_submissions' AND policyname = 'Anon pode submeter formulário'
  ) THEN
    CREATE POLICY "Anon pode submeter formulário" ON public.form_submissions
      FOR INSERT TO anon WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'form_submissions' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.form_submissions
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
