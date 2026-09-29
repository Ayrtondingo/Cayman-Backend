import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { Currency } from '../common/enums/currency.enum';
import { CentralBankService } from '../central-bank/central-bank.service';
import { TransferContact } from './entities/contact.entity';
import { User } from '../users/entities/user.entity';

const CBU_REGEX = /^\d{22}$/;

/**
 * Cada cuanto se le pregunta al Banco Central por transferencias recibidas.
 * El Central no avisa: el banco destino tiene que ir a buscarlas.
 */
const INTERVALO_ENTRANTES_MS = 5 * 60 * 1000;

/**
 * Ventana de GET /transactions, en minutos. Es el maximo que acepta el Central
 * (24 hs): si el backend estuvo caido un rato, al volver todavia las encuentra.
 * Leer la misma transferencia varias veces no duplica nada, porque se acredita
 * una sola vez por su id del Central.
 */
const VENTANA_ENTRANTES_MIN = 1440;

interface TransferenciaCentral {
  _id?: string;
  transaccionId?: string;
  cbuOrigen: string;
  cbuDestino: string;
  importe: number | string;
  estado: string;
  personaOrigen?: { nombre?: string; apellido?: string } | null;
}

@Injectable()
export class TransactionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransactionsService.name);
  private intervaloEntrantes?: NodeJS.Timeout;
  private sincronizando = false;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(TransferContact)
    private readonly contactRepository: Repository<TransferContact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly centralBankService: CentralBankService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    // La primera vuelta apenas arranca, asi se acredita lo que llego mientras
    // el backend estaba apagado.
    setTimeout(() => void this.sincronizarEntrantes(), 5000);
    this.intervaloEntrantes = setInterval(
      () => void this.sincronizarEntrantes(),
      INTERVALO_ENTRANTES_MS,
    );
  }

  onModuleDestroy() {
    clearInterval(this.intervaloEntrantes);
  }

  async createTransfer(
    clerkId: string,
    destinatario?: string,
    amount?: number,
    reason?: string,
    currency: Currency = Currency.ARS,
  ) {
    if (!destinatario) {
      throw new BadRequestException('Debe indicar un CBU o alias destino');
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    // Resolver alias → CBU si no son 22 dígitos
    let receiverCbu = destinatario;
    let receiverName: string | undefined;

    if (!CBU_REGEX.test(destinatario)) {
      const target = await this.centralBankService.resolveAlias(destinatario);

      if (!target) {
        throw new NotFoundException(
          `No existe ninguna cuenta con el alias ${destinatario}`,
        );
      }

      receiverCbu = target.cbu;
      receiverName = target.nombre
        ? `${target.nombre} ${target.apellido ?? ''}`.trim()
        : undefined;
    }

    if (!CBU_REGEX.test(receiverCbu)) {
      throw new BadRequestException(
        'CBU destino invalido (debe tener 22 digitos)',
      );
    }

    const senderAccount = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency },
      relations: ['user'],
    });

    if (!senderAccount) {
      throw new NotFoundException(
        `Cuenta emisora en ${currency} no encontrada`,
      );
    }

    if (!senderAccount.cbu) {
      throw new BadRequestException(
        'La cuenta emisora todavia no tiene CBU. Sincronizala con el Banco Central.',
      );
    }

    if (senderAccount.cbu === receiverCbu) {
      throw new BadRequestException(
        'El CBU origen no puede ser igual al destino',
      );
    }

    // El Banco Central no valida que origen y destino sean de la misma moneda:
    // aprueba mandar 50 desde una caja en dolares a una en pesos y acredita 50
    // pesos del otro lado. Se valida de este lado antes de mandar nada.
    const monedaDestino =
      await this.centralBankService.getCurrencyOfCbu(receiverCbu);

    if (!monedaDestino) {
      throw new NotFoundException(
        `El CBU ${receiverCbu} no existe en la red interbancaria`,
      );
    }

    if (monedaDestino !== currency) {
      throw new BadRequestException(
        `No se puede transferir de una cuenta en ${currency} a una en ${monedaDestino}. ` +
          `Convertí el dinero primero desde Cuentas.`,
      );
    }

    const centralTransaction =
      await this.centralBankService.registerTransaction({
        cbuOrigen: senderAccount.cbu,
        cbuDestino: receiverCbu,
        importe: amount,
        saldoOrigen: Number(senderAccount.balance),
      });

    // La API devuelve nombreDestino en la respuesta aprobada
    const counterpartyName =
      receiverName || centralTransaction.nombreDestino || undefined;

    if (centralTransaction.estado !== TransactionStatus.APPROVED) {
      const rejected = this.transactionRepository.create({
        amount: -amount,
        type: TransactionType.TRANSFER,
        category: TransactionCategory.TRANSFERENCIA,
        description:
          centralTransaction.motivoRechazo ||
          reason ||
          `Transferencia rechazada a ${destinatario}`,
        account: senderAccount,
        counterpartyCbu: receiverCbu,
        counterpartyName,
        externalTransactionId:
          centralTransaction.transaccionId || centralTransaction._id,
        status: TransactionStatus.REJECTED,
      });

      await this.transactionRepository.save(rejected);
      throw new BadRequestException(
        centralTransaction.motivoRechazo || 'Transferencia rechazada',
      );
    }

    senderAccount.balance = Number(senderAccount.balance) - amount;
    await this.accountRepository.save(senderAccount);

    const transaction = this.transactionRepository.create({
      amount: -amount,
      type: TransactionType.TRANSFER,
      category: TransactionCategory.TRANSFERENCIA,
      description: reason || `Transferencia a ${destinatario}`,
      account: senderAccount,
      counterpartyCbu: receiverCbu,
      counterpartyName,
      externalTransactionId:
        centralTransaction.transaccionId || centralTransaction._id,
      status: TransactionStatus.APPROVED,
    });

    const guardada = await this.transactionRepository.save(transaction);

    // La agenda se arma sola con cada transferencia completada.
    await this.recordarContacto(clerkId, {
      cbu: receiverCbu,
      nombre: counterpartyName ?? null,
      currency,
    });

    return this.toFrontendTransaction(guardada, senderAccount.cbu, senderAccount.currency);
  }

  async getCombinedHistory(clerkId: string, currency: Currency = Currency.ARS) {
    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency },
      relations: ['user'],
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    await this.sincronizarEntrantes();

    const localTransactions = await this.transactionRepository.find({
      where: { account: { id: account.id } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return localTransactions.map((transaction) =>
      this.toFrontendTransaction(transaction, account.cbu, account.currency),
    );
  }

  /**
   * Acredita las transferencias que otros bancos (o este mismo) mandaron a
   * cualquier caja de Cayman, en pesos o en dolares.
   *
   * Corre sola cada pocos minutos y tambien al pedir el historial. Antes solo
   * corria al pedir el historial, solo para la caja en pesos y mirando 30
   * minutos: lo que llegaba en dolares, o cuando nadie miraba, no se acreditaba
   * nunca.
   */
  async sincronizarEntrantes() {
    // Si ya hay una vuelta en curso, esta no hace falta: la otra va a leer lo mismo.
    if (this.sincronizando) return;
    this.sincronizando = true;

    try {
      const transferencias: TransferenciaCentral[] =
        await this.centralBankService.getTransactions(VENTANA_ENTRANTES_MIN);

      for (const tx of transferencias ?? []) {
        if (tx.estado !== TransactionStatus.APPROVED) continue;
        try {
          await this.acreditarEntrante(tx);
        } catch (error) {
          // Una que falla no frena a las demas; se reintenta en la proxima vuelta.
          this.logger.error(
            `No se pudo acreditar la transferencia ${tx._id ?? tx.transaccionId}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      // Si el Central no responde, la proxima vuelta lo reintenta; la ventana
      // de 24 hs alcanza para no perder nada.
      this.logger.warn(
        `No se pudieron leer las transferencias recibidas: ${(error as Error).message}`,
      );
    } finally {
      this.sincronizando = false;
    }
  }

  private async acreditarEntrante(tx: TransferenciaCentral) {
    const externalId = tx._id || tx.transaccionId;
    if (!externalId) return;

    const account = await this.accountRepository.findOne({
      where: { cbu: tx.cbuDestino },
    });
    // No es para una caja de este banco (es una que mandamos nosotros).
    if (!account) return;

    const yaAcreditada = await this.transactionRepository.exist({
      where: { externalTransactionId: externalId },
    });
    if (yaAcreditada) return;

    const origen = tx.personaOrigen;
    let senderName =
      origen?.nombre || origen?.apellido
        ? `${origen.nombre ?? ''} ${origen.apellido ?? ''}`.trim()
        : undefined;
    if (!senderName) {
      const person = await this.centralBankService.getPersonByCbu(tx.cbuOrigen);
      if (person) senderName = `${person.nombre} ${person.apellido}`;
    }

    const amount = Number(tx.importe);

    try {
      // Movimiento y saldo juntos: primero el movimiento, que tiene el id del
      // Central como clave unica. Si otra vuelta ya lo acredito, el INSERT falla
      // y el saldo no se toca.
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(Transaction, {
          amount,
          type: TransactionType.TRANSFER,
          category: TransactionCategory.TRANSFERENCIA,
          description: senderName
            ? `Recibido de ${senderName}`
            : `Recibido de CBU: ${tx.cbuOrigen}`,
          account: { id: account.id },
          counterpartyCbu: tx.cbuOrigen,
          counterpartyName: senderName,
          externalTransactionId: externalId,
          status: TransactionStatus.APPROVED,
        });
        await manager.increment(Account, { id: account.id }, 'balance', amount);
      });

      this.logger.log(
        `Acreditada transferencia ${externalId}: ${amount} ${account.currency} en ${account.cbu}`,
      );
    } catch (error) {
      const duplicada =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505';
      if (!duplicada) throw error;
    }
  }

  private toFrontendTransaction(
    transaction: Transaction,
    ownCbu: string,
    currency: Currency,
  ) {
    const amount = Number(transaction.amount);

    return {
      id: transaction.externalTransactionId || transaction.id,
      date: transaction.createdAt,
      to: amount < 0 ? transaction.counterpartyCbu : undefined,
      from: amount > 0 ? transaction.counterpartyCbu : undefined,
      counterpartyName: transaction.counterpartyName || undefined,
      type: amount > 0 ? 'IN' : 'OUT',
      amount: Math.abs(amount),
      status: transaction.status,
      ownCbu,
      // Para el comprobante: la moneda de la caja y el motivo (o, si fue
      // rechazada, la razon del rechazo).
      currency,
      description: transaction.description || undefined,
    };
  }

  // ------------------------------------------------------------- Contactos

  /**
   * Suma o actualiza un destinatario en la agenda.
   *
   * Nunca hace fallar la transferencia: la plata ya se movio y no tiene sentido
   * romper por no poder guardar un contacto.
   */
  private async recordarContacto(
    clerkId: string,
    datos: { cbu: string; nombre: string | null; currency: Currency },
  ) {
    try {
      const user = await this.userRepository.findOne({ where: { id: clerkId } });
      if (!user) return;

      const existente = await this.contactRepository.findOne({
        where: { user: { id: clerkId }, cbu: datos.cbu },
      });

      const contacto =
        existente ??
        this.contactRepository.create({
          cbu: datos.cbu,
          currency: datos.currency,
          vecesUsado: 0,
          user,
        });

      // El alias y el banco se piden al Central: el alias puede haber cambiado
      // desde la ultima vez, y el bankCode permite mostrar de que banco es.
      const destino = await this.centralBankService.resolveCbu(datos.cbu);

      if (destino) {
        contacto.alias = destino.alias ?? contacto.alias ?? null;
        contacto.nombre =
          datos.nombre ??
          (destino.nombre
            ? `${destino.nombre} ${destino.apellido ?? ''}`.trim()
            : contacto.nombre) ??
          null;
        const bankCode = (destino as { bankCode?: number }).bankCode;
        if (typeof bankCode === 'number') contacto.bankCode = bankCode;
      } else if (datos.nombre) {
        contacto.nombre = datos.nombre;
      }

      contacto.vecesUsado += 1;
      contacto.ultimoUso = new Date();

      await this.contactRepository.save(contacto);
    } catch (error) {
      this.logger.warn(`No se pudo guardar el contacto: ${(error as Error).message}`);
    }
  }

  /** Agenda del cliente, de la mas usada recientemente a la mas vieja. */
  async listContacts(clerkId: string) {
    const contactos = await this.contactRepository.find({
      where: { user: { id: clerkId } },
      order: { ultimoUso: 'DESC' },
      take: 50,
    });

    return contactos.map((contacto) => ({
      id: contacto.id,
      cbu: contacto.cbu,
      alias: contacto.alias,
      // El apodo que puso el cliente le gana al nombre del Banco Central.
      nombre: contacto.apodo ?? contacto.nombre ?? null,
      nombreTitular: contacto.nombre,
      apodo: contacto.apodo,
      bankCode: contacto.bankCode,
      moneda: contacto.currency,
      vecesUsado: contacto.vecesUsado,
      ultimoUso: contacto.ultimoUso,
    }));
  }

  private async ownedContact(clerkId: string, id: number) {
    const contacto = await this.contactRepository.findOne({
      where: { id, user: { id: clerkId } },
    });

    if (!contacto) throw new NotFoundException('Contacto no encontrado');
    return contacto;
  }

  async renameContact(clerkId: string, id: number, apodo: string) {
    const contacto = await this.ownedContact(clerkId, id);
    contacto.apodo = apodo?.trim() || null;
    await this.contactRepository.save(contacto);
    return { id: contacto.id, apodo: contacto.apodo };
  }

  async deleteContact(clerkId: string, id: number) {
    const contacto = await this.ownedContact(clerkId, id);
    await this.contactRepository.remove(contacto);
    return { eliminado: true };
  }
}
