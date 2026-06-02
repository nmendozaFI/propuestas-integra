// ═══════════════════════════════════════════════════════════════════════
// RESOLVER DE PLANTILLAS (cliente)
// ═══════════════════════════════════════════════════════════════════════
//
// `cargarPlantillaBytes(rutaBundled)` es el sustituto directo del viejo
// `fetch(ruta) → arrayBuffer` de las dos páginas generadoras. Decide la fuente:
//   - versión viva en Cloudinary (según el manifest), si la hay
//   - el seed de /public (rutaBundled) si no hay override
//
// DEGRADACIÓN ELEGANTE: si el manifest no se puede leer (backend caído,
// Cloudinary sin configurar, sesión sin password…), cae al seed. La app nunca
// deja de funcionar por culpa del almacén.
//
// El manifest se cachea en memoria durante la sesión; `invalidarManifest()` lo
// fuerza a recargarse (lo llama el almacén tras subir o hacer rollback).
// ═══════════════════════════════════════════════════════════════════════

'use client';

import { getPorRutaBundled } from '@/lib/plantillas-registro';
import type { Manifest } from '@/lib/plantillas-tipos';

const PASSWORD_STORAGE_KEY = 'integra_app_password';

let manifestCache: Manifest | null = null;
let manifestPromesa: Promise<Manifest | null> | null = null;

function password(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
}

export async function cargarManifest(forzar = false, passwordOverride?: string): Promise<Manifest | null> {
  if (!forzar && manifestCache) return manifestCache;
  if (!forzar && manifestPromesa) return manifestPromesa;
  const pwd = passwordOverride ?? password();
  manifestPromesa = (async (): Promise<Manifest | null> => {
    try {
      const res = await fetch('/api/plantillas', {
        headers: { 'x-app-password': pwd },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { ok: boolean; manifest?: Manifest };
      manifestCache = data.manifest ?? null;
      return manifestCache;
    } catch {
      return null;
    } finally {
      manifestPromesa = null;
    }
  })();
  return manifestPromesa;
}

export function invalidarManifest(): void {
  manifestCache = null;
}

/** URL de entrega de la versión viva de una plantilla, o null si toca usar el seed. */
export function urlViva(manifest: Manifest | null, rutaBundled: string): string | null {
  if (!manifest) return null;
  const reg = getPorRutaBundled(rutaBundled);
  if (!reg) return null;
  const entrada = manifest.plantillas[reg.plantillaId];
  if (!entrada || !entrada.actual) return null;
  const viva = entrada.versiones.find((x) => x.v === entrada.actual);
  return viva ? viva.secureUrl : null;
}

/**
 * Bytes de la plantilla que toca usar AHORA. Sustituye al viejo
 * `const res = await fetch(ruta); new Uint8Array(await res.arrayBuffer())`.
 */
export async function cargarPlantillaBytes(rutaBundled: string, passwordOverride?: string): Promise<Uint8Array> {
  const manifest = await cargarManifest(false, passwordOverride);
  const url = urlViva(manifest, rutaBundled) ?? rutaBundled;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla (${url}): HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}