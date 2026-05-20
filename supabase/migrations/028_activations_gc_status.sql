ALTER TABLE activations ADD COLUMN IF NOT EXISTS gc_status text DEFAULT 'Cliente novo';
UPDATE activations SET gc_status = 'Cliente novo' WHERE gc_status IS NULL;
