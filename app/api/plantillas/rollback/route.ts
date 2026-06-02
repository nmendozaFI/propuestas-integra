// ═══════════════════════════════════════════════════════════════════════
// POST /api/plantillas/rollback   (JSON)
// ═══════════════════════════════════════════════════════════════════════
// Body: { password, plantillaId, v }   → pone 'actual' = v (debe existir).
// Volver a una versión previa = cambiar el puntero. No borra nada; el historial
// se conserva intacto. Pasar v = null vuelve al seed de /public.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminPasswordValida } from '@/lib/auth-server';
import { getPlantillaRegistro } from '@/lib/plantillas-registro';
import { leerManifest, guardarManifest } from '@/lib/plantillas-cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { password?: string; plantillaId?: string; v?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  if (!adminPasswordValida(body.password)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const plantillaId = String(body.plantillaId || '');
  if (!getPlantillaRegistro(plantillaId)) {
    return NextResponse.json({ ok: false, error: `Plantilla desconocida: ${plantillaId}` }, { status: 400 });
  }

  try {
    const manifest = await leerManifest();
    const entrada = manifest.plantillas[plantillaId];
    if (!entrada) {
      return NextResponse.json({ ok: false, error: 'Esta plantilla no tiene versiones subidas' }, { status: 404 });
    }

    const destino = body.v ?? null; // null = volver al seed de /public
    if (destino !== null && !entrada.versiones.some((x) => x.v === destino)) {
      return NextResponse.json({ ok: false, error: `La versión ${destino} no existe` }, { status: 404 });
    }

    entrada.actual = destino;
    manifest.plantillas[plantillaId] = entrada;
    await guardarManifest(manifest);

    return NextResponse.json({ ok: true, actual: destino, entrada });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}