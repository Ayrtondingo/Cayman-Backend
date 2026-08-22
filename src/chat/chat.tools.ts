/**
 * Catalogo de acciones que el asistente puede ejecutar.
 *
 * Cada entrada declara si es de solo lectura o si cambia estado. Esa distincion
 * es la que define la politica de acciones autonomas: leer datos del cliente
 * autenticado es siempre seguro, cambiar algo no.
 */
export interface ChatToolSpec {
  name: string;
  description: string;
  /** JSON Schema de los parametros, tal como lo espera la API. */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * false = la accion cambia estado y, salvo que este habilitada explicitamente,
   * queda pendiente de confirmacion del cliente en vez de ejecutarse.
   */
  readOnly: boolean;
}

const noParams = { type: 'object' as const, properties: {} };

export const CHAT_TOOLS: ChatToolSpec[] = [
  {
    name: 'consultar_saldos',
    description:
      'Devuelve las cajas de ahorro del cliente con su CBU, alias, moneda y saldo actual.',
    inputSchema: noParams,
    readOnly: true,
  },
  {
    name: 'consultar_movimientos',
    description:
      'Ultimos movimientos de una caja de ahorro del cliente. Si no se indica CBU, usa la caja en pesos.',
    inputSchema: {
      type: 'object',
      properties: {
        cbu: { type: 'string', description: 'CBU de 22 digitos. Opcional.' },
        limite: { type: 'integer', description: 'Cuantos movimientos traer. Por defecto 10.' },
      },
    },
    readOnly: true,
  },
  {
    name: 'consultar_gastos_por_categoria',
    description:
      'Resumen de gastos del cliente agrupados por categoria para un periodo YYYY-MM. Sin periodo usa el mes en curso.',
    inputSchema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', description: 'Periodo en formato YYYY-MM. Opcional.' },
      },
    },
    readOnly: true,
  },
  {
    name: 'listar_tarjetas',
    description:
      'Tarjetas del cliente con su tipo, numero enmascarado, estado (activa o bloqueada) y limite.',
    inputSchema: noParams,
    readOnly: true,
  },
  {
    name: 'consultar_prestamos',
    description:
      'Prestamos del cliente: monto, cuota, cuotas pagadas, capital adeudado y proximo vencimiento.',
    inputSchema: noParams,
    readOnly: true,
  },
  {
    name: 'consultar_cotizacion_dolar',
    description: 'Cotizacion del dolar con la que opera el banco en este momento.',
    inputSchema: noParams,
    readOnly: true,
  },
  {
    name: 'bloquear_tarjeta',
    description:
      'Bloquea o desbloquea una tarjeta del cliente. Usar cuando reporta robo, extravio o uso indebido.',
    inputSchema: {
      type: 'object',
      properties: {
        tarjetaId: { type: 'integer', description: 'Id de la tarjeta.' },
        accion: {
          type: 'string',
          enum: ['bloquear', 'desbloquear'],
          description: 'Que hacer con la tarjeta.',
        },
      },
      required: ['tarjetaId', 'accion'],
    },
    readOnly: false,
  },
];

export const CHAT_TOOL_BY_NAME = new Map(CHAT_TOOLS.map((tool) => [tool.name, tool]));
