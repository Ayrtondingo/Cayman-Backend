-- Esquema completo de Cayman Bank para una base NUEVA y vacia.
-- Generado desde las entidades de TypeORM (synchronize contra una base
-- temporal + pg_dump --schema-only), el 2026-09-28. Postgres lo aplica solo la
-- primera vez que arranca con el volumen vacio (docker-entrypoint-initdb.d).
-- Si cambian las entidades, hay que regenerarlo o sumar una migracion en migrations/.

--
-- PostgreSQL database dump
--

\restrict iJMdDGZgVdQXyscDFuVPl0BMgZewl3Ypr3PgZ4H3oayhq9ZPgwrULATA3wQxYaf

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: accounts_currency_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.accounts_currency_enum AS ENUM (
    'ARS',
    'USD'
);


--
-- Name: card_authorizations_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.card_authorizations_status_enum AS ENUM (
    'aprobada',
    'rechazada'
);


--
-- Name: cards_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cards_status_enum AS ENUM (
    'activa',
    'bloqueada'
);


--
-- Name: cards_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cards_type_enum AS ENUM (
    'debito',
    'credito'
);


--
-- Name: cedear_orders_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cedear_orders_type_enum AS ENUM (
    'compra',
    'venta'
);


--
-- Name: chat_escalations_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_escalations_status_enum AS ENUM (
    'pendiente',
    'en_curso',
    'resuelta'
);


--
-- Name: chat_messages_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_messages_role_enum AS ENUM (
    'user',
    'assistant'
);


--
-- Name: fixed_terms_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fixed_terms_status_enum AS ENUM (
    'vigente',
    'vencido',
    'acreditado'
);


--
-- Name: fixed_terms_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fixed_terms_type_enum AS ENUM (
    'tradicional',
    'uva'
);


--
-- Name: insurance_claims_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.insurance_claims_status_enum AS ENUM (
    'en_analisis',
    'aprobado',
    'rechazado'
);


--
-- Name: insurance_policies_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.insurance_policies_status_enum AS ENUM (
    'vigente',
    'cancelada'
);


--
-- Name: loan_installments_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loan_installments_status_enum AS ENUM (
    'pendiente',
    'pagada'
);


--
-- Name: loans_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.loans_status_enum AS ENUM (
    'pendiente',
    'vigente',
    'cancelado',
    'rechazado'
);


--
-- Name: topups_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.topups_status_enum AS ENUM (
    'aprobada',
    'rechazada'
);


--
-- Name: transactions_category_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transactions_category_enum AS ENUM (
    'transferencia',
    'deposito',
    'extraccion',
    'cambio_divisas',
    'tarjeta',
    'prestamo',
    'servicios',
    'recarga',
    'inversion',
    'seguro',
    'otros'
);


--
-- Name: transactions_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transactions_status_enum AS ENUM (
    'aprobada',
    'rechazada',
    'local'
);


--
-- Name: transactions_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transactions_type_enum AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'TRANSFER'
);


--
-- Name: transfer_contacts_currency_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_contacts_currency_enum AS ENUM (
    'ARS',
    'USD'
);


--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_role_enum AS ENUM (
    'user',
    'admin',
    'gerente'
);


