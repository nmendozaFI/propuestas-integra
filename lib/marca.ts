// ═══════════════════════════════════════════════════════════════════════
// MARCA — rutas de los logos de Fundación Íntegra (fuente única)
// ═══════════════════════════════════════════════════════════════════════
// Cambia aquí la ruta si se actualiza el logo (p. ej. cuando caduque el de
// "25 años"). Los assets viven en /public/marca/.
//   - logoNegativo: blanco sobre transparente → para fondos rojos (banda, sidebar)
//   - logoColor:    color sobre transparente → para fondos claros (login)
//   - ogConvenio:   1200×630, logo sobre rojo → imagen de previsualización al compartir
// ═══════════════════════════════════════════════════════════════════════

export const MARCA = {
  logoNegativo: '/marca/logo-negativo.png',
  logoColor: '/marca/logo-color.png',
  ogConvenio: '/marca/og-convenio.png',
} as const;
