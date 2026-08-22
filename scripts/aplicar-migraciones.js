#!/usr/bin/env node
/**
 * Aplica los scripts de migrations/ en orden contra la base que indique
 * SUPABASE_DB_URL (o DATABASE_URL) del .env.
 *
 * Nunca imprime la cadena de conexión: solo el host, para poder confirmar
 * contra qué base se está corriendo sin exponer la contraseña.
 *
 *   node scripts/aplicar-migraciones.js            # aplica
 *   node scripts/aplicar-migraciones.js --dry-run  # solo diagnostica
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CONEXION = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const DIR = path.join(__dirname, '..', 'migrations');

function abortar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

if (!CONEXION) {
  abortar(
    'Falta SUPABASE_DB_URL en el .env.\n' +
      '  Se saca de Supabase: Connect → Transaction pooler.\n' +
      '  Tiene esta forma:\n' +
      '  postgresql://postgres.<ref>:<PASSWORD>@aws-1-<region>.pooler.supabase.com:6543/postgres',
  );
}

/** Host y usuario, sin la contraseña. */
function describir(url) {
  try {
    const u = new URL(url);
    return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(cadena de conexión con formato inválido)';
  }
}

async function main() {
  console.log(`\nBase destino: ${describir(CONEXION)}`);
  if (DRY_RUN) console.log('Modo diagnóstico: no se va a escribir nada.\n');

  // Supabase exige SSL; un Postgres local normalmente no lo tiene compilado.
  const esLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(new URL(CONEXION).hostname);

  const client = new Client({
    connectionString: CONEXION,
    ssl: esLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
  } catch (error) {
    // Los errores tipicos de Supabase tienen causas concretas; vale la pena
    // traducirlos en vez de dejar el stack de pg crudo.
    const mensaje = error.message || '';
    if (mensaje.includes('Tenant or user not found') || mensaje.includes('tenant/user')) {
      abortar(
        'El pooler no reconoce el tenant. Suele ser:\n' +
          '  · el proyecto está pausado en Supabase (Restore), o\n' +
          '  · la región del host no coincide con la del proyecto, o\n' +
          '  · el usuario no tiene el formato postgres.<project-ref>',
      );
    }
    if (mensaje.includes('password authentication failed')) {
      abortar('Contraseña incorrecta. Regenerala en Supabase → Database → Reset password.');
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ENETUNREACH') {
      abortar(
        `No se pudo alcanzar el host (${error.code}).\n` +
          '  Si estás usando db.<ref>.supabase.co, ese host es IPv6-only.\n' +
          '  Usá el del pooler, que resuelve por IPv4.',
      );
    }
    abortar(`No se pudo conectar: ${mensaje}`);
  }

  const version = await client.query('SELECT current_database() db, version()');
  console.log(`Conectado a "${version.rows[0].db}"\n`);

  // Estado previo, para saber si esta base ya tiene datos que cuidar.
  const previo = await client.query(`
    SELECT
      to_regclass('public.accounts')  IS NOT NULL AS tiene_accounts,
      to_regclass('public.cards')     IS NOT NULL AS tiene_cards,
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='accounts' AND column_name='accountNumber') AS tiene_accountnumber,
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name='accounts' AND column_name='cbu') AS tiene_cbu
  `);
  const estado = previo.rows[0];

  // Listar TODO lo que hay: mirar solo `accounts` hace reportar "base vacía"
  // una base que en realidad tiene otro esquema conviviendo.
  const CONOCIDAS = new Set([
    'accounts', 'users', 'transactions', 'cards', 'card_authorizations', 'loans',
    'loan_installments', 'utility_companies', 'utility_bills', 'topups',
    'fixed_terms', 'cedear_orders', 'insurance_products', 'insurance_policies',
    'insurance_claims', 'chat_messages', 'chat_escalations',
  ]);

  const todas = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  const ajenas = todas.rows.map((r) => r.table_name).filter((t) => !CONOCIDAS.has(t));

  if (todas.rows.length === 0) {
    console.log('La base está vacía: no hay ninguna tabla.\n');
  } else if (ajenas.length) {
    console.log(`⚠ Hay ${ajenas.length} tabla(s) que no son de este backend:`);
    for (const t of ajenas) {
      const n = await client.query(`SELECT count(*)::int n FROM "${t}"`);
      console.log(`    ${t.padEnd(24)} ${String(n.rows[0].n).padStart(6)} filas`);
    }
    console.log('  No se tocan. Si son de otro proyecto, revisá que compartir base sea intencional.\n');
  }

  console.log('Estado actual:');
  console.log(`  tabla accounts .......... ${estado.tiene_accounts ? 'sí' : 'no'}`);
  if (estado.tiene_accounts) {
    console.log(`  columna accountNumber ... ${estado.tiene_accountnumber ? 'sí (se va a renombrar)' : 'no'}`);
    console.log(`  columna cbu ............. ${estado.tiene_cbu ? 'sí (ya migrada)' : 'no'}`);
    const filas = await client.query('SELECT count(*)::int n FROM accounts');
    console.log(`  cuentas con datos ....... ${filas.rows[0].n}`);
  }
  console.log(`  módulos nuevos .......... ${estado.tiene_cards ? 'ya creados' : 'faltan'}\n`);

  if (DRY_RUN) {
    await client.end();
    console.log('Diagnóstico terminado. Sin --dry-run se aplican las migraciones.\n');
    return;
  }

  const scripts = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const script of scripts) {
    process.stdout.write(`Aplicando ${script} ... `);
    try {
      await client.query(fs.readFileSync(path.join(DIR, script), 'utf8'));
      console.log('OK');
    } catch (error) {
      console.log('FALLÓ');
      // Cada script abre su propia transacción, así que un fallo no deja
      // ese script a medias; los anteriores sí quedaron aplicados.
      abortar(`${script}: ${error.message}`);
    }
  }

  // Verificación final: el esquema tiene que quedar como lo esperan las entidades.
  const final = await client.query(`
    SELECT
      (SELECT count(*)::int FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN (
         'cards','card_authorizations','loans','loan_installments','utility_companies',
         'utility_bills','topups','fixed_terms','cedear_orders','insurance_products',
         'insurance_policies','insurance_claims','chat_messages','chat_escalations')) AS nuevas,
      (SELECT count(*)::int FROM accounts) AS cuentas,
      (SELECT count(cbu)::int FROM accounts) AS con_cbu
  `);
  const r = final.rows[0];

  console.log('\nResultado:');
  console.log(`  tablas nuevas ........... ${r.nuevas}/14`);
  console.log(`  cuentas ................. ${r.cuentas}`);
  console.log(`  cuentas con CBU ......... ${r.con_cbu}`);

  await client.end();

  if (r.nuevas !== 14) {
    abortar('Faltan tablas. Revisá el error de arriba antes de desplegar.');
  }

  console.log('\n✔ Listo. Ya podés desplegar el backend con DB_SYNCHRONIZE=false.\n');
}

main().catch((error) => abortar(error.message));
