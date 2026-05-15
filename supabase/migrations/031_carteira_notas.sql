CREATE TABLE IF NOT EXISTS carteira_notas (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       text NOT NULL,
  motivo      text,
  observacao  text,
  proxima_acao text,
  data_contato date,
  criado_por  uuid REFERENCES users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(email)
);

GRANT ALL ON TABLE carteira_notas TO authenticated, anon, service_role;
