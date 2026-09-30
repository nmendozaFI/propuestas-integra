// ═══════════════════════════════════════════════════════════════════════
// /convenio/[codigo]  → RUTA PÚBLICA ABIERTA (la empresa rellena y descarga)
// ═══════════════════════════════════════════════════════════════════════
//
// Sin contraseña y sin la barra de navegación de la app (el Navbar se oculta
// solo en /convenio/…). Server Component: valida el código, lee los campos que
// la Fundación fija por query param y los pasa a la pantalla compartida.
//
// 🔴 LAS PLANTILLAS CON `flujoEnvio` (hoy ENT-01) NO SE SIRVEN AQUÍ.
// Esas exigen un enlace de un solo uso (/convenio/t/[token]). Si esta ruta las
// siguiera aceptando, el token no serviría de nada: bastaría con quitarlo de la
// dirección para volver al enlace reutilizable e ilimitado de antes. El envío
// está cortado además en el servidor (app/api/convenio-enviar), pero se corta
// también aquí para no dejar a la empresa rellenar un formulario en balde.
//
// El resto de plantillas siguen abiertas: solo generan un .docx en el navegador,
// sin efecto en el servidor, así que no hay nada que limitar.
// ═══════════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import { MARCA } from '@/lib/marca';
import PantallaConvenio from '@/components/convenios/PantallaConvenio';
import EnlaceNoValido from '@/components/convenios/EnlaceNoValido';

type Params = { codigo: string };
type Search = Record<string, string | string[] | undefined>;

function normalizarCodigo(raw: string): string {
  return (raw || '').toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const tipo = getTipoConvenio(normalizarCodigo(codigo));
  const titulo = tipo
    ? `${tipo.label} · Fundación Íntegra`
    : 'Convenio · Fundación Íntegra';
  const descripcion = tipo?.flujoEnvio
    ? 'Rellena, revisa y envía tu convenio con Fundación Íntegra en un par de minutos.'
    : 'Rellena, descarga y devuelve firmado tu convenio con Fundación Íntegra.';
  return {
    title: titulo,
    description: descripcion,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descripcion,
      type: 'website',
      locale: 'es_ES',
      images: [{ url: MARCA.ogConvenio, width: 1200, height: 630, alt: 'Fundación Íntegra' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [MARCA.ogConvenio],
    },
  };
}

export default async function ConvenioPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { codigo: rawCodigo } = await params;
  const codigo = normalizarCodigo(rawCodigo);
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.plantilla || !tipo.campos) notFound();

  // Ver el bloque de cabecera: estas plantillas solo se sirven con token.
  if (tipo.flujoEnvio) return <EnlaceNoValido motivo="requiere-enlace" />;

  // Campos fijados por la Fundación: cualquier query param cuyo nombre coincida
  // con la `key` de un campo de esta plantilla.
  const sp = await searchParams;
  const keysValidas = new Set(tipo.campos.map((c) => c.key));
  const fijados: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (!keysValidas.has(k)) continue;
    const valor = Array.isArray(v) ? v[0] : v;
    if (valor != null && valor.trim() !== '') fijados[k] = valor;
  }

  return <PantallaConvenio tipo={tipo} fijados={fijados} />;
}
