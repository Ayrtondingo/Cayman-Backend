import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage, ChatRole } from './entities/chat-message.entity';
import { Escalation, EscalationStatus } from './entities/escalation.entity';
import { User } from '../users/entities/user.entity';
import { AccountsService } from '../accounts/accounts.service';
import { CardsService } from '../cards/cards.service';
import { LoansService } from '../loans/loans.service';
import { ReportsService } from '../reports/reports.service';
import { DolarService } from '../market/dolar.service';
import { CHAT_TOOLS, CHAT_TOOL_BY_NAME } from './chat.tools';

const MODEL = process.env.CHAT_MODEL || 'claude-opus-5';

/**
 * Acciones que cambian estado y que el asistente PUEDE ejecutar sin confirmacion.
 *
 * Arranca vacio a proposito: la catedra todavia no definio la politica de
 * acciones autonomas, asi que por defecto toda accion queda pendiente de que
 * el cliente la confirme. Para habilitar alguna:
 *   CHAT_ACCIONES_AUTONOMAS=bloquear_tarjeta
 */
const ACCIONES_AUTONOMAS = new Set(
  (process.env.CHAT_ACCIONES_AUTONOMAS || '')
    .split(',')
    .map((accion) => accion.trim())
    .filter(Boolean),
);

/** Cuantos mensajes previos se le mandan al modelo como contexto. */
const HISTORIAL_MAX = Number(process.env.CHAT_HISTORIAL ?? 20);

const SYSTEM_PROMPT = `Sos el asistente de atencion al cliente de Cayman Bank, un banco argentino.

Hablas en espanol rioplatense, de forma clara y breve. No inventas datos: si necesitas
informacion de la cuenta del cliente, la buscas con las herramientas disponibles.

Reglas:
- Los datos que devuelven las herramientas son siempre del cliente autenticado. Nunca
  pidas ni aceptes que te pasen el CBU o el DNI de otra persona para consultarlos.
- Los montos van en pesos argentinos salvo que la herramienta indique otra moneda.
- Si el cliente pide algo que no podes resolver (un reclamo, un error de la cuenta, un
  fraude ya consumado), decile que lo vas a derivar a un representante.
- No des consejos de inversion. Podes explicar como funciona un producto, no recomendar
  si conviene o no.
- Si una accion queda pendiente de confirmacion, explicale al cliente exactamente que
  va a pasar cuando confirme.`;

export interface AccionEjecutada {
  accion: string;
  parametros: unknown;
  resultado: unknown;
}

