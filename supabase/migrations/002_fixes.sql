-- ============================================================
-- Sistema Comercial — Migration 002: Correções e Novas Tabelas
-- Execute este script no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================


-- ── TAREFA 2: Permissão de Admin ─────────────────────────────────────────
-- Substitua [MEU_EMAIL] pelo seu e-mail cadastrado antes de executar.

UPDATE users
SET    role = 'Admin'
WHERE  email = '[MEU_EMAIL]';


-- ── TAREFA 3: RLS — liberar SELECT para usuários autenticados ─────────────
-- As tabelas já têm "Allow all for authenticated", mas caso faltem:

DO $$
BEGIN
  -- users: leitura anon também (necessário para formulários públicos)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow read for anon'
  ) THEN
    CREATE POLICY "Allow read for anon" ON users
      FOR SELECT TO anon USING (true);
  END IF;

  -- activations: leitura anon (dashboards embarcados)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activations' AND policyname = 'Allow read for anon'
  ) THEN
    CREATE POLICY "Allow read for anon" ON activations
      FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ── TAREFA 4a: Colunas faltando em forms ─────────────────────────────────
-- A tabela forms não tinha custom_domain nem background_image no schema original.

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS custom_domain     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_image  text NOT NULL DEFAULT '';


-- ── TAREFA 4b: Tabela premio_forms ───────────────────────────────────────
-- Formulários específicos de premiação (separados dos forms gerais).

CREATE TABLE IF NOT EXISTS premio_forms (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             text        NOT NULL,
  slug             text        NOT NULL UNIQUE,
  active           boolean     NOT NULL DEFAULT true,
  color            text        NOT NULL DEFAULT '#2997FF',
  status           form_status NOT NULL DEFAULT 'Rascunho',
  fields           jsonb       NOT NULL DEFAULT '[]',
  webhook          text        NOT NULL DEFAULT '',
  custom_domain    text        NOT NULL DEFAULT '',
  background_image text        NOT NULL DEFAULT '',
  responses        integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE premio_forms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'premio_forms' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON premio_forms
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'premio_forms' AND policyname = 'Allow read for anon'
  ) THEN
    CREATE POLICY "Allow read for anon" ON premio_forms
      FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ── TAREFA 4c: Tabela estoque_premiacoes ─────────────────────────────────

CREATE TABLE IF NOT EXISTS estoque_premiacoes (
  id                    uuid    PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_item             text    NOT NULL,
  quantidade_disponivel integer NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estoque_premiacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'estoque_premiacoes' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON estoque_premiacoes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── TAREFA 4d: Tabela premio_submissions ─────────────────────────────────
-- Cada linha = um item de premiação ganho por um colaborador.

CREATE TABLE IF NOT EXISTS premio_submissions (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id              uuid        REFERENCES premio_forms(id) ON DELETE SET NULL,
  estoque_premiacoes_id uuid       REFERENCES estoque_premiacoes(id) ON DELETE RESTRICT,
  nome_ganhador        text        NOT NULL,
  email_ganhador       text,
  dados_formulario     jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE premio_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'premio_submissions' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON premio_submissions
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  -- Anon pode submeter (formulário público)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'premio_submissions' AND policyname = 'Allow insert for anon'
  ) THEN
    CREATE POLICY "Allow insert for anon" ON premio_submissions
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;


-- ── TAREFA 4e: Function + Trigger deduzir_estoque ─────────────────────────
-- Quando um novo INSERT ocorre em premio_submissions, subtrai 1 do estoque.

CREATE OR REPLACE FUNCTION deduzir_estoque()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.estoque_premiacoes_id IS NOT NULL THEN
    UPDATE estoque_premiacoes
    SET    quantidade_disponivel = quantidade_disponivel - 1,
           updated_at            = now()
    WHERE  id = NEW.estoque_premiacoes_id
      AND  quantidade_disponivel > 0;

    -- Bloqueia a submissão se não houver estoque
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item sem estoque disponível (id: %)', NEW.estoque_premiacoes_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduzir_estoque ON premio_submissions;

CREATE TRIGGER trg_deduzir_estoque
  BEFORE INSERT ON premio_submissions
  FOR EACH ROW
  EXECUTE FUNCTION deduzir_estoque();


-- ── TAREFA ROLE: RLS — usuário lê seu próprio perfil ─────────────────────
-- Permite que o usuário autenticado leia sua própria linha em public.users.
-- Funciona quando users.id = auth.uid() (padrão Supabase com trigger de signup).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'User can read own profile'
  ) THEN
    CREATE POLICY "User can read own profile" ON public.users
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- Trigger: cria a linha em public.users automaticamente ao fazer signUp,
-- garantindo que novos usuários sempre tenham um perfil com role correto.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'SDR'),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── FIX FORMULÁRIO PÚBLICO: RLS para anon ────────────────────────────────
-- Sem esta policy, visitantes não autenticados recebem data=null silenciosamente
-- e o frontend exibe "Formulário não encontrado" mesmo o form existindo.

DO $$
BEGIN
  -- Leitura pública: apenas forms ativos e publicados (seguro — não expõe rascunhos)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forms' AND policyname = 'Anon pode ler formularios publicados'
  ) THEN
    CREATE POLICY "Anon pode ler formularios publicados" ON public.forms
      FOR SELECT TO anon
      USING (active = true AND status = 'Publicado');
  END IF;

  -- Autenticados continuam com acesso total (já existia, garantindo idempotência)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'forms' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.forms
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── FIM ───────────────────────────────────────────────────────────────────
