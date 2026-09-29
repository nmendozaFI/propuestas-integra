// ═══════════════════════════════════════════════════════════════════════
// convenio-mail-cuerpo.ts  → asunto y cuerpo del correo que recibe el equipo
// ═══════════════════════════════════════════════════════════════════════
//
// Lo usa /api/convenio-enviar. Se construye SIEMPRE en el servidor a partir del
// catálogo (`tipo.campos`), no de lo que mande el cliente: así el correo tiene
// el mismo formato pase lo que pase, y si mañana se añade un campo al formulario
// aparece solo en el correo.
//
// HTML pensado para Outlook: tablas y estilos en línea, sin flexbox, sin grid y
// sin hojas de estilo (Outlook de escritorio renderiza con el motor de Word y se
// come casi todo lo demás).
// ═══════════════════════════════════════════════════════════════════════

import type { TipoConvenio } from '@/lib/tipos-convenio';

const ROJO = '#D22837';
const TEXTO = '#2D2E33';
const SUAVE = '#6C6D74';
const BORDE = '#E5E5E7';

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Asunto: lo primero que se ve en la bandeja, así que dice qué hay que hacer. */
export function construirAsunto(
  tipo: TipoConvenio,
  datos: Record<string, string>,
): string {
  const empresa = (datos.nombreEmpresa || '').trim() || 'entidad sin nombre';
  return `Pendiente de firma · ${tipo.codigo} · ${empresa}`;
}

/** Cuerpo HTML: quién lo envía, todos sus datos y qué toca hacer ahora. */
export function construirCuerpoHtml(
  tipo: TipoConvenio,
  datos: Record<string, string>,
  opciones: { recibidoEl: string; nombreAdjunto: string },
): string {
  const empresa = (datos.nombreEmpresa || '').trim();

  // Todos los campos rellenos, en el orden en que aparecen en el formulario.
  const filas = (tipo.campos || [])
    .map((c) => {
      const valor = (datos[c.key] || '').trim();
      if (!valor) return '';
      return `
          <tr>
            <td style="padding:7px 16px 7px 0;color:${SUAVE};font-size:13px;vertical-align:top;white-space:nowrap;border-bottom:1px solid ${BORDE}">${escaparHtml(c.label)}</td>
            <td style="padding:7px 0;color:${TEXTO};font-size:14px;vertical-align:top;border-bottom:1px solid ${BORDE}">${escaparHtml(valor)}</td>
          </tr>`;
    })
    .filter(Boolean)
    .join('');

  const contacto = (datos.emailDpo || '').trim();

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#F7F7F7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F7F7;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${BORDE};border-radius:10px;font-family:Roboto,Arial,Helvetica,sans-serif">

          <!-- Cabecera -->
          <tr>
            <td style="background:${ROJO};border-radius:10px 10px 0 0;padding:18px 24px">
              <div style="color:#ffffff;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Convenio pendiente de firma</div>
              <div style="color:#ffffff;font-size:20px;font-weight:700;padding-top:4px">${escaparHtml(empresa || 'Entidad sin nombre')}</div>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:22px 24px 6px">
              <p style="margin:0 0 14px;font-size:14px;color:${TEXTO};line-height:1.6">
                <strong>${escaparHtml(empresa || 'Una entidad')}</strong> ha cumplimentado y enviado el convenio
                <strong>${escaparHtml(tipo.codigo)} · ${escaparHtml(tipo.label)}</strong> desde el enlace público.
                Ya ha revisado y aceptado el documento.
              </p>
              <p style="margin:0 0 6px;font-size:14px;color:${TEXTO};line-height:1.6">
                El PDF va adjunto (<strong>${escaparHtml(opciones.nombreAdjunto)}</strong>), listo para
                firmar por parte de la Fundación y devolvérselo${contacto ? ` a <a href="mailto:${escaparHtml(contacto)}" style="color:${ROJO}">${escaparHtml(contacto)}</a>` : ''}.
              </p>
            </td>
          </tr>

          <!-- Datos del formulario -->
          <tr>
            <td style="padding:16px 24px 4px">
              <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${SUAVE};padding-bottom:6px">
                Datos facilitados por la entidad
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}
              </table>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="padding:18px 24px 22px">
              <p style="margin:0;font-size:12px;color:${SUAVE};line-height:1.6">
                Recibido el ${escaparHtml(opciones.recibidoEl)}.
                Enviado automáticamente por la app de convenios de Fundación Íntegra.${
                  contacto
                    ? ' Si respondes a este correo, la respuesta va directa al contacto de la entidad.'
                    : ''
                }
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
