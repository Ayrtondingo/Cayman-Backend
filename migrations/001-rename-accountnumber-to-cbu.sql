-- ============================================================================
-- Ejecutar UNA VEZ contra la base de produccion ANTES de que arranque la
-- version nueva del backend.
--
-- Por que: la entidad Account paso de `accountNumber` a `cbu`. Con
-- `synchronize: true`, TypeORM no entiende que es un renombre: ve una columna
-- que sobra y otra que falta, asi que hace DROP de `accountNumber` y ADD de
-- `cbu` vacia. Resultado: se pierden todos los CBU de los clientes, que son
-- los que asigno el Banco Central y no se pueden regenerar del lado del banco.
--
-- Este script hace el renombre a mano, preservando los valores. Es idempotente:
-- se puede correr varias veces sin romper nada.
--
-- Como correrlo en Supabase: SQL Editor -> pegar -> Run.
-- ============================================================================

BEGIN;

-- 1. Renombre preservando los datos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'accountNumber'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'cbu'
  ) THEN
    ALTER TABLE accounts RENAME COLUMN "accountNumber" TO "cbu";
    RAISE NOTICE 'accounts.accountNumber renombrada a accounts.cbu';
  ELSE
    RAISE NOTICE 'El renombre no hacia falta (ya aplicado o columna inexistente)';
  END IF;
END $$;

-- 2. Columna de moneda. Se crea con default ARS porque todas las cuentas que
--    existen hoy son cajas en pesos: la de dolares es nueva.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accounts_currency_enum') THEN
    CREATE TYPE accounts_currency_enum AS ENUM ('ARS', 'USD');
  END IF;
END $$;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS currency accounts_currency_enum NOT NULL DEFAULT 'ARS';

-- 3. DNI y fecha de nacimiento del titular. Nullable: los clientes que ya
--    existen no los tienen cargados y se completan al resincronizar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS dni varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "birthDate" date;

-- 4. Categoria de los movimientos, para el resumen de gastos. Los movimientos
--    viejos quedan en 'otros', que es justamente lo que son: no hay forma de
--    reclasificarlos hacia atras.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_category_enum') THEN
    CREATE TYPE transactions_category_enum AS ENUM (
      'transferencia', 'deposito', 'extraccion', 'cambio_divisas', 'tarjeta',
      'prestamo', 'servicios', 'recarga', 'inversion', 'seguro', 'otros'
    );
  END IF;
END $$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category transactions_category_enum NOT NULL DEFAULT 'otros';

-- Las transferencias viejas si se pueden clasificar: se sabe que lo eran.
UPDATE transactions SET category = 'transferencia'
  WHERE category = 'otros' AND type = 'TRANSFER';

COMMIT;

-- Verificacion: los CBU tienen que seguir ahi.
SELECT
  count(*)                                   AS cuentas,
  count(cbu)                                 AS con_cbu,
  count(*) FILTER (WHERE currency = 'ARS')   AS en_pesos
FROM accounts;
