// ═══════════════════════════════════════════════════════════════════════
// /convenio/t/[token]  → RUTA PÚBLICA CON ENLACE DE UN SOLO USO
// ═══════════════════════════════════════════════════════════════════════
//
// El enlace que el equipo genera desde /convenios/[grupo]/[codigo]. Frente a la
// ruta abierta gana dos cosas:
//
//   1. UN SOLO ENVÍO. El token se consume al enviar (no al abrir), así que la
//      empresa puede cerrar la pestaña o refrescar sin quedarse fuera.
//   2. LOS CAMPOS FIJADOS SON DE VERDAD. Ya no viajan en la URL: se leen aquí,
//      del servidor. La empresa no puede tocar el importe desde la barra de
//      direcciones, que era el agujero de la versión con query params.
//
// Nunca se cachea: el estado del enlace cambia (usado, anulado) y una página
// cacheada enseñaría un formulario que ya no sirve.
// ═══════════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import { MARCA } from '@/lib/marca';
import { buscarEnlace } from '@/lib/enlaces-repo';
import { estadoVisible } from '@/lib/enlaces-tipos';
import PantallaConvenio from '@/components/convenios/PantallaConvenio';
import EnlaceNoValido, {
  type MotivoNoValido,
} from '@/components/convenios/EnlaceNoValido';

export const dynamic = 'force-dynamic';

type Params = { token: string };

export async function generateMetadata(): Promise<Metadata> {
  // Deliberadamente genérica: el título de la pestaña no debe delatar de qué
  // entidad es el convenio si alguien comparte una captura.
  return {
    title: 'Convenio · Fundación Íntegra',
    description: 'Rellena, revisa y envía tu convenio con Fundación Íntegra.',
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Convenio · Fundación Íntegra',
      description: 'Rellena, revisa y envía tu convenio con Fundación Íntegra.',
      type: 'website',
      locale: 'es_ES',
      images: [{ url: MARCA.ogConvenio, width: 1200, height: 630, alt: 'Fundación Íntegra' }],
    },
    twitter: { card: 'summary_large_image', images: [MARCA.ogConvenio] },
  };
}

export default async function ConvenioConTokenPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;

  // Si la base no responde, la empresa no debe ver una traza: se le dice que el
  // enlace no vale y el detalle va a los logs de Vercel.
  let enlace = null;
  try {
    enlace = await buscarEnlace(token);
  } catch (err) {
    console.error(`[convenio/t] buscando token: ${err instanceof Error ? err.message : err}`);
    return <EnlaceNoValido motivo="desconocido" />;
  }

  if (!enlace) return <EnlaceNoValido motivo="desconocido" />;

  const estado = estadoVisible(enlace);
  if (estado !== 'pendiente') {
    return <EnlaceNoValido motivo={estado as MotivoNoValido} />;
  }

  // El enlace apunta a una plantilla que ya no existe en el catálogo (se retiró
  // después de generarlo). No es culpa de la empresa, pero tampoco hay formulario.
  const tipo = getTipoConvenio(enlace.codigo);
  if (!tipo?.plantilla || !tipo.campos) return <EnlaceNoValido motivo="desconocido" />;

  return <PantallaConvenio tipo={tipo} fijados={enlace.fijados} token={enlace.token} />;
}
