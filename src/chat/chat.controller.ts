import { Body, Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('chat')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Manda un mensaje al asistente.
   * `confirmar: true` autoriza las acciones que quedaron pendientes en el turno anterior.
   */
  @Post('mensajes')
  sendMessage(
    @Request() req,
    @Body() body: { texto: string; confirmar?: boolean },
  ) {
    return this.chatService.sendMessage(
      this.clerkId(req),
      body.texto,
      Boolean(body.confirmar),
    );
  }

  @Get('mensajes')
  getHistory(@Request() req) {
    return this.chatService.getHistory(this.clerkId(req));
  }

  @Delete('mensajes')
  clearHistory(@Request() req) {
    return this.chatService.clearHistory(this.clerkId(req));
  }

  @Post('escalamientos')
  escalate(@Request() req, @Body('motivo') motivo: string) {
    return this.chatService.escalate(this.clerkId(req), motivo);
  }

  /** Cola de derivaciones pendientes. Solo para el personal del banco. */
  @Get('escalamientos')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  listEscalations() {
    return this.chatService.listEscalations();
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
