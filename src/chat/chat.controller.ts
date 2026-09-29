import { Body, Controller, Ip, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { MensajePrevio } from './chat.providers';

/**
 * Asistente de la landing. Es publico a proposito: responde preguntas
 * generales y no ve ninguna cuenta, asi que no necesita saber quien pregunta.
 * El abuso se frena con un limite de mensajes por IP.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('publico')
  responder(
    @Ip() ip: string,
    @Body() body: { texto: string; historial?: MensajePrevio[] },
  ) {
    return this.chatService.responder(ip, body?.texto, body?.historial);
  }
}
