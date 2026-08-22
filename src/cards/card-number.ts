import { randomInt } from 'crypto';

/**
 * BIN del banco (6 digitos). La catedra asigna el rango real por grupo por fuera
 * del spec, asi que hasta que llegue ese dato esto es un placeholder configurable.
 */
const BIN = process.env.CARD_BIN || '450019';

/**
 * Digito verificador de Luhn, el mismo algoritmo que usan las tarjetas reales.
 * Sin esto cualquier validador de front lo marca como numero invalido.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  let double = true; // el primer digito a duplicar es el ultimo de `partial`

  for (let i = partial.length - 1; i >= 0; i -= 1) {
    let digit = Number(partial[i]);

    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    double = !double;
  }

  return (10 - (sum % 10)) % 10;
}

export function isValidCardNumber(number: string): boolean {
  if (!/^\d{13,19}$/.test(number)) return false;
  return luhnCheckDigit(number.slice(0, -1)) === Number(number.slice(-1));
}

/** Genera un numero de 16 digitos: BIN + 9 aleatorios + verificador. */
export function generateCardNumber(): string {
  let body = BIN;
  while (body.length < 15) {
    body += String(randomInt(0, 10));
  }
  return body + String(luhnCheckDigit(body));
}

/** Lo unico que se expone hacia afuera: **** **** **** 1234 */
export function maskCardNumber(number: string): string {
  return `**** **** **** ${number.slice(-4)}`;
}

/** Vencimiento a N anios, ultimo dia del mes, en formato YYYY-MM-DD. */
export function expirationDate(yearsFromNow = 4): string {
  const now = new Date();
  // Dia 0 del mes siguiente = ultimo dia del mes actual.
  const expiry = new Date(
    now.getFullYear() + yearsFromNow,
    now.getMonth() + 1,
    0,
  );
  return expiry.toISOString().slice(0, 10);
}
