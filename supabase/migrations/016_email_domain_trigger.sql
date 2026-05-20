-- Migration: 016_email_domain_trigger.sql
-- Trigger que rejeita cadastros fora do domínio autorizado no nível do banco

CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email NOT LIKE '%@cakto.com.br' THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_email_domain ON auth.users;

CREATE TRIGGER check_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_email_domain();
