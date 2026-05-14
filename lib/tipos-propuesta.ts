// ═══════════════════════════════════════════════════════════════════════
// TIPOS DE PROPUESTA — fuente única de verdad
// ═══════════════════════════════════════════════════════════════════════
//
// Cada tipo de propuesta es un registro de configuración que une:
//   - metadatos de UI (label, descripción)
//   - plantilla .docx asociada (archivo en /public)
//   - prompt de IA para generar el TEXTO_OBJETIVO
//
// AÑADIR UN TIPO NUEVO:
//   1. Sube la plantilla .docx a /public/ con todos los placeholders del
//      contrato (ver PLACEHOLDERS_CONTRACT más abajo).
//   2. Añade una entrada nueva a TIPOS_PROPUESTA.
//   3. Listo. La UI se regenera sola y el backend coge el prompt nuevo.
//
// CONTRATO DE PLACEHOLDERS que TODA plantilla debe respetar:
//   {{FECHA}}            → "MAYO 2026"
//   {{NOMBRE_EMPRESA}}   → nombre de la empresa
//   {{SECTOR}}           → sector libre
//   {{TEXTO_OBJETIVO}}   → bloque generado por IA (admite **negritas**)
//   {{LINEAS}}           → bullets de líneas seleccionadas
//   {{IMPORTE}}          → importe formateado (portada)
//   {{IMPORTE_CUERPO}}   → importe formateado (cuerpo)
//   {{VIA}}              → vía de financiación (portada)
//   {{VIA_CUERPO}}       → vía de financiación (cuerpo)
//   {{LOGO}}             → logo de la empresa en el header
// ═══════════════════════════════════════════════════════════════════════

export type TipoPropuestaId = 'socios' | 'lgd' | 'general';

export type TipoPropuesta = {
  /** Identificador interno usado en API, storage, etc. */
  id: TipoPropuestaId;
  /** Texto visible en los tabs de la UI */
  label: string;
  /** Ruta al archivo .docx en /public (incluyendo barra inicial) */
  plantilla: string;
  /** Prompt que se envía a Anthropic. Acepta variables {NOMBRE}, {SECTOR}, etc. vía función */
  buildPrompt: (vars: PromptVars) => string;
};

export type PromptVars = {
  nombre: string;
  sector: string;
  tamano?: string;
  historial?: string;
  valores?: string;
  contexto?: string;
  lineas: string[];
};

// ─── INSTRUCCIONES COMUNES (DRY: no repetir en cada prompt) ───
const FORMATO_COMUN = `
INSTRUCCIONES DE FORMATO (idénticas para todos los tipos):
- Exactamente 3 párrafos. El PRIMER PÁRRAFO debe ser breve (3-4 frases máximo) y servir de gancho.
- Usa **negritas en formato markdown** (con dobles asteriscos) en los 2-3 conceptos clave que quieras resaltar: nombre de la empresa, conceptos estratégicos, métricas. NO abuses (máximo 4-5 negritas en total).
- Menciona el nombre de la empresa de forma natural, sin sobresaturar.
- Sin bullets, sin títulos, sin presupuesto, sin emojis. Solo texto corrido en español de España.
- Separa párrafos con UNA línea en blanco.
- Devuelve SOLO el texto, sin preámbulos ni explicaciones.`;

const datosEmpresaBlock = (v: PromptVars) => `DATOS EMPRESA:
- Nombre: ${v.nombre}
- Sector: ${v.sector}${v.tamano ? `\n- Tamaño: ${v.tamano}` : ''}${v.historial ? `\n- Historial con Íntegra: ${v.historial}` : ''}${v.valores ? `\n- Valores RSC: ${v.valores}` : ''}${v.contexto ? `\n- Contexto: ${v.contexto}` : ''}`;

