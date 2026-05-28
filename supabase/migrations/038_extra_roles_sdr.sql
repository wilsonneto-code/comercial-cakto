-- Adiciona SDR como papel secundário para Carlos Eduardo e Geovana Paiva
UPDATE users
SET extra_roles = array_append(
  COALESCE(extra_roles, '{}'),
  'SDR'
)
WHERE (
  id = '0bfe1dcb-9827-4a2a-8850-8343c53985f5'  -- Carlos Eduardo
  OR name ILIKE '%Geovana%'
)
AND NOT ('SDR' = ANY(COALESCE(extra_roles, '{}')));
