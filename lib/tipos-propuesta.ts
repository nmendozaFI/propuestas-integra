// ═══════════════════════════════════════════════════════════════════════
// TIPOS DE PROPUESTA — fuente única de verdad
// ═══════════════════════════════════════════════════════════════════════
//
// Cada tipo de propuesta es un registro de configuración que une:
//   - metadatos de UI (label, descripción)
//   - plantilla .docx asociada (archivo en /public)
//   - declaración de qué campos pide el formulario
//   - si usa IA o no (algunos tipos son plantilla pura)
//   - prompt de IA (solo si usaIA = true)
//
// AÑADIR UN TIPO NUEVO:
//   1. Sube la plantilla .docx a /public/ con sus placeholders.
//   2. Añade una entrada a TIPOS_PROPUESTA con sus `campos` y `placeholdersExtra`.
//   3. Listo. UI y backend lo recogen automáticamente.
//
// CONTRATO DE PLACEHOLDERS:
//   Base (común a varias plantillas):
//     {{FECHA}}            → "MAYO 2026"
//     {{NOMBRE_EMPRESA}}   → nombre de la empresa
//     {{IMPORTE_CUERPO}}   → importe formateado (cuerpo)
//     {{LOGO}}             → logo de la empresa en el header
//   Solo "socios":
//     {{SECTOR}}, {{TEXTO_OBJETIVO}}, {{LINEAS}}, {{IMPORTE}}, {{VIA}}, {{VIA_CUERPO}}
//   Solo "empleo-sin-barreras":
//     {{DURACION}}, {{FECHA_INICIO}}, {{NUM_BENEFICIARIOS}}
// ═══════════════════════════════════════════════════════════════════════

export type TipoPropuestaId = 'socios' | 'lgd' | 'empleo-sin-barreras';

// ─── Declaración de un campo del formulario ───
export type CampoTipo = 'text' | 'textarea' | 'select' | 'number';

export type CampoConfig = {
  /** Clave única — se usa también como nombre del placeholder en la plantilla (en mayúsculas: nombre → {{NOMBRE_EMPRESA}}) */
  key: string;
  /** Label que se muestra en el form */
  label: string;
  /** Tipo de input */
  tipo: CampoTipo;
  /** Si el campo es obligatorio */
  obligatorio?: boolean;
  /** Placeholder del input */
  placeholder?: string;
  /** Opciones para tipo select */
  opciones?: string[];
  /** Texto de ayuda opcional bajo el input */
  ayuda?: string;
  /** Ocupar grid de 2 cols (default true). false = ocupar ancho completo */
  ancho?: 'medio' | 'completo';
};

export type TipoPropuesta = {
  id: TipoPropuestaId;
  label: string;
  /** Ruta al archivo .docx en /public */
  plantilla: string;
  /** Si false, no se llama a la IA: se descarga directamente la plantilla rellena */
  usaIA: boolean;
  /** Campos que el formulario debe renderizar para este tipo */
  campos: CampoConfig[];
  /** Solo si usaIA = true: función que arma el prompt para Anthropic */
  buildPrompt?: (vars: PromptVars) => string;
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

// ─── Bloques reutilizables solo para el prompt de "socios" ───
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
// CAMPOS REUTILIZABLES
// ═══════════════════════════════════════════════════════════════════════
const CAMPO_NOMBRE: CampoConfig = {
  key: 'nombre',
  label: 'Nombre de la empresa',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Deloitte España',
};

const CAMPO_IMPORTE: CampoConfig = {
  key: 'importe',
  label: 'Importe (€)',
  tipo: 'text',
  placeholder: 'Ej: 10.800 · el € se añade solo',
};

// ═══════════════════════════════════════════════════════════════════════
// REGISTRO DE TIPOS
// ═══════════════════════════════════════════════════════════════════════
export const TIPOS_PROPUESTA: Record<TipoPropuestaId, TipoPropuesta> = {
  socios: {
    id: 'socios',
    label: 'Socios Compromiso Íntegra 2026',
    plantilla: '/plantilla-integra.docx',
    usaIA: true,
    // Para 'socios' los campos los gestiona el form clásico — los dejamos vacíos
    // y el frontend usa su sección histórica completa (todo el form actual).
    campos: [],
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
    plantilla: '/plantilla-lgd.docx',
    usaIA: false,
    campos: [
      CAMPO_NOMBRE,
      { ...CAMPO_IMPORTE, ayuda: 'Si lo dejas vacío, en la plantilla queda "Por definir".' },
    ],
  },

  'empleo-sin-barreras': {
    id: 'empleo-sin-barreras',
    label: 'Empleo Sin Barreras',
    plantilla: '/plantilla-empleo-sin-barreras.docx',
    usaIA: false,
    campos: [
      CAMPO_NOMBRE,
      {
        key: 'duracion',
        label: 'Duración del proyecto',
        tipo: 'text',
        obligatorio: true,
        placeholder: 'Ej: 9 meses',
      },
      {
        key: 'fechaInicio',
        label: 'Fecha de inicio',
        tipo: 'text',
        obligatorio: true,
        placeholder: 'Ej: día siguiente a la concesión de la excepcionalidad',
        ayuda: 'Texto libre. Puede ser una fecha concreta o un evento.',
        ancho: 'completo',
      },
      {
        key: 'numBeneficiarios',
        label: 'Nº de beneficiarios',
        tipo: 'number',
        obligatorio: true,
        placeholder: 'Ej: 8',
      },
      CAMPO_IMPORTE,
    ],
  },
};

// ─── Lista ordenada para iterar en la UI ───
export const TIPOS_PROPUESTA_LIST: TipoPropuesta[] = [
  TIPOS_PROPUESTA.socios,
  TIPOS_PROPUESTA.lgd,
  TIPOS_PROPUESTA['empleo-sin-barreras'],
];