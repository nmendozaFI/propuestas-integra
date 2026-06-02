// ═══════════════════════════════════════════════════════════════════════
// TIPOS DEL MANIFEST — módulo neutro (sin 'server-only', sin side-effects)
// ═══════════════════════════════════════════════════════════════════════
// Vive aparte para que tanto el servidor (plantillas-cloudinary.ts) como el
// cliente (resolver y almacén) puedan importar estos tipos sin arrastrar el
// SDK de Cloudinary ni 'server-only'.
// ═══════════════════════════════════════════════════════════════════════

export type VersionPlantilla = {
  v: string; // 'v3'
  publicId: string; // 'integra/plantillas/conv__SOC-01/v3.docx'
  secureUrl: string; // URL de entrega (versión inmutable, lista para fetch)
  bytes: number;
  fecha: string; // ISO
  nota: string; // texto libre de quien sube (no hay identidad real, solo password compartida)
  placeholders: string[]; // tokens sustituibles de esta versión
  requiereAjusteForm: string[]; // placeholders nuevos respecto a la versión previa → tocar formulario
};

export type EntradaManifest = {
  actual: string | null; // 'v3' | null (= aún sin override, usar el seed de /public)
  versiones: VersionPlantilla[];
};

export type Manifest = {
  schema: 1;
  actualizado: string;
  plantillas: Record<string, EntradaManifest>;
};