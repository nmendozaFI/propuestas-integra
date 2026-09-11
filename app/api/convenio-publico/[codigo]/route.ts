// ═══════════════════════════════════════════════════════════════════════
// GET /api/convenio-publico/[codigo]  → URL de la versión viva de UN convenio
// ═══════════════════════════════════════════════════════════════════════
//
// Ruta PÚBLICA (sin contraseña) para la página /convenio/[codigo]. Devuelve
// solo la URL de entrega de la versión viva de ESE convenio:
//   - el secureUrl de Cloudinary si hay override en el manifest, o
//   - el seed de /public (/convenios/<CODIGO>.docx) si no.
//
// NO expone el manifest completo ni ninguna otra plantilla, y SOLO resuelve
// convenios (nunca propuestas): el código se valida contra TIPOS_CONVENIO.
//
// CACHÉ: leerManifest() usa la Admin API de Cloudinary, con cupo por hora. Para
// no agotarlo desde un endpoint público (lo que además rompería el almacén),
// la respuesta se cachea en el CDN 60 s (stale-while-revalidate 300 s). Una
// versión recién subida puede tardar hasta ~1 min en llegar al enlace público.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import { getPlantillaRegistro } from '@/lib/plantillas-registro';
import { leerManifest } from '@/lib/plantillas-cloudinary';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo: raw } = await params;
  const codigo = (raw || '').toUpperCase();

  // Solo convenios normalizados. Cualquier otro código → 404.
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.plantilla) {
    return NextResponse.json({ ok: false, error: 'Convenio no encontrado' }, { status: 404 });
  }

  const reg = getPlantillaRegistro(`conv:${codigo}`);
  const seedUrl = tipo.plantilla; // ruta relativa en /public (fallback)

  // Sin entrada en el registro (no debería pasar): devolver el seed.
  if (!reg) {
    return NextResponse.json({ ok: true, url: seedUrl }, { headers: CACHE_HEADERS });
  }

  try {
    const manifest = await leerManifest();
    const entrada = manifest.plantillas[reg.plantillaId];
    if (entrada?.actual) {
      const viva = entrada.versiones.find((x) => x.v === entrada.actual);
      if (viva?.secureUrl) {
        return NextResponse.json({ ok: true, url: viva.secureUrl }, { headers: CACHE_HEADERS });
      }
    }
  } catch {
    // Cloudinary caído / sin configurar → degradación elegante: seed.
  }

  return NextResponse.json({ ok: true, url: seedUrl }, { headers: CACHE_HEADERS });
}
