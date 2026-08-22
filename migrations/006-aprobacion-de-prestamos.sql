-- ============================================================================
-- Aprobacion de prestamos por el gerente.
--
-- Los prestamos que no pasan el chequeo de la central ya no se rechazan:
-- quedan PENDIENTE con la foto del informe adjunta, y el gerente decide.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "motivoRevision" character varying;
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "informeCentral" jsonb;
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "resueltoPor" character varying;
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "resueltoEl" TIMESTAMP;
ALTER TABLE "loans" ADD COLUMN IF NOT EXISTS "motivoRechazo" character varying;
ALTER TYPE "public"."loans_status_enum" RENAME TO "loans_status_enum_old";
CREATE TYPE "public"."loans_status_enum" AS ENUM('pendiente', 'vigente', 'cancelado', 'rechazado');
ALTER TABLE "loans" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "loans" ALTER COLUMN "status" TYPE "public"."loans_status_enum" USING "status"::"text"::"public"."loans_status_enum";
ALTER TABLE "loans" ALTER COLUMN "status" SET DEFAULT 'vigente';
DROP TYPE "public"."loans_status_enum_old";

COMMIT;

SELECT unnest(enum_range(NULL::loans_status_enum))::text AS estados_posibles;
