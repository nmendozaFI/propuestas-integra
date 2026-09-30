// ═══════════════════════════════════════════════════════════════════════
// ENLACES DE CONVENIO — el modelo (tipos compartidos)
// ═══════════════════════════════════════════════════════════════════════
//
// Esto es lo que en un ORM sería el "model". Sin ORM el modelo no desaparece:
// vive aquí, escrito a mano una vez. Lo que perdemos es que nadie comprueba
// solo que estos tipos y las columnas de db/001-enlaces-convenio.sql coinciden;
// por eso la traducción fila→objeto está en UN solo sitio (`lib/enlaces-repo.ts`,
// función `mapear`). Si cambia una columna, se toca ahí y TypeScript arrastra
// el error por toda la app.
//
// Sin `server-only` a propósito: son tipos puros, sin SQL ni secretos, y los
// componentes de la pantalla de seguimiento los necesitan.
// ═══════════════════════════════════════════════════════════════════════

/** Estado guardado en la columna `estado`. */
export type EstadoGuardado = 'pendiente' | 'usado' | 'anulado';

/**
 * Estado de cara al usuario. Añade 'caducado', que NO está en la base de datos:
 * se calcula comparando `caduca_en` con la hora actual (ver `estadoVisible`).
 */
export type EstadoVisible = EstadoGuardado | 'caducado';

/** Un enlace, ya traducido de fila de Postgres a objeto de la app. */
export interface EnlaceConvenio {
  token: string;
  /** Código de plantilla, ej. 'ENT-01'. */
  codigo: string;
  /** Campos que fija la Fundación y la empresa no puede tocar. key del campo → valor. */
  fijados: Record<string, string>;
  /** Nota interna para reconocer el enlace en la lista: "Bimbo · Ana Ruiz". */
  nota: string | null;
  estado: EstadoGuardado;
  creadoEn: Date;
  caducaEn: Date;
  usadoEn: Date | null;
  /** Entidad que acabó enviando el convenio. */
  usadoPor: string | null;
}

/** Datos para crear un enlace nuevo. */
export interface NuevoEnlace {
  codigo: string;
  fijados: Record<string, string>;
  nota?: string | null;
  /** Días de validez. Si no se indica, `DIAS_VALIDEZ_POR_DEFECTO`. */
  diasValidez?: number;
}

export const DIAS_VALIDEZ_POR_DEFECTO = 30;

/** Estado real teniendo en cuenta la caducidad. Un enlace usado sigue "usado" aunque caduque. */
export function estadoVisible(enlace: EnlaceConvenio, ahora: Date = new Date()): EstadoVisible {
  if (enlace.estado !== 'pendiente') return enlace.estado;
  return enlace.caducaEn.getTime() <= ahora.getTime() ? 'caducado' : 'pendiente';
}

/** true si el enlace todavía sirve para rellenar y enviar. */
export function enlaceUtilizable(enlace: EnlaceConvenio, ahora: Date = new Date()): boolean {
  return estadoVisible(enlace, ahora) === 'pendiente';
}

/** Texto para la pantalla interna de seguimiento. */
export const ETIQUETA_ESTADO: Record<EstadoVisible, string> = {
  pendiente: 'Pendiente',
  usado: 'Usado',
  anulado: 'Anulado',
  caducado: 'Caducado',
};

// ─── Ida y vuelta por HTTP ───────────────────────────────────────────────
// JSON no tiene fechas: al cruzar la red los `Date` se vuelven texto ISO. En vez
// de dejar que cada pantalla haga `new Date(...)` por su cuenta (y que a alguna
// se le olvide), la conversión vive aquí y la usan los dos lados.

/** Un EnlaceConvenio tal y como viaja en el JSON de la API. */
export type EnlaceSerializado = Omit<
  EnlaceConvenio,
  'creadoEn' | 'caducaEn' | 'usadoEn'
> & {
  creadoEn: string;
  caducaEn: string;
  usadoEn: string | null;
};

/** Servidor → JSON. */
export function serializarEnlace(e: EnlaceConvenio): EnlaceSerializado {
  return {
    ...e,
    creadoEn: e.creadoEn.toISOString(),
    caducaEn: e.caducaEn.toISOString(),
    usadoEn: e.usadoEn ? e.usadoEn.toISOString() : null,
  };
}

/** JSON → objeto usable en el navegador. */
export function deserializarEnlace(e: EnlaceSerializado): EnlaceConvenio {
  return {
    ...e,
    creadoEn: new Date(e.creadoEn),
    caducaEn: new Date(e.caducaEn),
    usadoEn: e.usadoEn ? new Date(e.usadoEn) : null,
  };
}

/** Ruta pública de un enlace con token, a partir del origen del navegador. */
export function urlDeEnlace(origen: string, token: string): string {
  return `${origen}/convenio/t/${token}`;
}
