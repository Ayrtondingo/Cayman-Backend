// backend/src/transactions/transactions.controller.ts

import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('transactions')
@UseGuards(ClerkAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  async transfer(
    @Request() req, 
    @Body() body: { destinationCbu: string; amount: number }
  ) {
    const userId = req.user.id;
    
    // CAMBIO: Se usa 'createTransfer' porque así se llama en tu Service
    return this.transactionsService.createTransfer(
      userId, 
      body.destinationCbu, 
      body.amount
    );
  }

  @Get('history')
  async getHistory(@Request() req) {
    const userId = req.user.id;
    // CAMBIO: Se usa 'getLocalHistory' porque así se llama en tu Service
    return this.transactionsService.getLocalHistory(userId);
  }
}