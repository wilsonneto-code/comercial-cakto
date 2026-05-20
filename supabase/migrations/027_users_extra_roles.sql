ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_roles text[] DEFAULT '{}';