--
-- Name: utility_bills_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.utility_bills_status_enum AS ENUM (
    'pendiente',
    'pagada'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    cbu character varying,
    alias character varying,
    currency public.accounts_currency_enum DEFAULT 'ARS'::public.accounts_currency_enum NOT NULL,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    "userId" character varying
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: card_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_authorizations (
    id integer NOT NULL,
    comercio character varying NOT NULL,
    amount numeric(12,2) NOT NULL,
    cuotas integer DEFAULT 1 NOT NULL,
    status public.card_authorizations_status_enum NOT NULL,
    motivo character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "cardId" integer
);


--
-- Name: card_authorizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.card_authorizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: card_authorizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.card_authorizations_id_seq OWNED BY public.card_authorizations.id;


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cards (
    id integer NOT NULL,
    type public.cards_type_enum NOT NULL,
    number character varying NOT NULL,
    cvv character varying(3) NOT NULL,
    "cbuAsociado" character varying,
    limite numeric(12,2),
    status public.cards_status_enum DEFAULT 'activa'::public.cards_status_enum NOT NULL,
    "expiresAt" date NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cards_id_seq OWNED BY public.cards.id;


--
-- Name: cedear_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cedear_orders (
    id integer NOT NULL,
    ticker character varying NOT NULL,
    quantity integer NOT NULL,
    type public.cedear_orders_type_enum NOT NULL,
    price numeric(12,2) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: cedear_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cedear_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cedear_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cedear_orders_id_seq OWNED BY public.cedear_orders.id;


--
-- Name: chat_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_escalations (
    id integer NOT NULL,
    motivo text NOT NULL,
    status public.chat_escalations_status_enum DEFAULT 'pendiente'::public.chat_escalations_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: chat_escalations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_escalations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_escalations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_escalations_id_seq OWNED BY public.chat_escalations.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    role public.chat_messages_role_enum NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: fixed_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_terms (
    id integer NOT NULL,
    capital numeric(12,2) NOT NULL,
    "termDays" integer NOT NULL,
    tna numeric(6,4) NOT NULL,
    type public.fixed_terms_type_enum DEFAULT 'tradicional'::public.fixed_terms_type_enum NOT NULL,
    "uvaAtStart" numeric(12,4),
    "maturityDate" date NOT NULL,
    status public.fixed_terms_status_enum DEFAULT 'vigente'::public.fixed_terms_status_enum NOT NULL,
    cbu character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: fixed_terms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fixed_terms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fixed_terms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fixed_terms_id_seq OWNED BY public.fixed_terms.id;


--
-- Name: insurance_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_claims (
    id integer NOT NULL,
    descripcion character varying NOT NULL,
    status public.insurance_claims_status_enum DEFAULT 'en_analisis'::public.insurance_claims_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "policyId" integer
);


--
-- Name: insurance_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insurance_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insurance_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insurance_claims_id_seq OWNED BY public.insurance_claims.id;


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id integer NOT NULL,
    "sumaAsegurada" numeric(14,2) NOT NULL,
    prima numeric(12,2) NOT NULL,
    "edadAlContratar" integer NOT NULL,
    beneficiarios jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public.insurance_policies_status_enum DEFAULT 'vigente'::public.insurance_policies_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "productId" integer,
    "userId" character varying
);


--
-- Name: insurance_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insurance_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insurance_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insurance_policies_id_seq OWNED BY public.insurance_policies.id;


--
-- Name: insurance_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_products (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    tipo character varying NOT NULL,
    "tasaBase" numeric(8,6) NOT NULL
);


--
-- Name: insurance_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insurance_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insurance_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insurance_products_id_seq OWNED BY public.insurance_products.id;


--
-- Name: loan_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_installments (
    id integer NOT NULL,
    number integer NOT NULL,
    principal numeric(12,2) NOT NULL,
    interest numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    "remainingPrincipal" numeric(12,2) NOT NULL,
    "dueDate" date NOT NULL,
    status public.loan_installments_status_enum DEFAULT 'pendiente'::public.loan_installments_status_enum NOT NULL,
    "paidAt" timestamp without time zone,
    "loanId" integer
);


--
-- Name: loan_installments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_installments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_installments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_installments_id_seq OWNED BY public.loan_installments.id;


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "termMonths" integer NOT NULL,
    tna numeric(6,4) NOT NULL,
    "installmentAmount" numeric(12,2) NOT NULL,
    status public.loans_status_enum DEFAULT 'vigente'::public.loans_status_enum NOT NULL,
    cbu character varying NOT NULL,
    "motivoRevision" character varying,
    "informeCentral" jsonb,
    "resueltoPor" character varying,
    "resueltoEl" timestamp without time zone,
    "motivoRechazo" character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loans_id_seq OWNED BY public.loans.id;


--
-- Name: service_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_subscriptions (
    id integer NOT NULL,
    "numeroCliente" character varying NOT NULL,
    apodo character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "companyId" integer,
    "userId" character varying
);


--
-- Name: service_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_subscriptions_id_seq OWNED BY public.service_subscriptions.id;


--
-- Name: topups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topups (
    id integer NOT NULL,
    operadora character varying NOT NULL,
    numero character varying NOT NULL,
    amount numeric(12,2) NOT NULL,
    status public.topups_status_enum NOT NULL,
    motivo character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" character varying
);


--
-- Name: topups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.topups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: topups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.topups_id_seq OWNED BY public.topups.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    type public.transactions_type_enum NOT NULL,
    description character varying,
    "externalTransactionId" character varying,
    "counterpartyCbu" character varying,
    "counterpartyName" character varying,
    category public.transactions_category_enum DEFAULT 'otros'::public.transactions_category_enum NOT NULL,
    status public.transactions_status_enum DEFAULT 'local'::public.transactions_status_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "accountId" integer
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: transfer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_contacts (
    id integer NOT NULL,
    cbu character varying NOT NULL,
    alias character varying,
    nombre character varying,
    apodo character varying,
    "bankCode" integer,
    currency public.transfer_contacts_currency_enum DEFAULT 'ARS'::public.transfer_contacts_currency_enum NOT NULL,
    "vecesUsado" integer DEFAULT 0 NOT NULL,
    "ultimoUso" timestamp without time zone,
    "userId" character varying
);


--
-- Name: transfer_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transfer_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transfer_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transfer_contacts_id_seq OWNED BY public.transfer_contacts.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying NOT NULL,
    email character varying NOT NULL,
    "fullName" character varying NOT NULL,
    dni character varying,
    "birthDate" date,
    role public.users_role_enum DEFAULT 'user'::public.users_role_enum NOT NULL
);


--
-- Name: utility_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.utility_bills (
    id integer NOT NULL,
    "numeroCliente" character varying NOT NULL,
    importe numeric(12,2) NOT NULL,
    vencimiento date NOT NULL,
    status public.utility_bills_status_enum DEFAULT 'pendiente'::public.utility_bills_status_enum NOT NULL,
    "paidAt" timestamp without time zone,
    "paidByUserId" character varying,
    "companyId" integer
);


--
-- Name: utility_bills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.utility_bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: utility_bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.utility_bills_id_seq OWNED BY public.utility_bills.id;


--
-- Name: utility_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.utility_companies (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    rubro character varying NOT NULL
);


--
-- Name: utility_companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.utility_companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: utility_companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.utility_companies_id_seq OWNED BY public.utility_companies.id;


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: card_authorizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_authorizations ALTER COLUMN id SET DEFAULT nextval('public.card_authorizations_id_seq'::regclass);


--
-- Name: cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards ALTER COLUMN id SET DEFAULT nextval('public.cards_id_seq'::regclass);


--
-- Name: cedear_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cedear_orders ALTER COLUMN id SET DEFAULT nextval('public.cedear_orders_id_seq'::regclass);


--
-- Name: chat_escalations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_escalations ALTER COLUMN id SET DEFAULT nextval('public.chat_escalations_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: fixed_terms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_terms ALTER COLUMN id SET DEFAULT nextval('public.fixed_terms_id_seq'::regclass);


--
-- Name: insurance_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims ALTER COLUMN id SET DEFAULT nextval('public.insurance_claims_id_seq'::regclass);


--
-- Name: insurance_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies ALTER COLUMN id SET DEFAULT nextval('public.insurance_policies_id_seq'::regclass);


--
-- Name: insurance_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_products ALTER COLUMN id SET DEFAULT nextval('public.insurance_products_id_seq'::regclass);


--
-- Name: loan_installments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments ALTER COLUMN id SET DEFAULT nextval('public.loan_installments_id_seq'::regclass);


--
-- Name: loans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans ALTER COLUMN id SET DEFAULT nextval('public.loans_id_seq'::regclass);


--
-- Name: service_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.service_subscriptions_id_seq'::regclass);


--
-- Name: topups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topups ALTER COLUMN id SET DEFAULT nextval('public.topups_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: transfer_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_contacts ALTER COLUMN id SET DEFAULT nextval('public.transfer_contacts_id_seq'::regclass);


--
-- Name: utility_bills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_bills ALTER COLUMN id SET DEFAULT nextval('public.utility_bills_id_seq'::regclass);


--
-- Name: utility_companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_companies ALTER COLUMN id SET DEFAULT nextval('public.utility_companies_id_seq'::regclass);


--
-- Name: transfer_contacts PK_1bdaa9c141d6051bd0f41792bb7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_contacts
    ADD CONSTRAINT "PK_1bdaa9c141d6051bd0f41792bb7" PRIMARY KEY (id);


--
-- Name: fixed_terms PK_3406d051589628e04334338b579; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_terms
    ADD CONSTRAINT "PK_3406d051589628e04334338b579" PRIMARY KEY (id);


--
-- Name: insurance_products PK_36ac5b506fcc1644ddf95580824; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_products
    ADD CONSTRAINT "PK_36ac5b506fcc1644ddf95580824" PRIMARY KEY (id);


--
-- Name: chat_messages PK_40c55ee0e571e268b0d3cd37d10; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY (id);


--
-- Name: accounts PK_5a7a02c20412299d198e097a8fe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY (id);


--
-- Name: loans PK_5c6942c1e13e4de135c5203ee61; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY (id);


--
-- Name: cards PK_5f3269634705fdff4a9935860fc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT "PK_5f3269634705fdff4a9935860fc" PRIMARY KEY (id);


--
-- Name: insurance_policies PK_69af1d3a19277d1a822c9b13bf1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT "PK_69af1d3a19277d1a822c9b13bf1" PRIMARY KEY (id);


--
-- Name: utility_bills PK_7618d9af9616422f5d25ddff5bf; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT "PK_7618d9af9616422f5d25ddff5bf" PRIMARY KEY (id);


--
-- Name: chat_escalations PK_8220bae66d0e1f895af73e3e692; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_escalations
    ADD CONSTRAINT "PK_8220bae66d0e1f895af73e3e692" PRIMARY KEY (id);


--
-- Name: card_authorizations PK_8240e2f5a7ff8cfc26ee27463aa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_authorizations
    ADD CONSTRAINT "PK_8240e2f5a7ff8cfc26ee27463aa" PRIMARY KEY (id);


--
-- Name: cedear_orders PK_84122b53729b41f08ca65aea3f4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cedear_orders
    ADD CONSTRAINT "PK_84122b53729b41f08ca65aea3f4" PRIMARY KEY (id);


--
-- Name: transactions PK_a219afd8dd77ed80f5a862f1db9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: service_subscriptions PK_a85f7714ffe6a7c26e004a0f06d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_subscriptions
    ADD CONSTRAINT "PK_a85f7714ffe6a7c26e004a0f06d" PRIMARY KEY (id);


--
-- Name: utility_companies PK_bac829d0a6bb3984ede97f829e4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_companies
    ADD CONSTRAINT "PK_bac829d0a6bb3984ede97f829e4" PRIMARY KEY (id);


--
-- Name: insurance_claims PK_c6f7929fdcec8c17a24034a48d3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT "PK_c6f7929fdcec8c17a24034a48d3" PRIMARY KEY (id);


--
-- Name: loan_installments PK_d69494e8c24dd3a2131f4d10168; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT "PK_d69494e8c24dd3a2131f4d10168" PRIMARY KEY (id);


--
-- Name: topups PK_fbfc343134573ee4a34f9785208; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topups
    ADD CONSTRAINT "PK_fbfc343134573ee4a34f9785208" PRIMARY KEY (id);


--
-- Name: utility_companies UQ_1e7b4021191856f5871359e48c5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_companies
    ADD CONSTRAINT "UQ_1e7b4021191856f5871359e48c5" UNIQUE (nombre);


--
-- Name: accounts UQ_38b11b5b29521765ca11082a2ea; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "UQ_38b11b5b29521765ca11082a2ea" UNIQUE (cbu);


--
-- Name: cards UQ_5deec73c016e2940ce4ced835e2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT "UQ_5deec73c016e2940ce4ced835e2" UNIQUE (number);


--
-- Name: users UQ_5fe9cfa518b76c96518a206b350; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_5fe9cfa518b76c96518a206b350" UNIQUE (dni);


--
-- Name: transactions UQ_7d4e0269987f420aff9ae8da41a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT "UQ_7d4e0269987f420aff9ae8da41a" UNIQUE ("externalTransactionId");


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: accounts UQ_a5f4f991f324bd85b79afb8d371; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "UQ_a5f4f991f324bd85b79afb8d371" UNIQUE (alias);


--
-- Name: accounts UQ_account_user_currency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "UQ_account_user_currency" UNIQUE ("userId", currency);


--
-- Name: transfer_contacts UQ_contact_user_cbu; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_contacts
    ADD CONSTRAINT "UQ_contact_user_cbu" UNIQUE ("userId", cbu);


--
-- Name: insurance_products UQ_dd1c459b37aabcd9eb43b7eed55; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_products
    ADD CONSTRAINT "UQ_dd1c459b37aabcd9eb43b7eed55" UNIQUE (nombre);


--
-- Name: loan_installments UQ_installment_loan_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT "UQ_installment_loan_number" UNIQUE ("loanId", number);


--
-- Name: service_subscriptions UQ_subscription_user_company; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_subscriptions
    ADD CONSTRAINT "UQ_subscription_user_company" UNIQUE ("userId", "companyId");


--
-- Name: IDX_27c607baa16206699ce60efd1b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_27c607baa16206699ce60efd1b" ON public.transfer_contacts USING btree ("userId", "ultimoUso");


--
-- Name: IDX_57e7ca830e61203898e7404155; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_57e7ca830e61203898e7404155" ON public.chat_messages USING btree ("userId", "createdAt");


--
-- Name: IDX_dcbe0ffdf4f42564d01184741b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dcbe0ffdf4f42564d01184741b" ON public.cedear_orders USING btree ("userId", ticker);


--
-- Name: IDX_facbc3162d6ed6d0caf53847d3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_facbc3162d6ed6d0caf53847d3" ON public.utility_bills USING btree ("companyId", "numeroCliente");


--
-- Name: transfer_contacts FK_02ef27dc03bcdb658789bb2092e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_contacts
    ADD CONSTRAINT "FK_02ef27dc03bcdb658789bb2092e" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cedear_orders FK_09043745b6b64b5c47dd26645a6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cedear_orders
    ADD CONSTRAINT "FK_09043745b6b64b5c47dd26645a6" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions FK_26d8aec71ae9efbe468043cd2b9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT "FK_26d8aec71ae9efbe468043cd2b9" FOREIGN KEY ("accountId") REFERENCES public.accounts(id);


--
-- Name: accounts FK_3aa23c0a6d107393e8b40e3e2a6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "FK_3aa23c0a6d107393e8b40e3e2a6" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages FK_43d968962b9e24e1e3517c0fbff; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "FK_43d968962b9e24e1e3517c0fbff" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: loans FK_4c2ab4e556520045a2285916d45; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT "FK_4c2ab4e556520045a2285916d45" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: service_subscriptions FK_4c4394ca4eefc3ad26bdb098fe6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_subscriptions
    ADD CONSTRAINT "FK_4c4394ca4eefc3ad26bdb098fe6" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_escalations FK_559210556209f3317caa648d811; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_escalations
    ADD CONSTRAINT "FK_559210556209f3317caa648d811" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cards FK_7b7230897ecdeb7d6b0576d907b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT "FK_7b7230897ecdeb7d6b0576d907b" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: insurance_policies FK_bb5bc529bac0368ab231429802d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT "FK_bb5bc529bac0368ab231429802d" FOREIGN KEY ("productId") REFERENCES public.insurance_products(id) ON DELETE RESTRICT;


--
-- Name: insurance_policies FK_c76434dc53acdd818f5637bc8b9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT "FK_c76434dc53acdd818f5637bc8b9" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: topups FK_c909c1a4f0b93d4ac6462923ad7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topups
    ADD CONSTRAINT "FK_c909c1a4f0b93d4ac6462923ad7" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fixed_terms FK_d287a262b910c676fec23660c83; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_terms
    ADD CONSTRAINT "FK_d287a262b910c676fec23660c83" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: loan_installments FK_d5e31e586cc96ce27d00831f12d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT "FK_d5e31e586cc96ce27d00831f12d" FOREIGN KEY ("loanId") REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: service_subscriptions FK_e0a6b6303fe88926bc453dcb85e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_subscriptions
    ADD CONSTRAINT "FK_e0a6b6303fe88926bc453dcb85e" FOREIGN KEY ("companyId") REFERENCES public.utility_companies(id) ON DELETE CASCADE;


--
-- Name: insurance_claims FK_ef0233f5751c8f5bb838dcc9c51; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_claims
    ADD CONSTRAINT "FK_ef0233f5751c8f5bb838dcc9c51" FOREIGN KEY ("policyId") REFERENCES public.insurance_policies(id) ON DELETE CASCADE;


--
-- Name: utility_bills FK_f172c6e196a6fe3ef07b48d84df; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT "FK_f172c6e196a6fe3ef07b48d84df" FOREIGN KEY ("companyId") REFERENCES public.utility_companies(id) ON DELETE CASCADE;


--
-- Name: card_authorizations FK_ff9f8b20fc41f3123f35c5dfc49; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_authorizations
    ADD CONSTRAINT "FK_ff9f8b20fc41f3123f35c5dfc49" FOREIGN KEY ("cardId") REFERENCES public.cards(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict iJMdDGZgVdQXyscDFuVPl0BMgZewl3Ypr3PgZ4H3oayhq9ZPgwrULATA3wQxYaf

