import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { Currency } from '../common/enums/currency.enum';
import { CentralBankService } from '../central-bank/central-bank.service';

const CBU_REGEX = /^\d{22}$/;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
  ) {}

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

    return this.toFrontendTransaction(
      await this.transactionRepository.save(transaction),
      senderAccount.cbu,
    );
  }

  async getCombinedHistory(clerkId: string, currency: Currency = Currency.ARS) {
    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency },
      relations: ['user'],
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    await this.syncIncomingTransactions(account);

    const localTransactions = await this.transactionRepository.find({
      where: { account: { id: account.id } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return localTransactions.map((transaction) =>
      this.toFrontendTransaction(transaction, account.cbu),
    );
  }

  private async syncIncomingTransactions(account: Account) {
    const centralTransactions =
      await this.centralBankService.getTransactions(30);

    for (const tx of centralTransactions) {
      const externalId = tx._id || tx.transaccionId;
      const isIncoming = tx.cbuDestino === account.cbu;

      if (
        !externalId ||
        !isIncoming ||
        tx.estado !== TransactionStatus.APPROVED
      ) {
        continue;
      }

      const existing = await this.transactionRepository.findOne({
        where: { externalTransactionId: externalId },
      });

      if (existing) {
        continue;
      }

      const amount = Number(tx.importe);

      // Intentar obtener el nombre del emisor desde el banco central
      let senderName: string | undefined;
      if (tx.nombreOrigen) {
        senderName = tx.nombreOrigen;
      } else {
        const person = await this.centralBankService.getPersonByCbu(
          tx.cbuOrigen,
        );
        if (person) senderName = `${person.nombre} ${person.apellido}`;
      }

      account.balance = Number(account.balance) + amount;
      await this.accountRepository.save(account);

      const incoming = this.transactionRepository.create({
        amount,
        type: TransactionType.TRANSFER,
        category: TransactionCategory.TRANSFERENCIA,
        description: senderName
          ? `Recibido de ${senderName}`
          : `Recibido de CBU: ${tx.cbuOrigen}`,
        account,
        counterpartyCbu: tx.cbuOrigen,
        counterpartyName: senderName,
        externalTransactionId: externalId,
        status: TransactionStatus.APPROVED,
      });

      await this.transactionRepository.save(incoming);
    }
  }

  private toFrontendTransaction(transaction: Transaction, ownCbu: string) {
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
    };
  }
}
