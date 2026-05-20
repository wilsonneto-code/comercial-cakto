-- Migration: 024_activations_notes_images.sql
-- Adiciona notas e urls de imagens às ativações

ALTER TABLE public.activations
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- Bucket de armazenamento de arquivos de ativação
INSERT INTO storage.buckets (id, name, public)
VALUES ('ativacoes-arquivos', 'ativacoes-arquivos', true)
ON CONFLICT (id) DO NOTHING;

-- Política: autenticados podem fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Upload ativacoes' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Upload ativacoes" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'ativacoes-arquivos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Read ativacoes' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Read ativacoes" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'ativacoes-arquivos');
  END IF;
END $$;
