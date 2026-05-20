-- Faturamento mensal e gerente responsável nas ativações
ALTER TABLE activations
  ADD COLUMN IF NOT EXISTS faturamento_mensal numeric(15,2),
  ADD COLUMN IF NOT EXISTS gerente_id uuid REFERENCES users(id);

-- Reuniões de follow-up dos gerentes de contas
CREATE TABLE IF NOT EXISTS followup_meetings (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  activation_id    uuid REFERENCES activations(id) ON DELETE SET NULL,
  gerente_id       uuid REFERENCES users(id),
  title            text NOT NULL,
  date             date NOT NULL,
  time             time NOT NULL DEFAULT '09:00',
  end_time         time,
  status           text NOT NULL DEFAULT 'Agendada',
  notes            text,
  client_email     text,
  google_event_id  text,
  meet_link        text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE followup_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_meetings_all" ON followup_meetings FOR ALL USING (true) WITH CHECK (true);
