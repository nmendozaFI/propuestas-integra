// ═══════════════════════════════════════════════════════════════════════
// TIPOS DE CONVENIO — fuente única de verdad (paralela a tipos-propuesta.ts)
// ═══════════════════════════════════════════════════════════════════════
//
// Misma filosofía que las propuestas ("tipos como datos"), pero para CONVENIOS:
//   - Ninguno usa IA: son plantillas que se rellenan con datos del formulario.
//   - Se organizan en GRUPOS (Socio, Empresa/Patrono, LGD, Venta, Proyecto,
//     Entidad colaboradora). La UI muestra primero el grupo y luego sus
//     plantillas (1 o 2 por grupo).
//
// AÑADIR UN CONVENIO NUEVO (cuando se normalice su .docx):
//   1. Sube la plantilla a /public/convenios/<CODIGO>.docx con sus placeholders.
//   2. Sustituye `proximamente: true` por `plantilla` + `campos`.
//   3. Listo. El navegador (grupo → plantilla → formulario) lo recoge solo.
//
// CONVENCIÓN DE PLACEHOLDERS (igual que en propuestas):
//   El `key` camelCase del campo se convierte a {{SNAKE_CASE}} en mayúsculas.
//   Ej: `nombreEmpresa` → {{NOMBRE_EMPRESA}}, `nifRepresentante` → {{NIF_REPRESENTANTE}}.
//   Especiales: {{IMPORTE_LETRAS}} se genera solo desde {{IMPORTE}}; {{LOGO}} va al header.
// ═══════════════════════════════════════════════════════════════════════

import type { CampoConfig } from '@/lib/tipos-propuesta';

export type { CampoConfig };

// ─── Grupos ───
export type GrupoConvenioId =
  | 'socio'
  | 'patrono'
  | 'lgd'
  | 'venta'
  | 'proyecto'
  | 'entidad';

export type GrupoConvenio = {
  id: GrupoConvenioId;
  label: string;
  emoji: string;
};

export const GRUPOS_CONVENIO: GrupoConvenio[] = [
  { id: 'socio', label: 'Socio', emoji: '🤝' },
  { id: 'patrono', label: 'Empresa / Patrono', emoji: '🏢' },
  { id: 'lgd', label: 'LGD', emoji: '♿' },
  { id: 'venta', label: 'Venta de productos', emoji: '📦' },
  { id: 'proyecto', label: 'Proyecto', emoji: '📁' },
  { id: 'entidad', label: 'Entidad colaboradora', emoji: '🤝' },
];

// ─── Un tipo de convenio ───
export type TipoConvenio = {
  codigo: string; // 'SOC-01'
  grupo: GrupoConvenioId;
  label: string;
  plantilla?: string; // ruta en /public (solo si está normalizada)
  campos?: CampoConfig[]; // declaración del formulario
  proximamente?: boolean; // true mientras no se haya normalizado el .docx
};

// ═══════════════════════════════════════════════════════════════════════
// CAMPOS REUTILIZABLES
// ═══════════════════════════════════════════════════════════════════════
const CAMPO_NOMBRE_EMPRESA: CampoConfig = {
  key: 'nombreEmpresa',
  label: 'Nombre / razón social',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Acme Soluciones, S.L.',
};

const CAMPO_CIF: CampoConfig = {
  key: 'cifEmpresa',
  label: 'CIF',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: B-12345678',
};

const CAMPO_DOMICILIO: CampoConfig = {
  key: 'domicilioEmpresa',
  label: 'Domicilio social',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Calle Mayor 1, 28013 Madrid',
  ancho: 'completo',
};

const CAMPO_COD_POSTAL: CampoConfig = {
  key: 'codPostal', // → {{COD_POSTAL}}
  label: 'Código postal',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 28013',
};

const CAMPO_CIUDAD_FIRMA: CampoConfig = {
  // OJO: el key es 'cuidadFirma' a propósito, para casar con el placeholder
  // {{CUIDAD_FIRMA}} tal cual está escrito en las plantillas. Si algún día
  // corriges el .docx a {{CIUDAD_FIRMA}}, renombra también este key a 'ciudadFirma'.
  key: 'cuidadFirma',
  label: 'Ciudad',
  tipo: 'text',
  placeholder: 'Ej: Madrid',
  ayuda: 'Si lo dejas vacío, se usa el lugar de firma.',
};

