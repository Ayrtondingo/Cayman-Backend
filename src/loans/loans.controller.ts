import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('prestamos')
@UseGuards(ClerkAuthGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  /** Simula un prestamo sin crearlo. Si no se manda tna, usa la del mercado. */
  @Post('simulaciones')
  simulate(@Body() body: { monto: number; plazoMeses: number; tna?: number }) {
    return this.loansService.simulate(body);
  }

  @Post()
  request(
    @Request() req,
    @Body() body: { monto: number; plazoMeses: number; tna?: number },
  ) {
    return this.loansService.request(this.clerkId(req), body);
  }

  @Get()
  findMine(@Request() req) {
    return this.loansService.findAllByUser(this.clerkId(req));
  }

  @Get(':id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.findOne(this.clerkId(req), id);
  }

  @Post(':id/pagos')
  pay(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.payNextInstallment(this.clerkId(req), id);
  }

  @Post(':id/precancelacion')
  prepay(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.prepay(this.clerkId(req), id);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
