import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Conversacion,
  crearProveedorChat,
  esSaturacion,
  MensajePrevio,
} from './chat.providers';

/** Mensajes por visitante (IP) en la ventana de abajo. */
const LIMITE_MENSAJES = Number(process.env.CHAT_LIMITE_POR_HORA ?? 20);
const VENTANA_LIMITE_MS = 60 * 60 * 1000;

/** Topes para que un solo pedido no gaste de mas la cuota del modelo. */
const MAX_CARACTERES = 500;
const MAX_HISTORIAL = 10;

const SYSTEM_PROMPT = `Sos el asistente virtual de Cayman Bank, un banco argentino (entidad N.º 19).
Atendes a cualquier persona desde la pagina publica del banco, este o no registrada.

Hablas en espanol rioplatense, de forma clara y breve.

Podes responder preguntas generales:
- Que productos ofrece el banco: cajas de ahorro en pesos y en dolares, transferencias
  a cualquier CBU o alias del pais, tarjetas de debito y credito, prestamos personales,
  plazos fijos, CEDEARs, seguros, pago de servicios y recargas de celular.
- Los plazos fijos, los prestamos y la compra de CEDEARs son solo en pesos. En dolares
  se puede tener la caja de ahorro y transferir a otras cajas en dolares.
- Como se abre una cuenta: registrandose en la pagina con su email y completando sus datos.
- Conceptos bancarios y financieros en general: que es un CBU, un alias, un plazo fijo,
  una TNA, un CEDEAR, como funciona una transferencia, etc.

Reglas:
- NO tenes acceso a ninguna cuenta ni a datos de clientes. Si te preguntan por un saldo,
  un movimiento, una tarjeta, un prestamo o cualquier dato de su cuenta, explica que
  eso se consulta ingresando al homebanking, y no intentes adivinarlo.
- Nunca pidas ni aceptes datos personales o sensibles: DNI, CBU, numero de tarjeta,
  claves o codigos. Si alguien los escribe, avisale que no los comparta por este medio.
- No inventes tasas, montos, comisiones ni condiciones. Si te preguntan valores
  concretos, deci que se ven en el homebanking y que pueden cambiar.
- No des consejos de inversion: podes explicar como funciona un producto, no
  recomendar si conviene.
- Si la pregunta no tiene que ver con el banco ni con temas financieros, responde
  amablemente que solo podes ayudar con consultas sobre Cayman Bank.
- Es un proyecto academico: si preguntan, aclara que no es una entidad financiera real.`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly proveedor = crearProveedorChat();

  /** Momentos de los ultimos mensajes de cada IP. En memoria: se reinicia con el backend. */
  private readonly usoPorIp = new Map<string, number[]>();

  /**
   * Responde una pregunta general desde la landing. No ve ninguna cuenta:
   * no tiene herramientas y no sabe quien pregunta.
   *
   * El historial lo guarda el navegador y lo manda en cada mensaje; el backend
   * no persiste nada.
   */
  async responder(ip: string, texto: string, historial: MensajePrevio[] = []) {
    const limpio = texto?.trim();
    if (!limpio) {
      throw new BadRequestException('El mensaje no puede estar vacio');
    }
    if (limpio.length > MAX_CARACTERES) {
      throw new BadRequestException(
        `El mensaje no puede superar los ${MAX_CARACTERES} caracteres`,
      );
    }

    if (!this.proveedor.configurado) {
      throw new HttpException(
        `El asistente no esta configurado: falta ${this.proveedor.variableKey}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.registrarUso(ip);

    const previos = (Array.isArray(historial) ? historial : [])
      .filter(
        (mensaje) =>
          (mensaje?.role === 'user' || mensaje?.role === 'assistant') &&
          typeof mensaje.content === 'string' &&
          mensaje.content.trim(),
      )
      .slice(-MAX_HISTORIAL)
      .map((mensaje) => ({
        role: mensaje.role,
        content: mensaje.content.slice(0, 4000),
      }));

    const conversacion = this.proveedor.iniciar(SYSTEM_PROMPT, [], previos, limpio);
    const turno = await this.pedirTurno(conversacion);

    return { respuesta: turno.texto };
  }

  /** Corta con 429 si la IP ya uso su cupo de la ultima hora. */
  private registrarUso(ip: string) {
    const ahora = Date.now();
    const recientes = (this.usoPorIp.get(ip) ?? []).filter(
      (momento) => ahora - momento < VENTANA_LIMITE_MS,
    );

    if (recientes.length >= LIMITE_MENSAJES) {
      throw new HttpException(
        'Llegaste al limite de mensajes por hora. Proba de nuevo mas tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recientes.push(ahora);
    this.usoPorIp.set(ip, recientes);

    // Limpieza ocasional para que el mapa no crezca sin fin.
    if (this.usoPorIp.size > 5000) {
      for (const [clave, momentos] of this.usoPorIp) {
        if (momentos.every((momento) => ahora - momento >= VENTANA_LIMITE_MS)) {
          this.usoPorIp.delete(clave);
        }
      }
    }
  }

  /**
   * Un turno del modelo, con reintento y espera creciente si el proveedor esta
   * saturado (muy comun en el plan gratuito de Gemini). Si no se recupera, se
   * informa como 503 con un mensaje claro, no como un 500 generico.
   */
  private async pedirTurno(conversacion: Conversacion) {
    const esperas = [1000, 3000];

    for (let intento = 0; ; intento += 1) {
      try {
        return await conversacion.siguienteTurno();
      } catch (error) {
        if (!esSaturacion(error)) throw error;

        this.logger.warn(
          `${this.proveedor.nombre} saturado (intento ${intento + 1}): ${(error as Error).message}`,
        );

        if (intento >= esperas.length) {
          throw new HttpException(
            'El asistente esta saturado en este momento. Proba de nuevo en unos minutos.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, esperas[intento]));
      }
    }
  }
}