const CAMPO_REPRESENTANTE: CampoConfig = {
  key: 'representante',
  label: 'Representante (firmante)',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Juan Pérez García',
};

const CAMPO_NIF_REP: CampoConfig = {
  key: 'nifRepresentante',
  label: 'NIF del representante',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 12345678Z',
};

const CAMPO_CARGO: CampoConfig = {
  key: 'cargo',
  label: 'Cargo del representante',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Director General',
};

const CAMPO_IMPORTE: CampoConfig = {
  key: 'importe',
  label: 'Importe de la donación (€)',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 10.800',
  ayuda: 'En cifras. El € y el importe en letras se añaden automáticamente.',
};

const CAMPO_LUGAR_FIRMA: CampoConfig = {
  key: 'lugarFirma',
  label: 'Lugar de firma',
  tipo: 'text',
  placeholder: 'Ej: Madrid',
};

const CAMPO_FECHA_FIRMA: CampoConfig = {
  key: 'fechaFirma',
  label: 'Fecha de firma',
  tipo: 'text',
  placeholder: 'Ej: 1 de junio de 2026',
  ayuda: 'Por defecto la fecha de hoy. Texto libre.',
  ancho: 'completo',
};

// Conjunto de campos de los convenios de adhesión de socios (SOC-01 y SOC-02
// comparten exactamente la misma ficha de datos).
const CAMPOS_ADHESION_SOCIOS: CampoConfig[] = [
  CAMPO_NOMBRE_EMPRESA,
  CAMPO_CIF,
  CAMPO_DOMICILIO,
  CAMPO_COD_POSTAL,
  CAMPO_CIUDAD_FIRMA,
  CAMPO_REPRESENTANTE,
  CAMPO_NIF_REP,
  CAMPO_CARGO,
  CAMPO_IMPORTE,
  CAMPO_LUGAR_FIRMA,
  CAMPO_FECHA_FIRMA,
];

// ─── Campos propios de los convenios de COLABORACIÓN (entidad ↔ entidad) ───
// Reutilizan representante, cargo, lugar y fecha de firma; añaden los suyos.
const CAMPO_NOMBRE_ENTIDAD: CampoConfig = {
  key: 'nombreEntidad', // → {{NOMBRE_ENTIDAD}}
  label: 'Nombre de la entidad',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Asociación Manos Unidas',
};

const CAMPO_CIF_ENTIDAD: CampoConfig = {
  key: 'cifEntidad', // → {{CIF_ENTIDAD}}
  label: 'CIF de la entidad',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: G-12345678',
};

const CAMPO_DOMICILIO_ENTIDAD: CampoConfig = {
  key: 'domicilioEntidad', // → {{DOMICILIO_ENTIDAD}}
  label: 'Domicilio social',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Calle Sol 5, 28004 Madrid',
  ancho: 'completo',
};

const CAMPO_NUMERO_REGISTRO: CampoConfig = {
  key: 'numeroRegistro', // → {{NUMERO_REGISTRO}}
  label: 'Nº Registro de Fundaciones',
  tipo: 'text',
  placeholder: 'Ej: 1234',
};

const CAMPO_DNI_REP: CampoConfig = {
  key: 'dniRepresentante', // → {{DNI_REPRESENTANTE}}
  label: 'DNI del representante',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 12345678Z',
};

const CAMPO_FINALIDAD: CampoConfig = {
  key: 'finalidad', // → {{FINALIDAD}}
  label: 'Finalidad / objeto de la entidad',
  tipo: 'textarea',
  obligatorio: true,
  placeholder: 'Ej: promover la inserción laboral de jóvenes en riesgo de exclusión',
  ayuda: 'Completa la frase “…tiene la finalidad de …”.',
  ancho: 'completo',
};

const CAMPO_EMAIL_DPO: CampoConfig = {
  key: 'emailDpo', // → {{EMAIL_DPO}}
  label: 'Email del Delegado de Protección de Datos',
  tipo: 'text',
  placeholder: 'Ej: dpo@entidad.org',
};

