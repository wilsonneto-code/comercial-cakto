-- ============================================================
-- Migration 032: Cron automático para refresh do tpv_cache
-- Chama a Edge Function calcular-tpv 6x por dia (a cada 4h)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'refresh-tpv-cache',
  '0 0,4,8,12,16,20 * * *',
  'SELECT net.http_post(
    url := ''https://dugjrmjlcmkeyjjbqxxk.supabase.co/functions/v1/calcular-tpv'',
    headers := (''{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z2pybWpsY21rZXlqamJxeHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTIzOTcsImV4cCI6MjA4OTI2ODM5N30.t70r0f2jI0PhTnrKwgUIGHdyfjI8mLrPdqehYz5ayzI"}'')::jsonb,
    body := (''{"limite":30}'')::jsonb
  ) AS request_id'
);
