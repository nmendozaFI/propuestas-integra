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
//   2. Añade una entrada a TIPOS_PROPUESTA con sus `campos`.
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
//     {{DURACION}}, {{FECHA_INICIO}}, {{NUM_BENEFICIARIOS}}, {{FECHA_DOCUMENTO}}
// ═══════════════════════════════════════════════════════════════════════

export type TipoPropuestaId = 'socios' | 'lgd' | 'empleo-sin-barreras';

// ─── Declaración de un campo del formulario ───
export type CampoTipo = 'text' | 'textarea' | 'select' | 'number';

export type CampoConfig = {
  key: string;
  label: string;
  tipo: CampoTipo;
  obligatorio?: boolean;
  placeholder?: string;
  opciones?: string[];
  ayuda?: string;
  ancho?: 'medio' | 'completo';
};

export type TipoPropuesta = {
  id: TipoPropuestaId;
  label: string;
  plantilla: string;
  usaIA: boolean;
  campos: CampoConfig[];
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

// ═══════════════════════════════════════════════════════════════════════
// LÍNEAS DE COLABORACIÓN — fuente única
//
// LINEAS_LIST se exporta para que el frontend la consuma directamente.
// `frase` es la cadena que va al bullet {{LINEAS}} y se cita al prompt
// para que la IA la ponga en negrita.
// ═══════════════════════════════════════════════════════════════════════
export type LineaKey =
  | 'reclutamiento'
  | 'lgd'
  | 'voluntariado'
  | 'sensibilizacion'
  | 'comunicacion'
  | 'esg';

export type LineaConfig = {
  key: LineaKey;
  label: string;
  frase: string;
  porDefecto: boolean;
};

export const LINEAS_LIST: LineaConfig[] = [
  {
    key: 'reclutamiento',
    label: 'Reclutamiento e inserción laboral',
    // "de manera ilimitada" se añade SIEMPRE: es un compromiso comercial
    // clave que no se negocia. Aparece tanto en {{LINEAS}} (bullet) como
    // se le pide a la IA que lo respete dentro del TEXTO_OBJETIVO.
    frase: 'Reclutamiento e inserción laboral de personas vulnerables de manera ilimitada',
    porDefecto: true,
  },
  {
    key: 'lgd',
    label: 'Consultoría LGD',
    frase: 'Consultoría y cumplimiento de la LGD (Ley General de Discapacidad)',
    porDefecto: true,
  },
  {
    key: 'voluntariado',
    label: 'Voluntariado corporativo',
    frase: 'Voluntariado corporativo con beneficiarios de la Fundación',
    porDefecto: false,
  },
  {
    key: 'sensibilizacion',
    label: 'Jornadas de sensibilización',
    frase: 'Jornadas de sensibilización y transformación cultural',
    porDefecto: false,
  },
  {
    key: 'comunicacion',
    label: 'Comunicación y marca',
    frase: 'Acciones de comunicación y refuerzo de imagen de marca',
    porDefecto: false,
  },
  {
    key: 'esg',
    label: 'Informe huella social ESG',
    frase: 'Informe anual de huella social ESG',
    porDefecto: false,
  },
];

// ─── Bloques reutilizables solo para el prompt de "socios" ───
const FORMATO_COMUN = `
INSTRUCCIONES DE FORMATO (idénticas para todos los tipos):
- Exactamente 3 párrafos. El PRIMER PÁRRAFO debe ser breve (3-4 frases máximo) y servir de gancho.
- Sin bullets, sin títulos, sin presupuesto, sin emojis. Solo texto corrido en español de España.
- Separa párrafos con UNA línea en blanco.
- Devuelve SOLO el texto, sin preámbulos ni explicaciones.`;

const datosEmpresaBlock = (v: PromptVars) => `DATOS EMPRESA:
- Nombre: ${v.nombre}
- Sector: ${v.sector}${v.tamano ? `\n- Tamaño: ${v.tamano}` : ''}${v.historial ? `\n- Historial con Integra: ${v.historial}` : ''}${v.valores ? `\n- Valores RSC: ${v.valores}` : ''}${v.contexto ? `\n- Contexto: ${v.contexto}` : ''}`;

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
    label: 'Socios Compromiso Integra 2026',
    plantilla: '/plantilla-integra.docx',
    usaIA: true,
    campos: [],
    buildPrompt: (v) => {
      // Construir bloque de líneas con marcado obligatorio en el prompt
      const lineasBloque = v.lineas.length > 0
        ? v.lineas.map(l => `  - "${l}"`).join('\n')
        : '  - (colaboración general, sin líneas específicas)';

      return `Eres el equipo de alianzas de Fundación Integra, fundación española de inserción laboral de personas vulnerables. Redactas una PROPUESTA ESTRATÉGICA para que ${v.nombre} se convierta en socio de la Red Compromiso Integra 2026 — una red de empresas referentes que apuestan por el empleo socialmente responsable como parte de su estrategia ESG.

${datosEmpresaBlock(v)}

LÍNEAS DE COLABORACIÓN QUE DEBES INTEGRAR EN EL TEXTO (estas SON las líneas elegidas por el equipo; menciónalas TODAS y SIEMPRE entre **dobles asteriscos** con su frase canónica tal cual aparece aquí):
${lineasBloque}

REGLAS OBLIGATORIAS DE NEGRITAS (cumple TODAS):
1. Cada línea de arriba debe aparecer en el texto entre **dobles asteriscos**, idealmente en el segundo párrafo donde detalles la propuesta. Usa la frase tal cual, o una variante cercana, pero TODA la frase debe ir en negrita.
2. Si entre las líneas aparece "Reclutamiento e inserción laboral de personas vulnerables de manera ilimitada", debes incluir SIEMPRE el matiz "de manera ilimitada" dentro de las negritas — es un compromiso comercial que NO se negocia.
3. Además, pon en negrita el nombre de la empresa (${v.nombre}) la primera vez que aparezca, y 1-2 conceptos estratégicos clave del párrafo de cierre (ej: "alianza de largo plazo", "dimensión Social ESG", "CSRD"). MÁXIMO 6-7 negritas en total.

ENFOQUE ESTRATÉGICO (ESG avanzado + red de pares):
- Tono de alianza de largo plazo, no de proveedor-cliente. Hablamos entre iguales.
- Vocabulario estratégico: "alianza", "compromiso de largo plazo", "posicionamiento ESG", "capital reputacional", "liderazgo sectorial".
- Conecta explícitamente con la dimensión Social del ESG y con la CSRD/reportes de sostenibilidad.
- Menciona que la Red Compromiso Integra agrupa a empresas referentes del sector.
- Enmarca la inclusión laboral como ventaja competitiva, no como obligación.
- Cierre con visión 2026+: invitación a construir algo conjunto y medible.
- NO uses lenguaje de cumplimiento normativo.
${FORMATO_COMUN}`;
    },
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
      {
        key: 'fechaDocumento',
        label: 'Fecha del documento',
        tipo: 'text',
        obligatorio: true,
        placeholder: 'Ej: Febrero 2026',
        ayuda: 'Aparecerá en el pie de página. Mes y año en texto (ej: "Mayo 2026").',
        ancho: 'completo',
      },
    ],
  },
};

// ─── Lista ordenada para iterar en la UI ───
export const TIPOS_PROPUESTA_LIST: TipoPropuesta[] = [
  TIPOS_PROPUESTA.socios,
  TIPOS_PROPUESTA.lgd,
  TIPOS_PROPUESTA['empleo-sin-barreras'],
];