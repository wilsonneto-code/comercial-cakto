-- ── Tabela de tarefas do Gerente de Contas ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gc_tasks (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  activation_id uuid        REFERENCES public.activations(id) ON DELETE CASCADE,
  gerente_id    uuid        REFERENCES public.users(id),
  client_email  text        NOT NULL,
  client_name   text,
  title         text        NOT NULL,
  task_type     text        NOT NULL,
  -- alteracao_taxa | boas_vindas | followup_ativacao | acompanhamento_manual
  -- resultado_faturamento | acompanhamento_quinzenal | acompanhamento_semanal
  gc_tier       text,       -- starter | growth | enterprise | null
  due_at        timestamptz NOT NULL,
  completed_at  timestamptz,
  completed_by  uuid        REFERENCES public.users(id),
  notes         text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_tasks_gerente    ON public.gc_tasks(gerente_id);
CREATE INDEX IF NOT EXISTS idx_gc_tasks_due        ON public.gc_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_gc_tasks_completed  ON public.gc_tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_gc_tasks_activation ON public.gc_tasks(activation_id);

ALTER TABLE public.gc_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gc_tasks_select" ON public.gc_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "gc_tasks_insert" ON public.gc_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gc_tasks_update" ON public.gc_tasks FOR UPDATE TO authenticated USING (true);


-- ── Função: cria as tarefas ao inserir uma ativação ───────────────────────────

CREATE OR REPLACE FUNCTION public.create_gc_tasks_for_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_fat  numeric;
  v_gid  uuid;
  v_base timestamptz := NOW();
BEGIN
  v_fat := NEW.faturamento_mensal;
  v_gid := NEW.gerente_id;

  -- Determina o tier
  v_tier := CASE
    WHEN v_fat IS NULL   THEN NULL
    WHEN v_fat <= 50000  THEN 'starter'
    WHEN v_fat <= 250000 THEN 'growth'
    ELSE                      'enterprise'
  END;

  -- ── Tarefas universais ─────────────────────────────────────────────────────
  INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
  VALUES
    (NEW.id, v_gid, NEW.email, NEW.client, 'Alteração de Taxa', 'alteracao_taxa', v_tier, v_base + INTERVAL '1 hour'),
    (NEW.id, v_gid, NEW.email, NEW.client, 'Boas Vindas',       'boas_vindas',    v_tier, v_base + INTERVAL '1 day');

  -- ── GC Starter ─────────────────────────────────────────────────────────────
  IF v_tier = 'starter' THEN
    INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
    VALUES
      (NEW.id, v_gid, NEW.email, NEW.client, 'Followup Ativação',       'followup_ativacao',      'starter', v_base + INTERVAL '7 days'),
      (NEW.id, v_gid, NEW.email, NEW.client, 'Acompanhamento Manual',   'acompanhamento_manual',  'starter', v_base + INTERVAL '15 days'),
      (NEW.id, v_gid, NEW.email, NEW.client, 'Resultado do Faturamento','resultado_faturamento',  'starter', v_base + INTERVAL '30 days');
  END IF;

  -- ── GC Growth: primeira tarefa quinzenal ────────────────────────────────────
  IF v_tier = 'growth' THEN
    INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
    VALUES (NEW.id, v_gid, NEW.email, NEW.client, 'Acompanhamento Quinzenal', 'acompanhamento_quinzenal', 'growth', v_base + INTERVAL '15 days');
  END IF;

  -- ── GC Enterprise: primeira tarefa semanal ─────────────────────────────────
  IF v_tier = 'enterprise' THEN
    INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
    VALUES (NEW.id, v_gid, NEW.email, NEW.client, 'Acompanhamento Semanal', 'acompanhamento_semanal', 'enterprise', v_base + INTERVAL '7 days');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_activation_create_gc_tasks ON public.activations;
CREATE TRIGGER on_activation_create_gc_tasks
  AFTER INSERT ON public.activations
  FOR EACH ROW EXECUTE FUNCTION public.create_gc_tasks_for_activation();


-- ── Função: agenda próxima tarefa recorrente ao concluir ──────────────────────

CREATE OR REPLACE FUNCTION public.schedule_next_recurring_gc_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Só age quando completed_at passa de NULL → preenchido
  IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Acompanhamento Quinzenal → próximo em 15 dias
  IF NEW.task_type = 'acompanhamento_quinzenal' THEN
    INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
    VALUES (NEW.activation_id, NEW.gerente_id, NEW.client_email, NEW.client_name,
            'Acompanhamento Quinzenal', 'acompanhamento_quinzenal', 'growth',
            NEW.completed_at + INTERVAL '15 days');
  END IF;

  -- Acompanhamento Semanal → próximo em 7 dias
  IF NEW.task_type = 'acompanhamento_semanal' THEN
    INSERT INTO public.gc_tasks (activation_id, gerente_id, client_email, client_name, title, task_type, gc_tier, due_at)
    VALUES (NEW.activation_id, NEW.gerente_id, NEW.client_email, NEW.client_name,
            'Acompanhamento Semanal', 'acompanhamento_semanal', 'enterprise',
            NEW.completed_at + INTERVAL '7 days');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_gc_task_completed_schedule_next ON public.gc_tasks;
CREATE TRIGGER on_gc_task_completed_schedule_next
  AFTER UPDATE ON public.gc_tasks
  FOR EACH ROW EXECUTE FUNCTION public.schedule_next_recurring_gc_task();
