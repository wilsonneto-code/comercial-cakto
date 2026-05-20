-- Migration 034: adicionar cargo Sócio ao enum user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Sócio';