export interface AccionPendiente {
  accion: string;
  parametros: unknown;
  motivo: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private readonly client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(Escalation)
    private readonly escalationRepository: Repository<Escalation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly accountsService: AccountsService,
    private readonly cardsService: CardsService,
    private readonly loansService: LoansService,
    private readonly reportsService: ReportsService,
    private readonly dolarService: DolarService,
  ) {}

  private get configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  /**
   * Ejecuta una herramienta contra los servicios del banco.
   * Siempre opera sobre el cliente autenticado: el clerkId no sale del backend.
   */
  private async runTool(
    clerkId: string,
    name: string,
    input: Record<string, any>,
  ): Promise<unknown> {
    switch (name) {
      case 'consultar_saldos':
        return this.accountsService.getBalances(clerkId);

      case 'consultar_movimientos': {
        const cbu =
          input.cbu ?? (await this.accountsService.findPrimary(clerkId))?.cbu;
        if (!cbu) return { error: 'El cliente no tiene una caja de ahorro con CBU' };
        const movimientos = await this.accountsService.getMovements(clerkId, cbu);
        return movimientos.slice(0, Number(input.limite ?? 10));
      }

      case 'consultar_gastos_por_categoria': {
        const cbu = (await this.accountsService.findPrimary(clerkId))?.cbu;
        if (!cbu) return { error: 'El cliente no tiene una caja de ahorro con CBU' };
        return this.reportsService.expenseSummary(clerkId, cbu, input.periodo);
      }

      case 'listar_tarjetas':
        return this.cardsService.findAllByUser(clerkId);

      case 'consultar_prestamos':
        return this.loansService.findAllByUser(clerkId);

      case 'consultar_cotizacion_dolar':
        return this.dolarService.getCotizacionOperativa();

      case 'bloquear_tarjeta':
        return this.cardsService.setBlock(
          clerkId,
          Number(input.tarjetaId),
          String(input.accion),
        );

      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  }

  /**
   * Procesa un mensaje del cliente.
   *
   * El bucle de herramientas es manual y no el tool runner del SDK porque hace
   * falta interceptar cada llamada ANTES de ejecutarla, para frenar las acciones
   * que cambian estado y que todavia no estan autorizadas.
   */
  async sendMessage(clerkId: string, texto: string, confirmar = false) {
    if (!texto?.trim()) {
      throw new BadRequestException('El mensaje no puede estar vacio');
    }

    if (!this.configured) {
      throw new HttpException(
        'El asistente no esta configurado: falta ANTHROPIC_API_KEY',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const historial = await this.messageRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
      take: HISTORIAL_MAX,
    });

    const messages: Anthropic.MessageParam[] = historial
      .reverse()
      .map((message) => ({ role: message.role, content: message.content }));

    messages.push({ role: 'user', content: texto });

    const tools: Anthropic.Tool[] = CHAT_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const accionesEjecutadas: AccionEjecutada[] = [];
    const accionesPendientes: AccionPendiente[] = [];

    let respuesta = '';

    // Tope de vueltas: sin esto, un modelo que insiste con la misma herramienta
    // deja el request colgado.
    for (let iteracion = 0; iteracion < 6; iteracion += 1) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      respuesta = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (response.stop_reason !== 'tool_use') break;

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const spec = CHAT_TOOL_BY_NAME.get(toolUse.name);
        const input = (toolUse.input ?? {}) as Record<string, any>;

        // Politica de acciones autonomas: lo que cambia estado no se ejecuta
        // salvo que este habilitado por config o que el cliente lo confirme.
        const permitida =
          spec?.readOnly || confirmar || ACCIONES_AUTONOMAS.has(toolUse.name);

        if (!permitida) {
          const motivo = 'Requiere confirmacion explicita del cliente';
          accionesPendientes.push({ accion: toolUse.name, parametros: input, motivo });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              ejecutada: false,
              motivo,
              instruccion:
                'Explicale al cliente que vas a hacer y pedile que confirme. No digas que ya lo hiciste.',
            }),
          });
          continue;
        }

        try {
          const resultado = await this.runTool(clerkId, toolUse.name, input);
          accionesEjecutadas.push({ accion: toolUse.name, parametros: input, resultado });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(resultado),
          });
        } catch (error) {
          // Un fallo de herramienta se le devuelve al modelo para que se lo
          // explique al cliente, en vez de romper todo el request.
          this.logger.warn(`Herramienta ${toolUse.name} fallo: ${(error as Error).message}`);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: (error as Error).message,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    await this.messageRepository.save([
      this.messageRepository.create({ role: ChatRole.USER, content: texto, user }),
      this.messageRepository.create({
        role: ChatRole.ASSISTANT,
        content: respuesta,
        user,
      }),
    ]);

    return {
      respuesta,
      accionesEjecutadas,
      accionesPendientes,
      // Se deriva a un humano cuando quedo algo sin poder resolverse solo.
      requiereHumano: accionesPendientes.length > 0,
    };
  }

  async getHistory(clerkId: string) {
    const messages = await this.messageRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'ASC' },
      take: 200,
    });

    return messages.map((message) => ({
      id: message.id,
      rol: message.role,
      texto: message.content,
      fecha: message.createdAt,
    }));
  }

  async clearHistory(clerkId: string) {
    const { affected } = await this.messageRepository.delete({
      user: { id: clerkId },
    });
    return { borrados: affected ?? 0 };
  }

  /** Deriva la conversacion a un representante humano. */
  async escalate(clerkId: string, motivo: string) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    if (!motivo?.trim()) {
      throw new BadRequestException('Hay que indicar el motivo de la derivacion');
    }

    const escalation = await this.escalationRepository.save(
      this.escalationRepository.create({
        motivo,
        status: EscalationStatus.PENDIENTE,
        user,
      }),
    );

    return {
      id: escalation.id,
      estado: escalation.status,
      motivo: escalation.motivo,
      fecha: escalation.createdAt,
    };
  }

  /** Cola de derivaciones, para el personal del banco. */
  async listEscalations() {
    const escalations = await this.escalationRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return escalations.map((escalation) => ({
      id: escalation.id,
      estado: escalation.status,
      motivo: escalation.motivo,
      fecha: escalation.createdAt,
      cliente: {
        id: escalation.user?.id,
        nombre: escalation.user?.fullName,
        email: escalation.user?.email,
      },
    }));
  }
}
