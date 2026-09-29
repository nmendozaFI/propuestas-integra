// ═══════════════════════════════════════════════════════════════════════
// graph-mail.ts  → envío de correo con Microsoft Graph (Outlook / M365)
// ═══════════════════════════════════════════════════════════════════════
//
// Solo servidor. Envía desde un buzón real de la Fundación usando el flujo
// "client credentials" (la app se autentica como aplicación, sin usuario), así
// que no hay que guardar la contraseña de nadie ni renovar sesiones.
//
// Lo que IT tiene que preparar una vez, en Entra ID (Azure AD):
//   1. Registrar una aplicación → apuntar "Directory (tenant) ID" y
//      "Application (client) ID".
//   2. Certificados y secretos → nuevo secreto de cliente → copiar el VALOR.
//   3. Permisos de API → Microsoft Graph → Permisos de APLICACIÓN →
//      `Mail.Send` → "Conceder consentimiento del administrador".
//   4. Recomendado: restringir ese permiso a un solo buzón con una
//      "Application Access Policy" en Exchange Online, para que la app solo
//      pueda enviar como CONVENIO_MAIL_FROM y no como cualquier usuario.
//
// Variables de entorno (Vercel + .env local):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
//   CONVENIO_MAIL_FROM  → buzón desde el que se envía (ej. alianzas@fundacionintegra.org)
//   CONVENIO_MAIL_TO    → destinatario(s), separados por coma
// ═══════════════════════════════════════════════════════════════════════

import 'server-only';

// Graph acepta adjuntos "inline" (en el propio cuerpo del mensaje) hasta ~3 MB.
// Por encima haría falta una sesión de subida; los convenios pesan mucho menos.
const MAX_ADJUNTO_BYTES = 3 * 1024 * 1024;

export type Adjunto = {
  nombre: string;
  contentType: string;
  bytes: Buffer;
};

export type ConfigMail = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  from: string;
  to: string[];
};

/** Lee la configuración del entorno. Devuelve null si falta algo (así la ruta
 *  puede responder con un error claro en vez de reventar). */
export function leerConfigMail(): ConfigMail | null {
  const tenantId = process.env.MS_TENANT_ID?.trim();
  const clientId = process.env.MS_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim();
  const from = process.env.CONVENIO_MAIL_FROM?.trim();
  const to = (process.env.CONVENIO_MAIL_TO || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!tenantId || !clientId || !clientSecret || !from || to.length === 0) {
    return null;
  }
  return { tenantId, clientId, clientSecret, from, to };
}

// ─── Token de aplicación (cacheado en memoria mientras dure la instancia) ───
let tokenCache: { valor: string; expiraEn: number } | null = null;

async function obtenerToken(cfg: ConfigMail): Promise<string> {
  const ahora = Date.now();
  // 60 s de margen para no usar un token que caduca a mitad de la petición.
  if (tokenCache && tokenCache.expiraEn - 60_000 > ahora) return tokenCache.valor;

  const url = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  const json = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!resp.ok || !json.access_token) {
    // El error_description de Entra es largo y lleva IDs de correlación; nos
    // quedamos con la primera línea, que es la útil.
    const detalle = (json.error_description || json.error || `HTTP ${resp.status}`)
      .split('\n')[0]
      .trim();
    throw new Error(`No se pudo autenticar contra Microsoft 365: ${detalle}`);
  }

  tokenCache = {
    valor: json.access_token,
    expiraEn: ahora + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

/** Envía un correo HTML con adjuntos desde CONVENIO_MAIL_FROM. */
export async function enviarCorreoGraph({
  cfg,
  asunto,
  cuerpoHtml,
  adjuntos = [],
  responderA,
}: {
  cfg: ConfigMail;
  asunto: string;
  cuerpoHtml: string;
  adjuntos?: Adjunto[];
  /** Opcional: dirección a la que responder (la de la entidad, si la hay). */
  responderA?: string;
}): Promise<void> {
  const total = adjuntos.reduce((n, a) => n + a.bytes.length, 0);
  if (total > MAX_ADJUNTO_BYTES) {
    throw new Error('El documento es demasiado grande para enviarlo por correo.');
  }

  const token = await obtenerToken(cfg);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.from)}/sendMail`;

  const mensaje = {
    message: {
      subject: asunto,
      body: { contentType: 'HTML', content: cuerpoHtml },
      toRecipients: cfg.to.map((address) => ({ emailAddress: { address } })),
      ...(responderA
        ? { replyTo: [{ emailAddress: { address: responderA } }] }
        : {}),
      attachments: adjuntos.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.nombre,
        contentType: a.contentType,
        contentBytes: a.bytes.toString('base64'),
      })),
    },
    saveToSentItems: true,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mensaje),
    cache: 'no-store',
  });

  // sendMail devuelve 202 Accepted sin cuerpo cuando va bien.
  if (resp.status !== 202 && !resp.ok) {
    const texto = await resp.text().catch(() => '');
    let detalle = `HTTP ${resp.status}`;
    try {
      const j = JSON.parse(texto) as { error?: { message?: string } };
      if (j.error?.message) detalle = j.error.message;
    } catch {
      if (texto) detalle = texto.slice(0, 300);
    }
    // Un token cacheado que el servidor ya no acepta no debe quedarse pegado.
    if (resp.status === 401) tokenCache = null;
    throw new Error(`Microsoft 365 rechazó el envío: ${detalle}`);
  }
}
