// ═══════════════════════════════════════════════════════════════════════
// REGISTRO UNIFICADO DE PLANTILLAS — las 13 del almacén
// ═══════════════════════════════════════════════════════════════════════
//
// Junta en una sola lista las plantillas de los dos generadores:
//   - 3 de propuestas (alianzas)  → desde TIPOS_PROPUESTA_LIST
//   - 10 de convenios             → desde TIPOS_CONVENIO
//
// Da a cada una un `plantillaId` estable y namespaced ('prop:socios',
// 'conv:SOC-01') del que se derivan:
//   - `flatId`       → 'prop__socios'  (para nombres de archivo)
//   - `publicIdBase` → 'integra/plantillas/prop__socios' (carpeta en Cloudinary)
//   - `rutaBundled`  → ruta del .docx en /public (seed + fallback)
//
// El almacén itera sobre PLANTILLAS_REGISTRO; el resolver de cada página usa
// `getPorRutaBundled` para, a partir del `tipo.plantilla` que ya conoce,
// localizar la entrada y decidir si hay override en Cloudinary.
// ═══════════════════════════════════════════════════════════════════════

import { TIPOS_PROPUESTA_LIST } from '@/lib/tipos-propuesta';
import { TIPOS_CONVENIO, GRUPOS_CONVENIO } from '@/lib/tipos-convenio';

export type OrigenPlantilla = 'propuesta' | 'convenio';

export type PlantillaRegistro = {
  plantillaId: string; // 'prop:socios' | 'conv:SOC-01'
  origen: OrigenPlantilla;
  codigo: string; // id/codigo original: 'socios' | 'SOC-01'
  label: string;
  grupoLabel: string; // para agrupar visualmente en el almacén
  rutaBundled: string; // ruta en /public (seed + fallback)
  flatId: string; // 'prop__socios'
  publicIdBase: string; // 'integra/plantillas/prop__socios'
};

// Carpeta raíz en Cloudinary. Las versiones colgarán de aquí:
//   integra/plantillas/<flatId>/v<N>.docx   (resource_type: 'raw')
const CARPETA_CLOUDINARY = 'integra/plantillas';

const flat = (plantillaId: string): string => plantillaId.replace(/:/g, '__');

function entrada(
  plantillaId: string,
  origen: OrigenPlantilla,
  codigo: string,
  label: string,
  grupoLabel: string,
  rutaBundled: string,
): PlantillaRegistro {
  // Carpeta legible en Cloudinary, espejo de /public:
  //   integra/plantillas/<propuestas|convenios>/<codigo>/vN.docx
  const carpeta = origen === 'propuesta' ? 'propuestas' : 'convenios';
  return {
    plantillaId,
    origen,
    codigo,
    label,
    grupoLabel,
    rutaBundled,
    flatId: flat(plantillaId), // se sigue usando para ids de DOM y nombres de descarga
    publicIdBase: `${CARPETA_CLOUDINARY}/${carpeta}/${codigo}`,
  };
}

function construirRegistro(): PlantillaRegistro[] {
  const props = TIPOS_PROPUESTA_LIST.map((t) =>
    entrada(`prop:${t.id}`, 'propuesta', t.id, t.label, 'Propuestas · alianzas', t.plantilla),
  );

  const convs = TIPOS_CONVENIO.filter((t) => !!t.plantilla).map((t) => {
    const g = GRUPOS_CONVENIO.find((x) => x.id === t.grupo);
    const grupoLabel = g ? `${g.emoji} ${g.label}` : 'Convenios';
    return entrada(`conv:${t.codigo}`, 'convenio', t.codigo, t.label, grupoLabel, t.plantilla!);
  });

  return [...props, ...convs];
}

export const PLANTILLAS_REGISTRO: PlantillaRegistro[] = construirRegistro();

export const getPlantillaRegistro = (plantillaId: string): PlantillaRegistro | undefined =>
  PLANTILLAS_REGISTRO.find((p) => p.plantillaId === plantillaId);

// Resolver inverso: de la ruta de /public (lo que las páginas ya conocen como
// `tipo.plantilla`) a su entrada del registro. Es la pieza que permite cablear
// las páginas sin cambiar sus `tipos-*.ts`.
export const getPorRutaBundled = (rutaBundled: string): PlantillaRegistro | undefined =>
  PLANTILLAS_REGISTRO.find((p) => p.rutaBundled === rutaBundled);

// Agrupación lista para pintar el almacén (respeta el orden del registro).
export function plantillasPorGrupo(): { grupo: string; items: PlantillaRegistro[] }[] {
  const orden: string[] = [];
  const mapa = new Map<string, PlantillaRegistro[]>();
  for (const p of PLANTILLAS_REGISTRO) {
    if (!mapa.has(p.grupoLabel)) {
      mapa.set(p.grupoLabel, []);
      orden.push(p.grupoLabel);
    }
    mapa.get(p.grupoLabel)!.push(p);
  }
  return orden.map((grupo) => ({ grupo, items: mapa.get(grupo)! }));
}