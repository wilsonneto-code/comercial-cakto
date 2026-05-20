-- Migration: 015_configuracoes.sql
-- Tabela de configurações do sistema (URL/token DataCrazy etc.)

CREATE TABLE IF NOT EXISTS public.configuracoes (
  id         SERIAL PRIMARY KEY,
  chave      VARCHAR(255) UNIQUE NOT NULL,
  valor      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(255)
);

INSERT INTO public.configuracoes (chave, valor) VALUES
  ('datacrazy_webhook_url',   ''),
  ('datacrazy_webhook_token', '')
ON CONFLICT (chave) DO NOTHING;

-- RLS: apenas Admins podem ler e escrever
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia configuracoes"
  ON public.configuracoes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
        AND role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
        AND role = 'Admin'
    )
  );

-- RLS para webhook_logs: Admin pode ver, service role pode inserir (bypassa RLS)
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode ver webhook_logs"
  ON public.webhook_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = (auth.jwt() ->> 'email')
        AND role = 'Admin'
    )
  );
