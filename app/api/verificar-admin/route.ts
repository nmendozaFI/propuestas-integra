// ═══════════════════════════════════════════════════════════════════════
// POST /api/verificar-admin  → comprueba APP_ADMIN_PASSWORD
// ═══════════════════════════════════════════════════════════════════════
// Espejo de /api/verificar pero para el acceso al almacén (/plantillas).
// La página NO guarda esta contraseña: la pide en cada visita.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminPasswordValida } from '@/lib/auth-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!process.env.APP_ADMIN_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: 'Servidor sin contraseña de administración configurada' },
      { status: 500 },
    );
  }
  if (adminPasswordValida(body.password)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}