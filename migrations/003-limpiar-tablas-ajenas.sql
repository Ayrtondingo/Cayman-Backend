-- ============================================================================
-- LIMPIEZA — eliminar el esquema que NO pertenece a este backend
--
-- La base de Supabase quedó con dos esquemas conviviendo:
--   · 17 tablas en inglés  -> las que usa este backend NestJS
--   · 12 tablas en español -> de otro diseño (¿un compañero? ¿la cátedra?)
--
-- Este script borra las 12 en español. Antes de correrlo:
--
--   1. CONFIRMÁ que no son de un compañero que esté trabajando sobre la misma
--      base. Si lo son, NO lo corras: hablalo primero.
--   2. Hay un backup de sus 9 filas en el scratchpad de la sesión, pero es
--      solo de los datos, no del esquema. Si querés poder recrear las tablas,
--      hacé un backup completo desde Supabase antes.
--
-- Pegar en: Supabase -> SQL Editor -> Run
-- ============================================================================

BEGIN;

-- CASCADE porque hay foreign keys entre ellas. El orden va de hija a padre
-- igual, para que CASCADE tenga que hacer lo menos posible.
DROP TABLE IF EXISTS "roles_permisos"      CASCADE;
DROP TABLE IF EXISTS "debitos_automaticos" CASCADE;
DROP TABLE IF EXISTS "logs_movimientos"    CASCADE;
DROP TABLE IF EXISTS "transacciones"       CASCADE;
DROP TABLE IF EXISTS "tarjetas"            CASCADE;
DROP TABLE IF EXISTS "cuentas"             CASCADE;
DROP TABLE IF EXISTS "usuarios"            CASCADE;
DROP TABLE IF EXISTS "personas"            CASCADE;
DROP TABLE IF EXISTS "permisos"            CASCADE;
DROP TABLE IF EXISTS "roles"               CASCADE;
DROP TABLE IF EXISTS "monedas"             CASCADE;
DROP TABLE IF EXISTS "bancos_externos"     CASCADE;

COMMIT;

-- ─────────────────────────────── Verificación ────────────────────────────────
-- Tienen que quedar exactamente 17 tablas, todas del backend.
SELECT count(*) AS tablas_restantes FROM information_schema.tables
WHERE table_schema = 'public';

SELECT string_agg(table_name, ', ' ORDER BY table_name) AS tablas
FROM information_schema.tables WHERE table_schema = 'public';
