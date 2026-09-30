// ═══════════════════════════════════════════════════════════════════════
// /api/enlaces  → crear, listar y anular enlaces de convenio (INTERNO)
// ═══════════════════════════════════════════════════════════════════════
//
// Protegido con la contraseña del equipo (misma puerta que el resto del área
// interna: cabecera `x-app-password`, ver lib/auth-server.ts). La ruta pública
// que consume el token es otra (/convenio/t/[token]) y no pasa por aquí.
//
//   POST   → crea un enlace y devuelve el registro (con su token)
//   GET    → lista los enlaces para la pantalla de seguimiento
//   PATCH  → anula un enlace pendiente
//
// Aquí NO hay SQL: todo pasa por lib/enlaces-repo.ts. Esta capa solo valida la
// entrada, traduce a los tipos del dominio y da códigos HTTP.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { passwordDeCabecera, passwordValida } from '@/lib/auth-server';
import { hayBaseDeDatos } from '@/lib/db';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import {
  anularEnlace,
  crearEnlace,
  listarEnlaces,
} from '@/lib/enlaces-repo';
import {
  DIAS_VALIDEZ_POR_DEFECTO,
  serializarEnlace,
} from '@/lib/enlaces-tipos';

export const runtime = 'nodejs';

/** Puerta común de los tres métodos. Devuelve la respuesta de error, o null si pasa. */
function comprobarAcceso(req: NextRequest): NextResponse | null {
  if (!passwordValida(passwordDeCabecera(req))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!hayBaseDeDatos()) {
    return NextResponse.json(
      {
        error:
          'La base de datos de enlaces no está configurada en este entorno (falta DATABASE_URL).',
      },
      { status: 503 },
    );
  }
  return null;
}

/** Convierte cualquier error del repositorio en un 500 con el detalle en los logs. */
function fallo(accion: string, err: unknown): NextResponse {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[api/enlaces] ${accion}: ${msg}`);
  return NextResponse.json(
    { error: 'No se ha podido completar la operación. Inténtalo de nuevo.' },
    { status: 500 },
  );
}

// ─── POST · crear ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const denegado = comprobarAcceso(req);
  if (denegado) return denegado;

  let cuerpo: {
    codigo?: unknown;
    fijados?: unknown;
    nota?: unknown;
    diasValidez?: unknown;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }

  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo.toUpperCase() : '';
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.campos) {
    return NextResponse.json({ error: 'Convenio desconocido.' }, { status: 400 });
  }

  // Solo se aceptan campos que existan de verdad en esta plantilla. Así un enlace
  // no puede acabar guardando basura que luego el formulario ignore en silencio.
  const keysValidas = new Set(tipo.campos.map((c) => c.key));
  const fijados: Record<string, string> = {};
  if (cuerpo.fijados && typeof cuerpo.fijados === 'object' && !Array.isArray(cuerpo.fijados)) {
    for (const [k, v] of Object.entries(cuerpo.fijados as Record<string, unknown>)) {
      if (!keysValidas.has(k)) continue;
      if (typeof v === 'string' && v.trim()) fijados[k] = v.trim();
    }
  }

  const nota = typeof cuerpo.nota === 'string' ? cuerpo.nota.trim().slice(0, 200) : '';
  const dias =
    typeof cuerpo.diasValidez === 'number' && Number.isFinite(cuerpo.diasValidez)
      ? Math.min(Math.max(Math.round(cuerpo.diasValidez), 1), 365)
      : DIAS_VALIDEZ_POR_DEFECTO;

  try {
    const enlace = await crearEnlace({ codigo, fijados, nota: nota || null, diasValidez: dias });
    return NextResponse.json({ ok: true, enlace: serializarEnlace(enlace) });
  } catch (err) {
    return fallo('crear', err);
  }
}

// ─── GET · listar ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const denegado = comprobarAcceso(req);
  if (denegado) return denegado;

  try {
    const enlaces = await listarEnlaces();
    return NextResponse.json({ ok: true, enlaces: enlaces.map(serializarEnlace) });
  } catch (err) {
    return fallo('listar', err);
  }
}

// ─── PATCH · anular ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const denegado = comprobarAcceso(req);
  if (denegado) return denegado;

  let token = '';
  try {
    const cuerpo = (await req.json()) as { token?: unknown };
    if (typeof cuerpo.token === 'string') token = cuerpo.token;
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: 'Falta el token.' }, { status: 400 });
  }

  try {
    const anulado = await anularEnlace(token);
    // false = ya no estaba pendiente (usado o anulado antes). No es un error del
    // servidor; la pantalla lo resuelve recargando la lista.
    return NextResponse.json({ ok: true, anulado });
  } catch (err) {
    return fallo('anular', err);
  }
}
