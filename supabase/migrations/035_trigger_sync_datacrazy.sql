-- Trigger: dispara sync-datacrazy automaticamente em todo INSERT em activations
-- Garante que todo cliente ativado seja sincronizado no DataCrazy CRM,
-- independente de como a ativação foi criada (frontend, admin, importação, etc.)

CREATE OR REPLACE FUNCTION public.trigger_sync_datacrazy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id  uuid;
  v_payload  jsonb;
BEGIN
  -- Busca o team_id do responsável
  SELECT team_id INTO v_team_id
  FROM public.users
  WHERE id = NEW.responsible;

  -- Só sincroniza se o responsável tiver um time mapeado
  IF v_team_id IS NULL THEN
    RAISE LOG '[sync-datacrazy trigger] Sem team_id para responsible=%, pulando', NEW.responsible;
    RETURN NEW;
  END IF;

  -- Monta o payload para a edge function
  v_payload := jsonb_build_object(
    'name',               NEW.client,
    'email',              NEW.email,
    'phone',              NEW.phone,
    'team_uuid',          v_team_id,
    'channel',            NEW.channel,
    'faturamento_mensal', NEW.faturamento_mensal,
    'notes',              NEW.notes,
    'image_urls',         COALESCE(to_jsonb(NEW.image_urls), '[]'::jsonb)
  );

  -- Dispara a edge function de forma assíncrona via pg_net
  PERFORM net.http_post(
    url     := 'https://dugjrmjlcmkeyjjbqxxk.supabase.co/functions/v1/sync-datacrazy',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z2pybWpsY21rZXlqamJxeHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTIzOTcsImV4cCI6MjA4OTI2ODM5N30.t70r0f2jI0PhTnrKwgUIGHdyfjI8mLrPdqehYz5ayzI"}'::jsonb,
    body    := v_payload
  );

  RAISE LOG '[sync-datacrazy trigger] Disparado para email=%, team=%', NEW.email, v_team_id;
  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir
DROP TRIGGER IF EXISTS on_activation_sync_datacrazy ON public.activations;

-- Cria o trigger: roda APÓS o INSERT, uma vez por linha
CREATE TRIGGER on_activation_sync_datacrazy
  AFTER INSERT ON public.activations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_datacrazy();
