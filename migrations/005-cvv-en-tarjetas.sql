-- ============================================================================
-- CVV en las tarjetas.
--
-- La columna es NOT NULL, pero puede haber tarjetas ya emitidas. Un
-- `ADD COLUMN ... NOT NULL` sin default falla sobre una tabla con filas, asi
-- que va en tres pasos: agregar nullable, rellenar, recien ahi exigir NOT NULL.
--
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "cvv" character varying(3);

-- Las tarjetas que ya existian reciben un CVV aleatorio: no habia forma de
-- recuperar el que "deberian" tener, porque nunca existio.
UPDATE "cards"
SET "cvv" = lpad((floor(random() * 1000))::int::text, 3, '0')
WHERE "cvv" IS NULL;

ALTER TABLE "cards" ALTER COLUMN "cvv" SET NOT NULL;

COMMIT;

-- Verificacion: ninguna tarjeta sin CVV.
SELECT count(*) AS tarjetas, count("cvv") AS con_cvv FROM "cards";
