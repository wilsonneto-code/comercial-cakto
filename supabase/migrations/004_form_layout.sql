-- ============================================================
-- Migration 004: Logo e cor de texto dos campos nos formulários
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS logo_url        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS field_text_color text NOT NULL DEFAULT '#ffffff';
