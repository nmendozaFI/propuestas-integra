// ═══════════════════════════════════════════════════════════════════════
// LOADER PÚBLICO DE PLANTILLAS DE CONVENIO (cliente)
// ═══════════════════════════════════════════════════════════════════════
//
// Equivalente sin contraseña de `cargarPlantillaBytes` para la ruta pública
// /convenio/[codigo]. En vez de leer el manifest completo (que exige password),
// pregunta al endpoint público /api/convenio-publico/[codigo], que devuelve solo
// la URL de la versión viva de ESE convenio (Cloudinary si la hay, o el seed de
// /public si no). Luego descarga los bytes de esa URL.
// ═══════════════════════════════════════════════════════════════════════

"use client";

export async function cargarPlantillaConvenioPublica(
  codigo: string,
): Promise<Uint8Array> {
  const res = await fetch(`/api/convenio-publico/${encodeURIComponent(codigo)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`No se pudo resolver la plantilla (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { ok?: boolean; url?: string };
  if (!data.url) throw new Error("El servidor no devolvió la URL de la plantilla");

  const res2 = await fetch(data.url, { cache: "no-store" });
  if (!res2.ok) {
    throw new Error(`No se pudo descargar la plantilla (HTTP ${res2.status})`);
  }
  return new Uint8Array(await res2.arrayBuffer());
}
