import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CentralBankService,
  SituacionCrediticia,
} from './central-bank.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('central-bank')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class CentralBankController {
  constructor(private readonly centralBankService: CentralBankService) {}

  /** Catalogo de bancos de la red, para mostrar nombres en vez de codigos. */
  @Get('banks')
  listBanks() {
    return this.centralBankService.listBanks();
  }

  @Get('banks/:bankCode')
  getBank(@Param('bankCode') bankCode: string) {
    return this.centralBankService.getBankByCode(bankCode);
  }

  /**
   * Consulta la situacion crediticia de un DNI cualquiera.
   * Es la consulta previa a abrir una cuenta o dar un credito, asi que
   * queda restringida a empleados y gerente.
   */
  @Get('deudores/:dni')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  getCreditSituation(@Param('dni') dni: string) {
    return this.centralBankService.getCreditSituation(dni);
  }

  /** Informa al Banco Central lo que un titular le debe a este banco. */
  @Post('deudores')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  reportDebt(
    @Body('dni') dni: string,
    @Body('monto') monto: number,
    @Body('situacion') situacion: SituacionCrediticia,
  ) {
    return this.centralBankService.reportDebt(dni, Number(monto), situacion);
  }
}
