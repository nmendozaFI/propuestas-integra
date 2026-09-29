// ═══════════════════════════════════════════════════════════════════════
// /api/convenio-pdf  → convierte un .docx ya relleno a PDF calcado
// ═══════════════════════════════════════════════════════════════════════
//
// La plantilla sigue siendo Word y se rellena en el navegador (docx-convenios.ts).
// Solo en la ruta PÚBLICA de las plantillas marcadas con `descargaPdfPublica`
// (hoy ENT-01), el .docx resultante se envía aquí y se convierte a PDF con
// CloudConvert (motor LibreOffice → misma maquetación que el Word). Se devuelve
// el PDF para descargar; la empresa nunca ve el .docx.
//
// Privacidad: el documento pasa unos segundos por CloudConvert. Conviene fijar
// la región por defecto de la cuenta a la UE (panel CloudConvert → Default
// Region) para cumplir RGPD; CloudConvert no conserva los archivos tras el job.
//
// Variable de entorno: CLOUDCONVERT_API_KEY (cuenta propia, distinta de Claude).
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import CloudConvert from 'cloudconvert';

export const runtime = 'nodejs';
// La conversión + sondeo puede tardar unos segundos; damos margen en Vercel.
export const maxDuration = 60;

// Tope defensivo: los convenios rellenos pesan decenas de KB. Evita abuso del
// endpoint (es público, sin contraseña, igual que la ruta de la empresa).
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function nombreSeguro(base: string): string {
  const limpio = (base || 'convenio')
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  return limpio || 'convenio';
}

export async function POST(req: NextRequest) {
  // .trim(): la clave de CloudConvert es un JWT de ~1.000 caracteres y al
  // pegarla en el panel de Vercel es fácil que se cuele un salto de línea o un
  // espacio al final. La cabecera Authorization sale entonces malformada y la
  // API responde "Unauthorized", que despista mucho.
  const apiKey = process.env.CLOUDCONVERT_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Falta CLOUDCONVERT_API_KEY en el servidor.' },
      { status: 500 },
    );
  }

  // ─── Leer el .docx del formulario ───
  let file: File | null = null;
  let base = 'convenio';
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
    const nombre = form.get('nombre');
    if (typeof nombre === 'string' && nombre.trim()) base = nombre;
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json(
      { error: 'No se recibió el documento a convertir.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'El documento es demasiado grande.' },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const nombre = nombreSeguro(base);

  // ─── Convertir con CloudConvert (docx → pdf, motor LibreOffice) ───
  try {
    const cc = new CloudConvert(apiKey);

    let job = await cc.jobs.create({
      tasks: {
        'import-file': { operation: 'import/upload' },
        'convert-file': {
          operation: 'convert',
          input: 'import-file',
          input_format: 'docx',
          output_format: 'pdf',
          engine: 'libreoffice',
        },
        'export-file': { operation: 'export/url', input: 'convert-file' },
      },
    });

    const uploadTask = job.tasks.find((t) => t.name === 'import-file');
    if (!uploadTask) throw new Error('No se pudo crear la tarea de subida.');
    await cc.tasks.upload(uploadTask, buffer, `${nombre}.docx`);

    job = await cc.jobs.wait(job.id);

    const exportTask = job.tasks.find(
      (t) => t.operation === 'export/url' && t.status === 'finished',
    );
    const url = exportTask?.result?.files?.[0]?.url;
    if (!url) {
      const fallida = job.tasks.find((t) => t.status === 'error');
      throw new Error(fallida?.message || 'La conversión no devolvió ningún PDF.');
    }

    const pdfResp = await fetch(url);
    if (!pdfResp.ok) throw new Error('No se pudo descargar el PDF convertido.');
    const pdfBytes = Buffer.from(await pdfResp.arrayBuffer());

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombre}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[convenio-pdf] ${msg}`);

    // "Unauthorized" a secas es siempre lo mismo: la CLOUDCONVERT_API_KEY de
    // ESTE entorno no vale (mal pegada, de otra cuenta o revocada). Lo decimos
    // con nombre y apellidos para no perder tiempo buscando en otro sitio.
    if (/unauthorized|unauthenticated|401/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'CloudConvert ha rechazado la clave de este entorno (CLOUDCONVERT_API_KEY). ' +
            'Revisa que esté bien copiada y activa para el entorno desplegado.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: `Error al convertir a PDF: ${msg}` },
      { status: 502 },
    );
  }
}
