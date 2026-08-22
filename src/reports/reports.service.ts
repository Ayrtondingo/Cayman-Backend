import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  private async ownedAccount(clerkId: string, cbu: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { cbu, user: { id: clerkId } },
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada o no pertenece al cliente');
    }

    return account;
  }

  /** Interpreta un periodo YYYY-MM. Si no viene, usa el mes en curso. */
  private periodRange(periodo?: string) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    if (periodo) {
      const match = /^(\d{4})-(\d{2})$/.exec(periodo);
      if (!match) {
        throw new BadRequestException('El periodo debe tener formato YYYY-MM');
      }

      year = Number(match[1]);
      month = Number(match[2]) - 1;

      if (month < 0 || month > 11) {
        throw new BadRequestException('Mes invalido en el periodo');
      }
    }

    return {
      periodo: `${year}-${String(month + 1).padStart(2, '0')}`,
      desde: new Date(year, month, 1),
      hasta: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  /**
   * Gastos del periodo agrupados por categoria.
   *
   * Solo cuenta los egresos (montos negativos): mezclarlos con los ingresos
   * daria un neto, que no es lo que se quiere ver en un resumen de gastos.
   */
  async expenseSummary(clerkId: string, cbu: string, periodo?: string) {
    const account = await this.ownedAccount(clerkId, cbu);
    const range = this.periodRange(periodo);

    const movements = await this.transactionRepository.find({
      where: {
        account: { id: account.id },
        createdAt: Between(range.desde, range.hasta),
      },
    });

    const egresos = movements.filter((movement) => Number(movement.amount) < 0);
    const ingresos = movements.filter((movement) => Number(movement.amount) > 0);

    const porCategoria = new Map<string, { total: number; cantidad: number }>();

    for (const movement of egresos) {
      const key = movement.category;
      const current = porCategoria.get(key) ?? { total: 0, cantidad: 0 };
      current.total = round2(current.total + Math.abs(Number(movement.amount)));
      current.cantidad += 1;
      porCategoria.set(key, current);
    }

    const totalGastado = round2(
      egresos.reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0),
    );

    const categorias = [...porCategoria.entries()]
      .map(([categoria, datos]) => ({
        categoria,
        total: datos.total,
        cantidad: datos.cantidad,
        porcentaje: totalGastado > 0 ? round2((datos.total / totalGastado) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      periodo: range.periodo,
      cbu: account.cbu,
      moneda: account.currency,
      totalGastado,
      totalIngresado: round2(
        ingresos.reduce((sum, movement) => sum + Number(movement.amount), 0),
      ),
      cantidadMovimientos: movements.length,
      categorias,
    };
  }

  /**
   * Movimientos exportables. `csv` devuelve texto plano listo para descargar;
   * `json` devuelve la misma data estructurada.
   */
  async exportMovements(
    clerkId: string,
    cbu: string,
    formato: string,
    periodo?: string,
  ) {
    const normalized = String(formato ?? 'csv').toLowerCase();

    if (normalized !== 'csv' && normalized !== 'json') {
      throw new BadRequestException('El formato debe ser "csv" o "json"');
    }

    const account = await this.ownedAccount(clerkId, cbu);
    const range = periodo ? this.periodRange(periodo) : null;

    const movements = await this.transactionRepository.find({
      where: {
        account: { id: account.id },
        ...(range ? { createdAt: Between(range.desde, range.hasta) } : {}),
      },
      order: { createdAt: 'DESC' },
    });

    const rows = movements.map((movement) => ({
      fecha: movement.createdAt.toISOString(),
      tipo: movement.type,
      categoria: movement.category,
      descripcion: movement.description ?? '',
      monto: Number(movement.amount),
      moneda: account.currency,
      estado: movement.status,
      contraparte: movement.counterpartyCbu ?? '',
    }));

    const filename = `movimientos-${account.cbu}${range ? `-${range.periodo}` : ''}.${normalized}`;

    if (normalized === 'json') {
      return { filename, contentType: 'application/json', content: JSON.stringify(rows, null, 2) };
    }

    return {
      filename,
      contentType: 'text/csv; charset=utf-8',
      content: this.toCsv(rows),
    };
  }

  /** CSV con las comillas escapadas, para que una descripcion con comas no rompa el archivo. */
  private toCsv(rows: Record<string, string | number>[]): string {
    if (!rows.length) return 'fecha,tipo,categoria,descripcion,monto,moneda,estado,contraparte\n';

    const headers = Object.keys(rows[0]);
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

    return [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
    ].join('\n');
  }
}
