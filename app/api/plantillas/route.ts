// ═══════════════════════════════════════════════════════════════════════
// GET /api/plantillas  → manifest completo (estado del almacén)
// ═══════════════════════════════════════════════════════════════════════
// Lo consumen tanto el almacén (UI) como el resolver de las dos páginas
// generadoras (para saber qué URL viva usar por plantilla).
// Gate: cabecera 'x-app-password' (igual que /api/generar).
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { passwordValida, adminPasswordValida, passwordDeCabecera } from '@/lib/auth-server';
import { leerManifest } from '@/lib/plantillas-cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Leer el manifest lo permite cualquiera de las dos contraseñas: el resolver
  // de los generadores usa APP_PASSWORD; el almacén usa APP_ADMIN_PASSWORD.
  const p = passwordDeCabecera(request);
  if (!passwordValida(p) && !adminPasswordValida(p)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const manifest = await leerManifest();
    return NextResponse.json({ ok: true, manifest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}