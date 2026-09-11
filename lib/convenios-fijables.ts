// ═══════════════════════════════════════════════════════════════════════
// CAMPOS FIJABLES POR LA FUNDACIÓN (por grupo de convenio)
// ═══════════════════════════════════════════════════════════════════════
//
// Subconjunto curado de campos que el equipo suele fijar al enviar el enlace a
// la empresa. Viajan como query params (nombre = key del campo) a /convenio/[codigo]
// y la empresa los ve de solo lectura. El mecanismo de la ruta pública acepta
// CUALQUIER campo por query param; esta lista solo decide qué se ofrece en el
// panel "Copiar enlace" de la ruta interna.
// ═══════════════════════════════════════════════════════════════════════

import {
  getTipoConvenio,
  type CampoConfig,
  type GrupoConvenioId,
} from '@/lib/tipos-convenio';

export const CAMPOS_FIJABLES_POR_GRUPO: Record<GrupoConvenioId, string[]> = {
  socio: ['importe'],
  patrono: ['importe'],
  lgd: ['importe', 'plazoAnios'],
  venta: ['importe', 'producto', 'periodoInicio', 'periodoFin', 'nombreProyecto'],
  proyecto: ['importe', 'nombreProyecto'],
  entidad: [],
};

/** Campos (en orden) que la Fundación puede fijar para un convenio concreto. */
export function camposFijables(codigo: string): CampoConfig[] {
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.campos) return [];
  const keys = CAMPOS_FIJABLES_POR_GRUPO[tipo.grupo] || [];
  const porKey = new Map(tipo.campos.map((c) => [c.key, c] as const));
  return keys
    .map((k) => porKey.get(k))
    .filter((c): c is CampoConfig => Boolean(c));
}
