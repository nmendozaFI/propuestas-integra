// ═══════════════════════════════════════════════════════════════════════
// POST /api/plantillas/subir  (multipart/form-data)
// ═══════════════════════════════════════════════════════════════════════
// Campos del form:
//   - password     (string)  contraseña de la app
//   - plantillaId  (string)  'conv:SOC-01' | 'prop:socios' | …
//   - nota         (string)  texto libre opcional (queda en el historial)
//   - archivo      (File)    el .docx editado
//
// Flujo:
//   1. Auth.
//   2. Resolver baseline = versión viva (Cloudinary) o, si no hay, seed /public.
//   3. validarSubida() — LA PUERTA. Si hay errores → 422, NO se sube nada.
//   4. Subir versión nueva (raw) + actualizar manifest (puntero 'actual').
//   5. Devolver avisos (incl. "requiere ajuste de formulario") y el estado.
//
// La validación corre también en el cliente para feedback instantáneo, pero
// ESTA es la que de verdad autoriza la escritura: nunca confiamos en el cliente.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { adminPasswordValida } from '@/lib/auth-server';
import { getPlantillaRegistro } from '@/lib/plantillas-registro';
import { validarSubida, analizarDocx } from '@/lib/plantillas-validacion';
import {
  leerManifest,
  guardarManifest,
  subirVersionRaw,
  siguienteV,
  type EntradaManifest,
  type VersionPlantilla,
} from '@/lib/plantillas-cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB, de sobra para un .docx

export async function POST(request: Request) {
  // ── 1. Parseo del form ──
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Formato de petición inválido' }, { status: 400 });
  }

  const password = String(form.get('password') || '');
  if (!adminPasswordValida(password)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const plantillaId = String(form.get('plantillaId') || '');
  const nota = String(form.get('nota') || '').slice(0, 280);
  const reg = getPlantillaRegistro(plantillaId);
  if (!reg) {
    return NextResponse.json({ ok: false, error: `Plantilla desconocida: ${plantillaId}` }, { status: 400 });
  }

  const archivo = form.get('archivo');
  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Falta el archivo .docx' }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'El archivo es demasiado grande' }, { status: 413 });
  }

  const nuevoBuf = Buffer.from(await archivo.arrayBuffer());
  const nuevoBytes = new Uint8Array(nuevoBuf);

  // ── 2. Baseline: versión viva o seed de /public ──
  let baselineBytes: Uint8Array;
  try {
    const manifest0 = await leerManifest();
    const entrada0 = manifest0.plantillas[plantillaId];
    const viva = entrada0?.versiones.find((x) => x.v === entrada0.actual);
    const baselineUrl = viva ? viva.secureUrl : new URL(reg.rutaBundled, request.url).toString();
    const resB = await fetch(baselineUrl, { cache: 'no-store' });
    if (!resB.ok) throw new Error(`baseline HTTP ${resB.status}`);
    baselineBytes = new Uint8Array(await resB.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `No se pudo cargar la versión de referencia: ${msg}` }, { status: 500 });
  }

  // ── 3. Validación: LA PUERTA ──
  const validacion = await validarSubida({ nuevoBytes, baselineBytes });
  if (!validacion.ok) {
    return NextResponse.json(
      { ok: false, bloqueado: true, errores: validacion.errores, avisos: validacion.avisos },
      { status: 422 },
    );
  }

  // ── 4. Subir versión + actualizar manifest ──
  try {
    const manifest = await leerManifest(); // releemos por si cambió entre medias
    const entrada: EntradaManifest = manifest.plantillas[plantillaId] ?? { actual: null, versiones: [] };
    const v = siguienteV(entrada);

    const subida = await subirVersionRaw({ publicIdBase: reg.publicIdBase, v, bytes: nuevoBuf });

    const tokens = await analizarDocx(nuevoBytes);
    const nuevaVersion: VersionPlantilla = {
      v,
      publicId: subida.publicId,
      secureUrl: subida.secureUrl,
      bytes: subida.bytes,
      fecha: new Date().toISOString(),
      nota,
      placeholders: [...tokens.engineTokens].sort(),
      requiereAjusteForm: validacion.nuevos.slice().sort(),
    };

    entrada.versiones.push(nuevaVersion);
    entrada.actual = v; // la recién subida pasa a ser la viva
    manifest.plantillas[plantillaId] = entrada;
    await guardarManifest(manifest);

    return NextResponse.json({
      ok: true,
      version: v,
      avisos: validacion.avisos,
      requiereAjusteForm: nuevaVersion.requiereAjusteForm,
      entrada,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Error al guardar en Cloudinary: ${msg}` }, { status: 500 });
  }
}