// ENT-01 y ENT-02 comparten la misma ficha (solo difieren en una cláusula fija).
const CAMPOS_COLABORACION: CampoConfig[] = [
  CAMPO_NOMBRE_ENTIDAD,
  CAMPO_CIF_ENTIDAD,
  CAMPO_DOMICILIO_ENTIDAD,
  CAMPO_NUMERO_REGISTRO,
  CAMPO_REPRESENTANTE, // reutilizado
  CAMPO_DNI_REP,
  CAMPO_CARGO, // reutilizado
  CAMPO_FINALIDAD,
  CAMPO_EMAIL_DPO,
  CAMPO_LUGAR_FIRMA, // reutilizado
  CAMPO_FECHA_FIRMA, // reutilizado
];

// ─── Campos propios de los acuerdos de DONACIÓN (LGD y proyecto) ───
const CAMPO_NIF_EMPRESA: CampoConfig = {
  key: 'nifEmpresa', // → {{NIF_EMPRESA}}
  label: 'NIF de la empresa',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: B-12345678',
};

const CAMPO_ACTIVIDAD: CampoConfig = {
  key: 'actividadPrincipal', // → {{ACTIVIDAD_PRINCIPAL}}
  label: 'Actividad principal de la empresa',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: la consultoría tecnológica',
  ayuda: 'Completa la frase “…cuya actividad principal consiste en …”.',
  ancho: 'completo',
};

const CAMPO_PLAZO_ANIOS: CampoConfig = {
  key: 'plazoAnios', // → {{PLAZO_ANIOS}}
  label: 'Plazo de vigencia',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: dos (2) años',
};

const CAMPO_NOMBRE_PROYECTO: CampoConfig = {
  key: 'nombreProyecto', // → {{NOMBRE_PROYECTO}}
  label: 'Nombre del proyecto',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Empleo Sin Barreras 2026',
  ancho: 'completo',
};

// LGD-01 (preacuerdo) y LGD-02 (acuerdo) comparten ficha. Los datos de la
// escritura de poder NO son campos: quedan como hueco en blanco en el Word.
const CAMPOS_DONACION_LGD: CampoConfig[] = [
  CAMPO_NOMBRE_EMPRESA,
  CAMPO_NIF_EMPRESA,
  CAMPO_DOMICILIO, // reutilizado
  CAMPO_REPRESENTANTE, // reutilizado
  CAMPO_DNI_REP, // reutilizado
  CAMPO_CARGO, // reutilizado
  CAMPO_ACTIVIDAD,
  CAMPO_PLAZO_ANIOS,
  CAMPO_EMAIL_DPO, // reutilizado
  CAMPO_IMPORTE, // reutilizado
  CAMPO_LUGAR_FIRMA, // reutilizado
  CAMPO_FECHA_FIRMA, // reutilizado
];

// PRO-01. Los datos registrales (registrada como, fecha de constitución, nº de
// inscripción, registro) NO son campos: quedan como hueco en blanco en el Word.
const CAMPOS_DONACION_PROYECTO: CampoConfig[] = [
  CAMPO_NOMBRE_EMPRESA,
  CAMPO_NIF_EMPRESA,
  CAMPO_DOMICILIO, // reutilizado
  CAMPO_REPRESENTANTE, // reutilizado
  CAMPO_DNI_REP, // reutilizado
  CAMPO_CARGO, // reutilizado
  CAMPO_ACTIVIDAD,
  CAMPO_NOMBRE_PROYECTO,
  CAMPO_IMPORTE, // reutilizado
  CAMPO_LUGAR_FIRMA, // reutilizado
  CAMPO_FECHA_FIRMA, // reutilizado
];

// ─── Campos propios de los convenios de DONACIÓN POR VENTA de productos ───
const CAMPO_PRODUCTO: CampoConfig = {
  key: 'producto', // → {{PRODUCTO}}
  label: 'Producto cuya venta genera la donación',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: Camiseta solidaria',
};

const CAMPO_APORTACION_UD: CampoConfig = {
  key: 'importe', // → {{IMPORTE}} (aquí se interpreta como €/unidad)
  label: 'Aportación por unidad vendida (€/ud)',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 0,50',
};

const CAMPO_PERIODO_INICIO: CampoConfig = {
  key: 'periodoInicio', // → {{PERIODO_INICIO}}
  label: 'Inicio del período de venta',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 1 de enero de 2026',
};

const CAMPO_PERIODO_FIN: CampoConfig = {
  key: 'periodoFin', // → {{PERIODO_FIN}}
  label: 'Fin del período de venta',
  tipo: 'text',
  obligatorio: true,
  placeholder: 'Ej: 31 de diciembre de 2026',
};

