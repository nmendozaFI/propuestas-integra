// ═══════════════════════════════════════════════════════════════════════
// AUTH DE SERVIDOR — mismo gate que /api/verificar
// ═══════════════════════════════════════════════════════════════════════
// La app usa una única contraseña compartida (process.env.APP_PASSWORD).
// Las rutas de plantillas (subir / rollback / listar) reutilizan exactamente
// la misma comprobación que /api/verificar para no abrir una segunda puerta.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only';

/** true si la contraseña coincide con APP_PASSWORD. */
export function passwordValida(password: unknown): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false; // servidor sin contraseña configurada → denegar
  return typeof password === 'string' && password === expected;
}

/** true si coincide con APP_ADMIN_PASSWORD (acceso al almacén de plantillas). */
export function adminPasswordValida(password: unknown): boolean {
  const expected = process.env.APP_ADMIN_PASSWORD;
  if (!expected) return false;
  return typeof password === 'string' && password === expected;
}

/** Lee la contraseña de la cabecera 'x-app-password' (igual que /api/generar). */
export function passwordDeCabecera(req: Request): string {
  return req.headers.get('x-app-password') || '';
}