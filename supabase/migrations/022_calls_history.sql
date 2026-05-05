-- Migration: 022_calls_history.sql
-- Arquivamento mensal de calls e cron job automático

-- ── Tabela de histórico ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calls_history (
  id              uuid        NOT NULL,
  title           text        NOT NULL DEFAULT '',
  date            date        NOT NULL,
  time            time        NOT NULL,
  end_time        time,
  responsible     uuid,
  status          text        NOT NULL DEFAULT 'Agendada',
  notes           text        NOT NULL DEFAULT '',
  client_email    text        NOT NULL DEFAULT '',
  google_event_id text        NOT NULL DEFAULT '',
  meet_link       text        NOT NULL DEFAULT '',
  period          text        NOT NULL, -- formato YYYY-MM
  archived_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, period)
);

ALTER TABLE public.calls_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calls_history' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.calls_history
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Função de arquivamento ────────────────────────────────────────────────────
-- Copia as calls do mês/ano informado para calls_history e as remove de calls.
CREATE OR REPLACE FUNCTION public.archive_calls(p_year int, p_month int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period    text := lpad(p_year::text, 4, '0') || '-' || lpad(p_month::text, 2, '0');
  v_start     date := make_date(p_year, p_month, 1);
  v_end       date := v_start + INTERVAL '1 month';
  v_count     int;
BEGIN
  INSERT INTO public.calls_history
    (id, title, date, time, end_time, responsible, status, notes, client_email, google_event_id, meet_link, period)
  SELECT
    id, title, date, time, end_time, responsible, status, notes, client_email, google_event_id, meet_link, v_period
  FROM public.calls
  WHERE date >= v_start AND date < v_end
  ON CONFLICT (id, period) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.calls
  WHERE date >= v_start AND date < v_end;

  RETURN v_count;
END;
$$;

-- ── Cron job: 1º de cada mês às 00:05 ────────────────────────────────────────
-- Arquiva as calls do mês anterior automaticamente.
SELECT cron.schedule(
  'archive-calls-monthly',
  '5 0 1 * *',
  $$
    SELECT public.archive_calls(
      EXTRACT(YEAR  FROM (now() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '1 month'))::int,
      EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '1 month'))::int
    );
  $$
);
