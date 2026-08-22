export interface AmortizationRow {
  numero: number;
  capital: number;
  interes: number;
  cuota: number;
  saldo: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cuota fija del sistema frances:
 *
 *   C = M * [i * (1 + i)^n] / [(1 + i)^n - 1]
 *
 * donde `i` es la tasa mensual (TNA / 12) y `n` el plazo en meses.
 * Con TNA 0 la formula se indefine, asi que ese caso se reparte lineal.
 */
export function frenchInstallment(
  amount: number,
  tna: number,
  termMonths: number,
): number {
  if (termMonths <= 0) throw new Error('El plazo debe ser mayor a cero');
  if (tna === 0) return round2(amount / termMonths);

  const i = tna / 12;
  const factor = Math.pow(1 + i, termMonths);
  return round2((amount * (i * factor)) / (factor - 1));
}

/**
 * Tabla de amortizacion completa.
 *
 * La ultima cuota absorbe el redondeo acumulado: sin eso queda un saldo de
 * centavos que nunca se cancela y el prestamo no cierra en cero.
 */
export function amortizationSchedule(
  amount: number,
  tna: number,
  termMonths: number,
): AmortizationRow[] {
  const installment = frenchInstallment(amount, tna, termMonths);
  const monthlyRate = tna / 12;
  const rows: AmortizationRow[] = [];

  let remaining = amount;

  for (let numero = 1; numero <= termMonths; numero += 1) {
    const interes = round2(remaining * monthlyRate);
    const isLast = numero === termMonths;

    const capital = isLast ? round2(remaining) : round2(installment - interes);
    const cuota = isLast ? round2(capital + interes) : installment;

    remaining = round2(remaining - capital);

    rows.push({
      numero,
      capital,
      interes,
      cuota,
      saldo: Math.max(remaining, 0),
    });
  }

  return rows;
}

/** Tasa efectiva anual a partir de la nominal anual. */
export function effectiveAnnualRate(tna: number): number {
  return Math.pow(1 + tna / 12, 12) - 1;
}

/** Fecha de vencimiento de la cuota N, contada en meses desde hoy. */
export function dueDateFor(monthsAhead: number, from = new Date()): string {
  const due = new Date(
    from.getFullYear(),
    from.getMonth() + monthsAhead,
    from.getDate(),
  );
  return due.toISOString().slice(0, 10);
}
