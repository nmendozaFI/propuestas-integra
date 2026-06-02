// ═══════════════════════════════════════════════════════════════════════
// CLOUDINARY + MANIFEST (solo servidor)
// ═══════════════════════════════════════════════════════════════════════
//
// Guarda las versiones de cada plantilla como recursos `raw` en Cloudinary:
//   integra/plantillas/<flatId>/v<N>.docx
// (para `raw`, el public_id DEBE incluir la extensión .docx).
//
// El "qué versión está viva" + el historial viven en un manifest JSON, también
// como recurso raw:  integra/plantillas/_manifest.json
//
// El versionado da el rollback casi gratis: "actual" es solo un puntero; volver
// a una versión previa = cambiar ese puntero y reescribir el manifest.
//
// Requiere la dependencia oficial:  pnpm add cloudinary
// Lee la config de CLOUDINARY_URL (cloud_name + key + secret) automáticamente.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only';
import {
  v2 as cloudinary,
  type UploadApiResponse,
  type UploadApiErrorResponse,
} from 'cloudinary';
import type { Manifest, EntradaManifest } from '@/lib/plantillas-tipos';

// Reexportamos los tipos para que las rutas los sigan importando desde aquí.
export type { Manifest, EntradaManifest, VersionPlantilla } from '@/lib/plantillas-tipos';

cloudinary.config({ secure: true }); // el resto lo toma de CLOUDINARY_URL

const MANIFEST_PUBLIC_ID = 'integra/plantillas/_manifest.json';

export const manifestVacio = (): Manifest => ({
  schema: 1,
  actualizado: new Date().toISOString(),
  plantillas: {},
});

// ─── Leer manifest: Admin API → URL versionada → fetch (sin problemas de caché) ───
export async function leerManifest(): Promise<Manifest> {
  let url: string;
  try {
    const r = (await cloudinary.api.resource(MANIFEST_PUBLIC_ID, {
      resource_type: 'raw',
    })) as { secure_url?: string };
    if (!r.secure_url) return manifestVacio();
    url = r.secure_url;
  } catch {
    return manifestVacio(); // aún no existe
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return manifestVacio();
  try {
    return (await res.json()) as Manifest;
  } catch {
    return manifestVacio();
  }
}

// ─── Guardar manifest (overwrite + invalidate sobre id fijo) ───
export async function guardarManifest(m: Manifest): Promise<void> {
  m.actualizado = new Date().toISOString();
  const json = JSON.stringify(m, null, 2);
  const dataUri = `data:application/json;base64,${Buffer.from(json, 'utf8').toString('base64')}`;
  await cloudinary.uploader.upload(dataUri, {
    resource_type: 'raw',
    public_id: MANIFEST_PUBLIC_ID,
    overwrite: true,
    invalidate: true,
  });
}

// ─── Subir una versión nueva (raw, public_id con extensión .docx) ───
export async function subirVersionRaw(opts: {
  publicIdBase: string; // 'integra/plantillas/conv__SOC-01'
  v: string; // 'v3'
  bytes: Buffer;
}): Promise<{ publicId: string; secureUrl: string; bytes: number }> {
  const publicId = `${opts.publicIdBase}/${opts.v}.docx`;
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', public_id: publicId, overwrite: false },
      (err: UploadApiErrorResponse | undefined, res: UploadApiResponse | undefined) => {
        if (err || !res) reject(err || new Error('Cloudinary no devolvió respuesta'));
        else resolve(res);
      },
    );
    stream.end(opts.bytes);
  });
  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    bytes: result.bytes ?? opts.bytes.length,
  };
}

// ─── Siguiente número de versión para una entrada ───
export function siguienteV(entrada: EntradaManifest | undefined): string {
  const nums = (entrada?.versiones ?? [])
    .map((x) => parseInt(x.v.replace(/^v/, ''), 10))
    .filter((n) => Number.isFinite(n));
  return `v${(nums.length ? Math.max(...nums) : 0) + 1}`;
}