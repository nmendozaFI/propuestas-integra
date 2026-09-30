// ═══════════════════════════════════════════════════════════════════════
// CONEXIÓN A NEON (solo servidor)
// ═══════════════════════════════════════════════════════════════════════
//
// ÚNICO archivo de la app que sabe que la base de datos existe y que es Neon.
// Si algún día se cambia de proveedor, se cambia aquí y nada más se entera.
//
// No usamos ORM a propósito: una tabla y media docena de consultas conocidas no
// justifican un ORM (ver lib/enlaces-repo.ts para el reparto de capas).
//
// 🔒 SEGURIDAD — lo importante de trabajar con SQL "a pelo":
// `sql` es un TAGGED TEMPLATE, no un template string normal. Esto:
//     sql`select * from enlaces_convenio where token = ${token}`
// NO pega el valor dentro del texto: manda `... where token = $1` con el valor
// aparte, como consulta preparada. Es decir, ya viene parametrizado y una
// comilla dentro de `token` no puede cambiar la consulta.
// La única forma de romperlo es construir el SQL con `+` o con un template
// string suelto antes de pasarlo. Regla de la casa: **el texto SQL siempre va
// pegado al tag `sql`, nunca en una variable**.
//
// Variable de entorno: DATABASE_URL (Neon · Vercel → Storage → Neon).
// ═══════════════════════════════════════════════════════════════════════

import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cliente: NeonQueryFunction<false, false> | null = null;

/** true si el servidor tiene configurada la base de datos. */
export function hayBaseDeDatos(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Cliente SQL de Neon.
 *
 * Es perezoso (no se crea al importar) por dos razones: `next build` importa los
 * módulos sin que existan las variables de entorno de ejecución, y así un despliegue
 * sin DATABASE_URL falla al usarse con un mensaje claro en vez de romper el build.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (!cliente) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'Falta DATABASE_URL: la base de datos de enlaces no está configurada en este entorno. ' +
          'Compruébalo en el .env local y en Vercel → Settings → Environment Variables.',
      );
    }
    // Neon abre la conexión por HTTP en cada consulta: no hay pool que agotar ni
    // que cerrar, que es justo lo que conviene en funciones serverless.
    cliente = neon(url);
  }
  return cliente;
}