// ═══════════════════════════════════════════════════════════════════════
// REGISTRO DE TIPOS
// ═══════════════════════════════════════════════════════════════════════
export const TIPOS_PROPUESTA: Record<TipoPropuestaId, TipoPropuesta> = {
  socios: {
    id: 'socios',
    label: 'Socios Compromiso Íntegra 2026',
    plantilla: '/plantilla-integra.docx',
    buildPrompt: (v) => `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA ESTRATÉGICA para que ${v.nombre} se convierta en socio de la Red Compromiso Íntegra 2026 — una red de empresas referentes que apuestan por el empleo socialmente responsable como parte de su estrategia ESG.

${datosEmpresaBlock(v)}
LÍNEAS A DESTACAR: ${v.lineas.join(', ') || 'colaboración general'}

ENFOQUE ESTRATÉGICO (ESG avanzado + red de pares):
- Tono de alianza de largo plazo, no de proveedor-cliente. Hablamos entre iguales.
- Vocabulario estratégico: "alianza", "compromiso de largo plazo", "posicionamiento ESG", "capital reputacional", "liderazgo sectorial".
- Conecta explícitamente con la dimensión Social del ESG y con la CSRD/reportes de sostenibilidad.
- Menciona que la Red Compromiso Íntegra agrupa a empresas referentes del sector.
- Enmarca la inclusión laboral como ventaja competitiva, no como obligación.
- Cierre con visión 2026+: invitación a construir algo conjunto y medible.
- NO uses lenguaje de cumplimiento normativo.
${FORMATO_COMUN}`,
  },

  lgd: {
    id: 'lgd',
    label: 'Consultoría LGD',
    plantilla: '/plantilla-integra.docx',
    buildPrompt: (v) => `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA CONSULTIVA Y COMERCIAL para que ${v.nombre} cumpla con la Ley General de Discapacidad (LGD) de la mano de Íntegra — aprovechando ese cumplimiento para generar impacto social real, no solo cubrir el expediente.

${datosEmpresaBlock(v)}
LÍNEAS A DESTACAR: ${v.lineas.join(', ') || 'cumplimiento LGD y contratación directa'}

ENFOQUE CONSULTIVO (normativo + impacto):
- Tono comercial y práctico. Resolvemos un problema concreto: la obligación de reservar el 2% de la plantilla a personas con discapacidad (LGD).
- Vocabulario normativo: "cumplimiento", "certificado de excepcionalidad", "medidas alternativas", "contratación directa", "auditoría laboral".
- Reconoce el reto operativo de cumplir la LGD en el día a día de ${v.nombre} sin sacrificar eficiencia.
- Posiciona a Íntegra como el partner técnico: búsqueda de candidatos, gestión documental, renovación del certificado.
- Capa ESG: cumplir "bien" la LGD (con contratación directa real) es mejor que solo "aprobar el examen" con medidas alternativas.
- Cierre orientado a los próximos pasos operativos (reunión, calendario, documentación).
- NO uses lenguaje de alianza estratégica de largo plazo.
${FORMATO_COMUN}`,
  },

  general: {
    id: 'general',
    label: 'Colaboración general',
    plantilla: '/plantilla-integra.docx',
    buildPrompt: (v) => `Eres el equipo de alianzas de Fundación Íntegra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA EXPLORATORIA de colaboración con ${v.nombre} — una primera toma de contacto donde todavía no están cerradas ni la forma ni el alcance de la colaboración.

${datosEmpresaBlock(v)}
LÍNEAS POSIBLES: ${v.lineas.join(', ') || 'varias líneas por definir'}

ENFOQUE EXPLORATORIO (abrir conversación, no cerrar trato):
- Tono de descubrimiento, no de venta. Queremos encontrar el mejor formato de colaboración juntos.
- Vocabulario de exploración: "explorar sinergias", "identificar puntos de conexión", "primera colaboración", "ámbitos de encuentro".
- Presenta a Íntegra como una fundación versátil que puede aportar valor de muchas formas.
- Flexibilidad en la forma: colaboración puntual, programa piloto, voluntariado... según interés mutuo.
- Cierre con invitación clara a una reunión para concretar ámbitos de colaboración.
- NO comprometas a ${v.nombre} con formatos concretos ni vocabulario de alianza cerrada.
${FORMATO_COMUN}`,
  },
};

// ─── Lista ordenada para iterar en la UI (en lugar del array hardcodeado) ───
export const TIPOS_PROPUESTA_LIST: TipoPropuesta[] = [
  TIPOS_PROPUESTA.socios,
  TIPOS_PROPUESTA.lgd,
  TIPOS_PROPUESTA.general,
];