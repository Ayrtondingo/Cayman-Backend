import { Controller, Get, Param, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('accounts')
@UseGuards(ClerkAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** Gastos del periodo agrupados por categoria. `periodo` es YYYY-MM. */
  @Get(':cbu/resumen-gastos')
  expenseSummary(
    @Request() req,
    @Param('cbu') cbu: string,
    @Query('periodo') periodo?: string,
  ) {
    return this.reportsService.expenseSummary(this.clerkId(req), cbu, periodo);
  }

  /**
   * Descarga los movimientos. Va con @Res porque hay que setear los headers
   * de descarga, no devolver un JSON.
   */
  @Get(':cbu/movimientos/exportar')
  async exportMovements(
    @Request() req,
    @Param('cbu') cbu: string,
    @Res() res: Response,
    @Query('formato') formato = 'csv',
    @Query('periodo') periodo?: string,
  ) {
    const file = await this.reportsService.exportMovements(
      this.clerkId(req),
      cbu,
      formato,
      periodo,
    );

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
