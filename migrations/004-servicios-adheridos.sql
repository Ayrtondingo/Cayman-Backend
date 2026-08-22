-- ============================================================================
-- Servicios adheridos: guarda el numero de cliente que la persona tiene ante
-- cada empresa, para que no tenga que tipearlo cada vez que quiere ver su deuda.
--
-- Idempotente. Generado con el schema builder de TypeORM.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "service_subscriptions" ("id" SERIAL NOT NULL, "numeroCliente" character varying NOT NULL, "apodo" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "companyId" integer, "userId" character varying, CONSTRAINT "UQ_subscription_user_company" UNIQUE ("userId", "companyId"), CONSTRAINT "PK_a85f7714ffe6a7c26e004a0f06d" PRIMARY KEY ("id"));
ALTER TABLE "service_subscriptions" DROP CONSTRAINT IF EXISTS "FK_e0a6b6303fe88926bc453dcb85e";
ALTER TABLE "service_subscriptions" ADD CONSTRAINT "FK_e0a6b6303fe88926bc453dcb85e" FOREIGN KEY ("companyId") REFERENCES "utility_companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "service_subscriptions" DROP CONSTRAINT IF EXISTS "FK_4c4394ca4eefc3ad26bdb098fe6";
ALTER TABLE "service_subscriptions" ADD CONSTRAINT "FK_4c4394ca4eefc3ad26bdb098fe6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;

SELECT to_regclass('public.service_subscriptions') IS NOT NULL AS tabla_creada;