// VEN-01 y VEN-02 comparten ficha (difieren solo en el título y una cláusula fija).
// El Anexo I (descripción del proyecto) se adjunta aparte; el documento solo lo referencia.
const CAMPOS_DONACION_VENTA: CampoConfig[] = [
  CAMPO_NOMBRE_EMPRESA,
  CAMPO_CIF, // reutilizado
  CAMPO_DOMICILIO, // reutilizado
  CAMPO_ACTIVIDAD, // reutilizado (LGD/PRO)
  CAMPO_REPRESENTANTE, // reutilizado
  CAMPO_NIF_REP, // reutilizado
  CAMPO_CARGO, // reutilizado
  CAMPO_PRODUCTO,
  CAMPO_APORTACION_UD,
  CAMPO_NOMBRE_PROYECTO, // reutilizado (PRO)
  CAMPO_PERIODO_INICIO,
  CAMPO_PERIODO_FIN,
  CAMPO_COD_POSTAL, // reutilizado (tabla declaración)
  CAMPO_CIUDAD_FIRMA, // reutilizado (tabla declaración)
  CAMPO_LUGAR_FIRMA, // reutilizado
  CAMPO_FECHA_FIRMA, // reutilizado
];

// ═══════════════════════════════════════════════════════════════════════
// REGISTRO DE TIPOS (orden = orden de catálogo)
// ═══════════════════════════════════════════════════════════════════════
export const TIPOS_CONVENIO: TipoConvenio[] = [
  // ── Socio (normalizados) ──
  {
    codigo: 'SOC-01',
    grupo: 'socio',
    label: 'Convenio donación socios',
    plantilla: '/convenios/SOC-01.docx',
    campos: CAMPOS_ADHESION_SOCIOS,
  },
  {
    codigo: 'SOC-02',
    grupo: 'socio',
    label: 'Justificante liberalidad socios',
    plantilla: '/convenios/SOC-02.docx',
    campos: CAMPOS_ADHESION_SOCIOS,
  },

  // ── Resto de grupos: pendientes de normalizar (.docx) ──
  {
    codigo: 'PAT-01',
    grupo: 'patrono',
    label: 'Acuerdo donación patronos',
    plantilla: '/convenios/PAT-01.docx',
    campos: CAMPOS_ADHESION_SOCIOS, // misma ficha que socios
  },
  { codigo: 'LGD-01', grupo: 'lgd', label: 'Preacuerdo donación LGD', plantilla: '/convenios/LGD-01.docx', campos: CAMPOS_DONACION_LGD },
  { codigo: 'LGD-02', grupo: 'lgd', label: 'Acuerdo donación LGD', plantilla: '/convenios/LGD-02.docx', campos: CAMPOS_DONACION_LGD },
  { codigo: 'VEN-01', grupo: 'venta', label: 'Convenio donación venta productos', plantilla: '/convenios/VEN-01.docx', campos: CAMPOS_DONACION_VENTA },
  { codigo: 'VEN-02', grupo: 'venta', label: 'Justificante liberalidad venta productos', plantilla: '/convenios/VEN-02.docx', campos: CAMPOS_DONACION_VENTA },
  { codigo: 'PRO-01', grupo: 'proyecto', label: 'Acuerdo donación proyectos', plantilla: '/convenios/PRO-01.docx', campos: CAMPOS_DONACION_PROYECTO },
  {
    codigo: 'ENT-01',
    grupo: 'entidad',
    label: 'Convenio colaboración inicial',
    plantilla: '/convenios/ENT-01.docx',
    campos: CAMPOS_COLABORACION,
  },
  {
    codigo: 'ENT-02',
    grupo: 'entidad',
    label: 'Convenio colaboración existente',
    plantilla: '/convenios/ENT-02.docx',
    campos: CAMPOS_COLABORACION,
  },
];

// ─── Helpers para la UI ───
export const tiposDeGrupo = (g: GrupoConvenioId): TipoConvenio[] =>
  TIPOS_CONVENIO.filter((t) => t.grupo === g);

export const getTipoConvenio = (codigo: string): TipoConvenio | undefined =>
  TIPOS_CONVENIO.find((t) => t.codigo === codigo);

export const contarDisponibles = (g: GrupoConvenioId): number =>
  tiposDeGrupo(g).filter((t) => !t.proximamente).length;