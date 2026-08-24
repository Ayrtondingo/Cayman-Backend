-- ============================================================================
-- Agenda de destinatarios. Se llena sola con cada transferencia completada.
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TYPE "public"."transfer_contacts_currency_enum" AS ENUM('ARS', 'USD');
CREATE TABLE IF NOT EXISTS "transfer_contacts" ("id" SERIAL NOT NULL, "cbu" character varying NOT NULL, "alias" character varying, "nombre" character varying, "apodo" character varying, "bankCode" integer, "currency" "public"."transfer_contacts_currency_enum" NOT NULL DEFAULT 'ARS', "vecesUsado" integer NOT NULL DEFAULT '0', "ultimoUso" TIMESTAMP, "userId" character varying, CONSTRAINT "UQ_contact_user_cbu" UNIQUE ("userId", "cbu"), CONSTRAINT "PK_1bdaa9c141d6051bd0f41792bb7" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "IDX_27c607baa16206699ce60efd1b" ON "transfer_contacts" ("userId", "ultimoUso") ;
ALTER TABLE "transfer_contacts" DROP CONSTRAINT IF EXISTS "FK_02ef27dc03bcdb658789bb2092e";
ALTER TABLE "transfer_contacts" ADD CONSTRAINT "FK_02ef27dc03bcdb658789bb2092e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;

SELECT to_regclass('public.transfer_contacts') IS NOT NULL AS tabla_creada;
