/**
 * Adaptadores del asistente a cada proveedor de modelos.
 *
 * El bucle de herramientas y la politica de acciones autonomas viven en
 * ChatService y no dependen del proveedor: cada adaptador solo traduce el
 * historial, las herramientas y los resultados al formato de su API.
 *
 * Se elige con CHAT_PROVIDER (anthropic | gemini).
 */
import Anthropic from '@anthropic-ai/sdk';
import { Content, GoogleGenAI } from '@google/genai';
import { ChatToolSpec } from './chat.tools';

export interface MensajePrevio {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlamadaHerramienta {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ResultadoHerramienta {
  llamada: LlamadaHerramienta;
  /** Lo que devolvio la herramienta, o el mensaje de error si fallo. */
  contenido: unknown;
  esError: boolean;
}

export interface TurnoModelo {
  texto: string;
  /** Vacio cuando el modelo termino y no pide ninguna herramienta. */
  llamadas: LlamadaHerramienta[];
}

/** Una conversacion en curso: guarda el historial en el formato de su API. */
export interface Conversacion {
  siguienteTurno(): Promise<TurnoModelo>;
  agregarResultados(resultados: ResultadoHerramienta[]): void;
}

/** El proveedor esta saturado o se paso del limite de uso: vale reintentar. */
export function esSaturacion(error: unknown): boolean {
  const status = Number((error as { status?: number })?.status);
  return status === 429 || status === 503 || status === 529;
}

export interface ProveedorChat {
  readonly nombre: string;
  /** Variable de entorno de la key, para el mensaje de "no configurado". */
  readonly variableKey: string;
  readonly configurado: boolean;
  iniciar(
    system: string,
    tools: ChatToolSpec[],
    historial: MensajePrevio[],
    texto: string,
  ): Conversacion;
}

class ProveedorAnthropic implements ProveedorChat {
  readonly nombre = 'anthropic';
  readonly variableKey = 'ANTHROPIC_API_KEY';
  private readonly model = process.env.CHAT_MODEL || 'claude-opus-5';
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  get configurado() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  iniciar(system: string, specs: ChatToolSpec[], historial: MensajePrevio[], texto: string) {
    const tools: Anthropic.Tool[] = specs.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [
      ...historial,
      { role: 'user', content: texto },
    ];

    return {
      siguienteTurno: async (): Promise<TurnoModelo> => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4000,
          thinking: { type: 'adaptive' },
          system,
          tools,
          messages,
        });

        const texto = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();

        if (response.stop_reason !== 'tool_use') return { texto, llamadas: [] };

        // El turno se guarda entero: los bloques de thinking tienen que volver
        // tal cual en la siguiente llamada.
        messages.push({ role: 'assistant', content: response.content });

        const llamadas = response.content
          .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
          .map((block) => ({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, any>,
          }));

        return { texto, llamadas };
      },

      agregarResultados: (resultados: ResultadoHerramienta[]) => {
        messages.push({
          role: 'user',
          content: resultados.map((resultado) => ({
            type: 'tool_result' as const,
            tool_use_id: resultado.llamada.id,
            is_error: resultado.esError || undefined,
            content:
              typeof resultado.contenido === 'string'
                ? resultado.contenido
                : JSON.stringify(resultado.contenido),
          })),
        });
      },
    };
  }
}

class ProveedorGemini implements ProveedorChat {
  readonly nombre = 'gemini';
  readonly variableKey = 'GEMINI_API_KEY';
  /**
   * Modelos en orden de preferencia. En el plan gratuito cada modelo devuelve
   * 503 por "alta demanda" de forma intermitente, y casi nunca todos a la vez:
   * si uno esta saturado se prueba el siguiente. CHAT_MODEL acepta una lista
   * separada por comas. (gemini-2.5 ya no se habilita para cuentas nuevas.)
   */
  private readonly modelos = (
    process.env.CHAT_MODEL || 'gemini-3.8-flash,gemini-3.5-flash,gemini-3.1-flash-lite'
  )
    .split(',')
    .map((modelo) => modelo.trim())
    .filter(Boolean);
  private readonly client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  get configurado() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  iniciar(system: string, specs: ChatToolSpec[], historial: MensajePrevio[], texto: string) {
    const functionDeclarations = specs.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema,
    }));

    const contents: Content[] = [
      ...historial.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      { role: 'user', parts: [{ text: texto }] },
    ];

    // Ids que armamos nosotros porque Gemini no mando uno: no se le devuelven.
    const idsPropios = new Set<string>();

    // Una vez que un modelo respondio, la conversacion sigue con ese: las
    // firmas de razonamiento de un modelo no le sirven a otro.
    let modeloFijo: string | undefined;

    const generar = async () => {
      const candidatos = modeloFijo ? [modeloFijo] : this.modelos;

      for (const [index, modelo] of candidatos.entries()) {
        try {
          const response = await this.client.models.generateContent({
            model: modelo,
            contents,
            config: {
              systemInstruction: system,
              tools: [{ functionDeclarations }],
            },
          });
          modeloFijo = modelo;
          return response;
        } catch (error) {
          if (!esSaturacion(error) || index === candidatos.length - 1) throw error;
        }
      }
      throw new Error('Sin modelos de Gemini configurados');
    };

    return {
      siguienteTurno: async (): Promise<TurnoModelo> => {
        const response = await generar();

        const contenido = response.candidates?.[0]?.content;
        const texto = (contenido?.parts ?? [])
          .filter((part) => part.text && !part.thought)
          .map((part) => part.text)
          .join('\n')
          .trim();
        const calls = response.functionCalls ?? [];

        if (!contenido || calls.length === 0) return { texto, llamadas: [] };

        // Igual que con Anthropic: el turno vuelve tal cual, porque trae las
        // firmas de razonamiento (thoughtSignature) que Gemini exige de vuelta.
        contents.push(contenido);

        const llamadas = calls.map((call, index) => {
          // Gemini no siempre asigna id; sin id empareja por nombre y orden.
          const id = call.id ?? `${call.name}-${contents.length}-${index}`;
          if (!call.id) idsPropios.add(id);
          return {
            id,
            name: call.name ?? '',
            input: (call.args ?? {}) as Record<string, any>,
          };
        });

        return { texto, llamadas };
      },

      agregarResultados: (resultados: ResultadoHerramienta[]) => {
        contents.push({
          role: 'user',
          parts: resultados.map((resultado) => ({
            functionResponse: {
              id: idsPropios.has(resultado.llamada.id) ? undefined : resultado.llamada.id,
              name: resultado.llamada.name,
              // Gemini pide un objeto: los arrays y los errores van envueltos.
              response: resultado.esError
                ? { error: resultado.contenido }
                : { resultado: resultado.contenido },
            },
          })),
        });
      },
    };
  }
}

export function crearProveedorChat(): ProveedorChat {
  const nombre = (process.env.CHAT_PROVIDER || 'anthropic').trim().toLowerCase();

  switch (nombre) {
    case 'anthropic':
      return new ProveedorAnthropic();
    case 'gemini':
      return new ProveedorGemini();
    default:
      throw new Error(`CHAT_PROVIDER desconocido: ${nombre}. Usar anthropic o gemini.`);
  }
}
