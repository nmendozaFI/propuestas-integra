// ═══════════════════════════════════════════════════════════════════════
// ENLACES DE CONVENIO — cliente (navegador)
// ═══════════════════════════════════════════════════════════════════════
//
// Envoltorio de /api/enlaces para las pantallas internas. Hace dos cosas que si
// no habría que repetir en cada componente: poner la cabecera `x-app-password`
// (misma convención que lib/plantillas-cliente.ts) y devolver las fechas ya como
// `Date` en vez del texto ISO que viaja por JSON.
// ═══════════════════════════════════════════════════════════════════════

'use client';

import {
  deserializarEnlace,
  type EnlaceConvenio,
  type EnlaceSerializado,
} from '@/lib/enlaces-tipos';

const PASSWORD_STORAGE_KEY = 'integra_app_password';

function password(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
}

function cabeceras(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-app-password': password() };
}

/** Saca el mensaje que manda el servidor; si no hay, uno genérico con el código. */
async function mensajeDeError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  return j?.error || `El servidor respondió ${res.status}.`;
}

/** Crea un enlace de un solo uso y devuelve el registro con su token. */
export async function crearEnlace(datos: {
  codigo: string;
  fijados: Record<string, string>;
  nota?: string;
  diasValidez?: number;
}): Promise<EnlaceConvenio> {
  const res = await fetch('/api/enlaces', {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify(datos),
  });
  if (!res.ok) throw new Error(await mensajeDeError(res));
  const j = (await res.json()) as { enlace: EnlaceSerializado };
  return deserializarEnlace(j.enlace);
}

/** Todos los enlaces, el más reciente primero. */
export async function listarEnlaces(): Promise<EnlaceConvenio[]> {
  const res = await fetch('/api/enlaces', { headers: cabeceras(), cache: 'no-store' });
  if (!res.ok) throw new Error(await mensajeDeError(res));
  const j = (await res.json()) as { enlaces: EnlaceSerializado[] };
  return j.enlaces.map(deserializarEnlace);
}

/** Anula un enlace pendiente. `false` = ya no estaba pendiente. */
export async function anularEnlace(token: string): Promise<boolean> {
  const res = await fetch('/api/enlaces', {
    method: 'PATCH',
    headers: cabeceras(),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await mensajeDeError(res));
  const j = (await res.json()) as { anulado: boolean };
  return j.anulado;
}
