import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TopupsService } from './topups.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('recargas')
@UseGuards(ClerkAuthGuard)
export class TopupsController {
  constructor(private readonly topupsService: TopupsService) {}

  @Get('operadoras')
  listOperadoras() {
    return this.topupsService.listOperadoras();
  }

  @Post()
  recharge(
    @Request() req,
    @Body() body: { operadora: string; numero: string; monto: number },
  ) {
    return this.topupsService.recharge(this.clerkId(req), body);
  }

  @Get()
  findMine(@Request() req) {
    return this.topupsService.findAllByUser(this.clerkId(req));
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
