#!/usr/bin/env node
/**
 * Registra el banco en el Banco Central y devuelve la API key.
 *
 * El endpoint POST /banks es el unico que no usa x-api-key: pide el Bearer
 * token que entrega la catedra. Se ejecuta UNA sola vez por entorno.
 *
 *   CENTRAL_BANK_REGISTER_TOKEN=<token del docente> node scripts/registrar-banco.js
 *
 * Tambien lo toma del .env si lo dejas ahi.
 */
require('dotenv').config();

const axios = require('axios');

const API = process.env.CENTRAL_BANK_URL || 'https://centralbank.brocoly.cc/api';
const ENV = process.env.CENTRAL_BANK_ENV || 'test';
const TOKEN = process.env.CENTRAL_BANK_REGISTER_TOKEN;
const NOMBRE = process.env.BANK_NAME || 'Cayman-Shadow-Bank';

async function main() {
  if (!TOKEN) {
    console.error(
      '\n✖ Falta CENTRAL_BANK_REGISTER_TOKEN.\n' +
        '  Es el Bearer token que da la catedra para registrar un banco.\n' +
        '  Ponelo en el .env o pasalo por variable de entorno.\n',
    );
    process.exit(1);
  }

  console.log(`\nRegistrando "${NOMBRE}" en ${API} (entorno ${ENV})...\n`);

  let data;
  try {
    const respuesta = await axios.post(
      `${API}/banks`,
      { name: NOMBRE },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'x-environment': ENV,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );
    data = respuesta.data;
    console.log(`✔ Banco registrado (HTTP ${respuesta.status})`);
  } catch (error) {
    const status = error.response?.status;
    const cuerpo = error.response?.data;

    if (status === 409) {
      // El spec documenta 409 cuando el nombre ya esta tomado. Si el banco ya
      // existe, la key no se puede recuperar: hay que pedirsela a la catedra.
      console.error(
        `\n✖ 409: ya hay un banco registrado con ese nombre.\n` +
          `  Probá con otro BANK_NAME, o pedile la API key existente a la catedra.\n` +
          `  Respuesta: ${JSON.stringify(cuerpo)}\n`,
      );
      process.exit(1);
    }

    console.error(
      `\n✖ Fallo el registro (${status ?? 'sin respuesta'}): ` +
        `${JSON.stringify(cuerpo ?? error.message)}\n`,
    );
    process.exit(1);
  }

  // El spec no fija el nombre exacto de los campos, asi que se buscan variantes.
  const apiKey = data.apiKey ?? data.api_key ?? data.key ?? data['x-api-key'];
  const bankId = data.bankId ?? data.id ?? data._id;
  const bankCode = data.bankCode ?? data.code;

  console.log('\nRespuesta completa:');
  console.log(JSON.stringify(data, null, 2));

  if (!apiKey) {
    console.log('\n⚠ No encontre la API key en la respuesta. Copiala a mano del JSON de arriba.');
    return;
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('Guardá esto en el .env (y en Render):\n');
  console.log(`CENTRAL_BANK_API_KEY=${apiKey}`);
  if (bankId) console.log(`BANK_ID=${bankId}`);
  if (bankCode) console.log(`BANK_CODE=${bankCode}`);
  console.log('──────────────────────────────────────────────');
  console.log('\nEs la unica vez que se muestra: si la perdés, hay que volver a pedirla.\n');
}

main().catch((error) => {
  console.error('\n✖', error.message, '\n');
  process.exit(1);
});
