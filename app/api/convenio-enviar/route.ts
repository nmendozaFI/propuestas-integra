// ═══════════════════════════════════════════════════════════════════════
// /api/convenio-enviar  → la empresa envía su convenio a la Fundación
// ═══════════════════════════════════════════════════════════════════════
//
// Último paso del flujo público de las plantillas con `flujoEnvio` (hoy ENT-01):
// la empresa rellena, revisa el PDF en pantalla y pulsa "Aceptar y enviar". Aquí
// llega ese mismo PDF (el que ha visto, no se regenera) y se manda por correo al
// buzón de la Fundación con Microsoft Graph. La empresa no descarga nada.
//
// Es un endpoint PÚBLICO (sin contraseña, igual que la ruta de la empresa), así
// que valida el código, el tipo y el tamaño, y lleva un freno por IP.
//
// Variables de entorno: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET,
// CONVENIO_MAIL_FROM, CONVENIO_MAIL_TO  (ver lib/graph-mail.ts).
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import { enviarCorreoGraph, leerConfigMail } from '@/lib/graph-mail';
import {
  construirAsunto,
  construirCuerpoHtml,
} from '@/lib/convenio-mail-cuerpo';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Freno por IP (en memoria, por instancia) ───
// No es una defensa seria contra un ataque distribuido, pero corta el caso real:
// alguien que descubre la URL y pulsa "enviar" en bucle.
const VENTANA_MS = 60 * 60 * 1000; // 1 hora
const MAX_POR_VENTANA = 10;
const envios = new Map<string, number[]>();

function demasiados(ip: string): boolean {
  const ahora = Date.now();
  const previos = (envios.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (previos.length >= MAX_POR_VENTANA) {
    envios.set(ip, previos);
    return true;
  }
  previos.push(ahora);
  envios.set(ip, previos);
  // Limpieza barata para que el Map no crezca sin fin en una instancia longeva.
  if (envios.size > 500) {
    for (const [k, v] of envios) {
      if (v.every((t) => ahora - t >= VENTANA_MS)) envios.delete(k);
    }
  }
  return false;
}

function nombreSeguro(base: string): string {
  const limpio = (base || 'convenio')
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  return limpio || 'convenio';
}

export async function POST(req: NextRequest) {
  const cfg = leerConfigMail();
  if (!cfg) {
    return NextResponse.json(
      {
        error:
          'El envío por correo no está configurado en el servidor. Avisa a Fundación Íntegra.',
      },
      { status: 500 },
    );
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconocida';
  if (demasiados(ip)) {
    return NextResponse.json(
      { error: 'Se han hecho demasiados envíos desde esta conexión. Inténtalo más tarde.' },
      { status: 429 },
    );
  }

  // ─── Leer el formulario ───
  let file: File | null = null;
  let codigo = '';
  let datos: Record<string, string> = {};
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
    const c = form.get('codigo');
    if (typeof c === 'string') codigo = c.toUpperCase();
    const d = form.get('datos');
    if (typeof d === 'string' && d) {
      const parsed: unknown = JSON.parse(d);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        datos = parsed as Record<string, string>;
      }
    }
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }

  // ─── Validar que este convenio admite el flujo de envío ───
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.campos || !tipo.flujoEnvio) {
    return NextResponse.json(
      { error: 'Este convenio no admite el envío en línea.' },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: 'No se recibió el documento a enviar.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El documento es demasiado grande.' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Comprobación mínima de que es un PDF de verdad (cabecera %PDF-).
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return NextResponse.json(
      { error: 'El documento recibido no es un PDF válido.' },
      { status: 400 },
    );
  }

  // ─── Asunto y cuerpo del correo ───
  // Se construyen con las etiquetas del catálogo (servidor), no con lo que diga
  // el cliente: así el correo siempre tiene el mismo formato y un campo nuevo en
  // el formulario aparece solo. Ver `lib/convenio-mail-cuerpo.ts`.
  const empresa = (datos.nombreEmpresa || '').trim();
  const nombreArchivo = `${nombreSeguro(`${tipo.codigo}-${empresa}`)}.pdf`;
  const recibidoEl = new Date().toLocaleString('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });

  try {
    await enviarCorreoGraph({
      cfg,
      asunto: construirAsunto(tipo, datos),
      cuerpoHtml: construirCuerpoHtml(tipo, datos, {
        recibidoEl,
        nombreAdjunto: nombreArchivo,
      }),
      adjuntos: [
        { nombre: nombreArchivo, contentType: 'application/pdf', bytes: buffer },
      ],
      // Si la entidad dio un correo de contacto, responder le llega a ella.
      responderA: (datos.emailDpo || '').trim() || undefined,
    });
  } catch (err) {
    // El detalle (errores AADSTS, permisos, buzón mal configurado…) es para
    // nosotros: va a los logs de Vercel. A la empresa le damos un mensaje que
    // pueda accionar, sin tecnicismos ni datos internos.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[convenio-enviar] ${tipo.codigo}: ${msg}`);
    return NextResponse.json(
      {
        error:
          'No hemos podido enviar el convenio en este momento. Vuelve a intentarlo ' +
          `en unos minutos; si sigue fallando, escríbenos a ${cfg.to[0]}.`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
