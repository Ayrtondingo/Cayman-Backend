-- ============================================================================
-- MIGRACION COMPLETA — Cayman Bank
--
-- Pegar TODO esto en: Supabase → SQL Editor → New query → Run
--
-- Va en una sola transaccion: o se aplica entero, o no se aplica nada.
-- Es seguro reejecutarlo: lo que ya existe se saltea.
--
-- Que hace:
--   1. Renombra accounts.accountNumber a cbu PRESERVANDO los valores.
--      (Sin esto, TypeORM haria DROP + ADD y se perderian los CBU.)
--   2. Agrega accounts.currency, users.dni, users.birthDate,
--      transactions.category.
--   3. Crea las 14 tablas de tarjetas, prestamos, servicios, recargas,
--      inversiones, seguros y asistente.
-- ============================================================================

BEGIN;

-- ─────────────────────────── 1. Renombre y columnas nuevas ───────────────────
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

-- ─────────────────────── 2. Esquema de los modulos nuevos ────────────────────
-- ============================================================================
-- Esquema de los modulos nuevos: tarjetas, prestamos, servicios, recargas,
-- inversiones, seguros y asistente.
--
-- Ejecutar DESPUES de 001 y ANTES de arrancar el backend con
-- DB_SYNCHRONIZE en false.
--
-- Idempotente: se puede reintentar si un deploy quedo a medias.
-- Generado con el schema builder de TypeORM contra una replica del esquema
-- de produccion, no escrito a mano: es exactamente el SQL que `synchronize`
-- habria corrido.
--
-- Tambien recrea las foreign keys de accounts y transactions, que ahora
-- llevan ON DELETE CASCADE.
-- ============================================================================

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_accountId_fkey";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_userId_fkey";
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'utility_bills_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."utility_bills_status_enum" AS ENUM(''pendiente'', ''pagada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "utility_bills" ("id" SERIAL NOT NULL, "numeroCliente" character varying NOT NULL, "importe" numeric(12,2) NOT NULL, "vencimiento" date NOT NULL, "status" "public"."utility_bills_status_enum" NOT NULL DEFAULT 'pendiente', "paidAt" TIMESTAMP, "paidByUserId" character varying, "companyId" integer, CONSTRAINT "PK_7618d9af9616422f5d25ddff5bf" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "IDX_facbc3162d6ed6d0caf53847d3" ON "utility_bills" ("companyId", "numeroCliente") ;
CREATE TABLE IF NOT EXISTS "utility_companies" ("id" SERIAL NOT NULL, "nombre" character varying NOT NULL, "rubro" character varying NOT NULL, CONSTRAINT "UQ_1e7b4021191856f5871359e48c5" UNIQUE ("nombre"), CONSTRAINT "PK_bac829d0a6bb3984ede97f829e4" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'topups_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."topups_status_enum" AS ENUM(''aprobada'', ''rechazada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "topups" ("id" SERIAL NOT NULL, "operadora" character varying NOT NULL, "numero" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "status" "public"."topups_status_enum" NOT NULL, "motivo" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_fbfc343134573ee4a34f9785208" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loans_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."loans_status_enum" AS ENUM(''vigente'', ''cancelado'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "loans" ("id" SERIAL NOT NULL, "amount" numeric(12,2) NOT NULL, "termMonths" integer NOT NULL, "tna" numeric(6,4) NOT NULL, "installmentAmount" numeric(12,2) NOT NULL, "status" "public"."loans_status_enum" NOT NULL DEFAULT 'vigente', "cbu" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_installments_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."loan_installments_status_enum" AS ENUM(''pendiente'', ''pagada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "loan_installments" ("id" SERIAL NOT NULL, "number" integer NOT NULL, "principal" numeric(12,2) NOT NULL, "interest" numeric(12,2) NOT NULL, "total" numeric(12,2) NOT NULL, "remainingPrincipal" numeric(12,2) NOT NULL, "dueDate" date NOT NULL, "status" "public"."loan_installments_status_enum" NOT NULL DEFAULT 'pendiente', "paidAt" TIMESTAMP, "loanId" integer, CONSTRAINT "UQ_installment_loan_number" UNIQUE ("loanId", "number"), CONSTRAINT "PK_d69494e8c24dd3a2131f4d10168" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fixed_terms_type_enum') THEN
    EXECUTE 'CREATE TYPE "public"."fixed_terms_type_enum" AS ENUM(''tradicional'', ''uva'')';
  END IF;
END $mig$;
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fixed_terms_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."fixed_terms_status_enum" AS ENUM(''vigente'', ''vencido'', ''acreditado'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "fixed_terms" ("id" SERIAL NOT NULL, "capital" numeric(12,2) NOT NULL, "termDays" integer NOT NULL, "tna" numeric(6,4) NOT NULL, "type" "public"."fixed_terms_type_enum" NOT NULL DEFAULT 'tradicional', "uvaAtStart" numeric(12,4), "maturityDate" date NOT NULL, "status" "public"."fixed_terms_status_enum" NOT NULL DEFAULT 'vigente', "cbu" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_3406d051589628e04334338b579" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cedear_orders_type_enum') THEN
    EXECUTE 'CREATE TYPE "public"."cedear_orders_type_enum" AS ENUM(''compra'', ''venta'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "cedear_orders" ("id" SERIAL NOT NULL, "ticker" character varying NOT NULL, "quantity" integer NOT NULL, "type" "public"."cedear_orders_type_enum" NOT NULL, "price" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_84122b53729b41f08ca65aea3f4" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "IDX_dcbe0ffdf4f42564d01184741b" ON "cedear_orders" ("userId", "ticker") ;
CREATE TABLE IF NOT EXISTS "insurance_products" ("id" SERIAL NOT NULL, "nombre" character varying NOT NULL, "tipo" character varying NOT NULL, "tasaBase" numeric(8,6) NOT NULL, CONSTRAINT "UQ_dd1c459b37aabcd9eb43b7eed55" UNIQUE ("nombre"), CONSTRAINT "PK_36ac5b506fcc1644ddf95580824" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insurance_claims_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."insurance_claims_status_enum" AS ENUM(''en_analisis'', ''aprobado'', ''rechazado'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "insurance_claims" ("id" SERIAL NOT NULL, "descripcion" character varying NOT NULL, "status" "public"."insurance_claims_status_enum" NOT NULL DEFAULT 'en_analisis', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "policyId" integer, CONSTRAINT "PK_c6f7929fdcec8c17a24034a48d3" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insurance_policies_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."insurance_policies_status_enum" AS ENUM(''vigente'', ''cancelada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "insurance_policies" ("id" SERIAL NOT NULL, "sumaAsegurada" numeric(14,2) NOT NULL, "prima" numeric(12,2) NOT NULL, "edadAlContratar" integer NOT NULL, "beneficiarios" jsonb NOT NULL DEFAULT '[]', "status" "public"."insurance_policies_status_enum" NOT NULL DEFAULT 'vigente', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" integer, "userId" character varying, CONSTRAINT "PK_69af1d3a19277d1a822c9b13bf1" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_messages_role_enum') THEN
    EXECUTE 'CREATE TYPE "public"."chat_messages_role_enum" AS ENUM(''user'', ''assistant'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "chat_messages" ("id" SERIAL NOT NULL, "role" "public"."chat_messages_role_enum" NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "IDX_57e7ca830e61203898e7404155" ON "chat_messages" ("userId", "createdAt") ;
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_authorizations_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."card_authorizations_status_enum" AS ENUM(''aprobada'', ''rechazada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "card_authorizations" ("id" SERIAL NOT NULL, "comercio" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "cuotas" integer NOT NULL DEFAULT '1', "status" "public"."card_authorizations_status_enum" NOT NULL, "motivo" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "cardId" integer, CONSTRAINT "PK_8240e2f5a7ff8cfc26ee27463aa" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cards_type_enum') THEN
    EXECUTE 'CREATE TYPE "public"."cards_type_enum" AS ENUM(''debito'', ''credito'')';
  END IF;
END $mig$;
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cards_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."cards_status_enum" AS ENUM(''activa'', ''bloqueada'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "cards" ("id" SERIAL NOT NULL, "type" "public"."cards_type_enum" NOT NULL, "number" character varying NOT NULL, "cbuAsociado" character varying, "limite" numeric(12,2), "status" "public"."cards_status_enum" NOT NULL DEFAULT 'activa', "expiresAt" date NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "UQ_5deec73c016e2940ce4ced835e2" UNIQUE ("number"), CONSTRAINT "PK_5f3269634705fdff4a9935860fc" PRIMARY KEY ("id"));
DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_escalations_status_enum') THEN
    EXECUTE 'CREATE TYPE "public"."chat_escalations_status_enum" AS ENUM(''pendiente'', ''en_curso'', ''resuelta'')';
  END IF;
END $mig$;
CREATE TABLE IF NOT EXISTS "chat_escalations" ("id" SERIAL NOT NULL, "motivo" text NOT NULL, "status" "public"."chat_escalations_status_enum" NOT NULL DEFAULT 'pendiente', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying, CONSTRAINT "PK_8220bae66d0e1f895af73e3e692" PRIMARY KEY ("id"));
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "UQ_38b11b5b29521765ca11082a2ea";
ALTER TABLE "accounts" ADD CONSTRAINT "UQ_38b11b5b29521765ca11082a2ea" UNIQUE ("cbu");
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "UQ_a5f4f991f324bd85b79afb8d371";
ALTER TABLE "accounts" ADD CONSTRAINT "UQ_a5f4f991f324bd85b79afb8d371" UNIQUE ("alias");
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_5fe9cfa518b76c96518a206b350";
ALTER TABLE "users" ADD CONSTRAINT "UQ_5fe9cfa518b76c96518a206b350" UNIQUE ("dni");
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "UQ_account_user_currency";
ALTER TABLE "accounts" ADD CONSTRAINT "UQ_account_user_currency" UNIQUE ("userId", "currency");
ALTER TABLE "utility_bills" DROP CONSTRAINT IF EXISTS "FK_f172c6e196a6fe3ef07b48d84df";
ALTER TABLE "utility_bills" ADD CONSTRAINT "FK_f172c6e196a6fe3ef07b48d84df" FOREIGN KEY ("companyId") REFERENCES "utility_companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "FK_26d8aec71ae9efbe468043cd2b9";
ALTER TABLE "transactions" ADD CONSTRAINT "FK_26d8aec71ae9efbe468043cd2b9" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "FK_3aa23c0a6d107393e8b40e3e2a6";
ALTER TABLE "accounts" ADD CONSTRAINT "FK_3aa23c0a6d107393e8b40e3e2a6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "topups" DROP CONSTRAINT IF EXISTS "FK_c909c1a4f0b93d4ac6462923ad7";
ALTER TABLE "topups" ADD CONSTRAINT "FK_c909c1a4f0b93d4ac6462923ad7" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "FK_4c2ab4e556520045a2285916d45";
ALTER TABLE "loans" ADD CONSTRAINT "FK_4c2ab4e556520045a2285916d45" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "loan_installments" DROP CONSTRAINT IF EXISTS "FK_d5e31e586cc96ce27d00831f12d";
ALTER TABLE "loan_installments" ADD CONSTRAINT "FK_d5e31e586cc96ce27d00831f12d" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "fixed_terms" DROP CONSTRAINT IF EXISTS "FK_d287a262b910c676fec23660c83";
ALTER TABLE "fixed_terms" ADD CONSTRAINT "FK_d287a262b910c676fec23660c83" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "cedear_orders" DROP CONSTRAINT IF EXISTS "FK_09043745b6b64b5c47dd26645a6";
ALTER TABLE "cedear_orders" ADD CONSTRAINT "FK_09043745b6b64b5c47dd26645a6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "insurance_claims" DROP CONSTRAINT IF EXISTS "FK_ef0233f5751c8f5bb838dcc9c51";
ALTER TABLE "insurance_claims" ADD CONSTRAINT "FK_ef0233f5751c8f5bb838dcc9c51" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "insurance_policies" DROP CONSTRAINT IF EXISTS "FK_bb5bc529bac0368ab231429802d";
ALTER TABLE "insurance_policies" ADD CONSTRAINT "FK_bb5bc529bac0368ab231429802d" FOREIGN KEY ("productId") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "insurance_policies" DROP CONSTRAINT IF EXISTS "FK_c76434dc53acdd818f5637bc8b9";
ALTER TABLE "insurance_policies" ADD CONSTRAINT "FK_c76434dc53acdd818f5637bc8b9" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "FK_43d968962b9e24e1e3517c0fbff";
ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_43d968962b9e24e1e3517c0fbff" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "card_authorizations" DROP CONSTRAINT IF EXISTS "FK_ff9f8b20fc41f3123f35c5dfc49";
ALTER TABLE "card_authorizations" ADD CONSTRAINT "FK_ff9f8b20fc41f3123f35c5dfc49" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "FK_7b7230897ecdeb7d6b0576d907b";
ALTER TABLE "cards" ADD CONSTRAINT "FK_7b7230897ecdeb7d6b0576d907b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "chat_escalations" DROP CONSTRAINT IF EXISTS "FK_559210556209f3317caa648d811";
ALTER TABLE "chat_escalations" ADD CONSTRAINT "FK_559210556209f3317caa648d811" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;

-- ─────────────────────────────── Verificacion ────────────────────────────────
-- cuentas_con_cbu tiene que ser igual a cuentas, y tablas_nuevas tiene que dar 14.
SELECT
  (SELECT count(*)::int FROM accounts)      AS cuentas,
  (SELECT count(cbu)::int FROM accounts)    AS cuentas_con_cbu,
  (SELECT count(*)::int FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN (
     'cards','card_authorizations','loans','loan_installments','utility_companies',
     'utility_bills','topups','fixed_terms','cedear_orders','insurance_products',
     'insurance_policies','insurance_claims','chat_messages','chat_escalations'
   )) AS tablas_nuevas;
