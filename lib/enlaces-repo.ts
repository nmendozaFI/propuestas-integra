// ═══════════════════════════════════════════════════════════════════════
// ENLACES DE CONVENIO — repositorio (solo servidor)
// ═══════════════════════════════════════════════════════════════════════
//
// ÚNICO archivo de la app con SQL dentro. Todo lo demás (rutas de API, páginas,
// componentes) llama a estas funciones y no sabe que hay un Postgres detrás.
// Esa frontera es lo que sustituye al ORM:
//
//    ruta / página            →  crearEnlace(), buscarEnlace(), consumirEnlace()
//    lib/enlaces-repo.ts (aquí)  →  SQL  ─ frontera ─
//    lib/db.ts                →  conexión
//
// Si un día entra Drizzle, se reescribe este archivo y NADA más se entera.
// Si el SQL se esparce por las rutas, esa puerta se cierra para siempre: por eso
// la regla es que no haya un solo `sql` fuera de aquí.
//
// Sobre la seguridad del SQL "a pelo", ver el comentario de lib/db.ts:
// el tag `sql` ya parametriza; el peligro solo aparece si se concatenan cadenas.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only';
import { randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import {
  DIAS_VALIDEZ_POR_DEFECTO,
  type EnlaceConvenio,
  type EstadoGuardado,
  type NuevoEnlace,
} from '@/lib/enlaces-tipos';

// ─── Traducción fila → objeto ────────────────────────────────────────────
// La ÚNICA función que conoce los nombres de las columnas. Todo lo que sale de
// este archivo ya es un EnlaceConvenio; las filas crudas no salen nunca.

/** Cómo devuelve Postgres una fila de `enlaces_convenio`. */
interface FilaEnlace {
  token: string;
  codigo: string;
  fijados: Record<string, string> | null;
  nota: string | null;
  estado: string;
  creado_en: string | Date;
  caduca_en: string | Date;
  usado_en: string | Date | null;
  usado_por: string | null;
}

const aFecha = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));

function mapear(fila: FilaEnlace): EnlaceConvenio {
  return {
    token: fila.token,
    codigo: fila.codigo,
    fijados: fila.fijados ?? {},
    nota: fila.nota,
    estado: fila.estado as EstadoGuardado,
    creadoEn: aFecha(fila.creado_en),
    caducaEn: aFecha(fila.caduca_en),
    usadoEn: fila.usado_en ? aFecha(fila.usado_en) : null,
    usadoPor: fila.usado_por,
  };
}

// ─── Token ───────────────────────────────────────────────────────────────

/**
 * 24 bytes aleatorios de crypto → 32 caracteres base64url.
 *
 * No es un UUID a propósito: un UUID v4 trae versión y variante fijas y "parece"
 * adivinable a ojos de quien lo audite. Esto son 192 bits de puro azar, seguros
 * para URL (base64url no mete `+`, `/` ni `=`).
 */
function nuevoToken(): string {
  return randomBytes(24).toString('base64url');
}

// ─── Escritura ───────────────────────────────────────────────────────────

/** Crea un enlace y devuelve el registro completo (con su token ya generado). */
export async function crearEnlace(datos: NuevoEnlace): Promise<EnlaceConvenio> {
  const sql = getSql();
  const dias = datos.diasValidez ?? DIAS_VALIDEZ_POR_DEFECTO;
  const caducaEn = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  const nota = datos.nota?.trim() || null;

  const filas = (await sql`
    insert into enlaces_convenio (token, codigo, fijados, nota, caduca_en)
    values (${nuevoToken()}, ${datos.codigo}, ${JSON.stringify(datos.fijados ?? {})}::jsonb,
            ${nota}, ${caducaEn.toISOString()})
    returning *
  `) as FilaEnlace[];

  return mapear(filas[0]);
}

/**
 * Marca el enlace como usado. Devuelve true solo si ESTA llamada lo consumió.
 *
 * Es el corazón del uso único: el `where` exige que siga pendiente y sin caducar,
 * así que un UPDATE sobre una fila ya usada no toca nada y devuelve 0 filas. Al ser
 * una sola sentencia, Postgres la resuelve de forma atómica: si llegan dos envíos a
 * la vez (doble clic, dos pestañas), uno gana y el otro recibe false. No hace falta
 * transacción ni bloqueo explícito.
 *
 * ⚠️ Llamar SIEMPRE después de que Graph confirme el correo, nunca antes: si el
 * envío falla, el enlace tiene que seguir sirviendo.
 */
export async function consumirEnlace(token: string, usadoPor: string | null): Promise<boolean> {
  const sql = getSql();
  const filas = (await sql`
    update enlaces_convenio
       set estado = 'usado', usado_en = now(), usado_por = ${usadoPor}
     where token = ${token}
       and estado = 'pendiente'
       and caduca_en > now()
    returning token
  `) as { token: string }[];

  return filas.length === 1;
}

/** Anula un enlace pendiente (botón de la pantalla de seguimiento). */
export async function anularEnlace(token: string): Promise<boolean> {
  const sql = getSql();
  const filas = (await sql`
    update enlaces_convenio
       set estado = 'anulado'
     where token = ${token} and estado = 'pendiente'
    returning token
  `) as { token: string }[];

  return filas.length === 1;
}

// ─── Lectura ─────────────────────────────────────────────────────────────

/**
 * Busca un enlace por su token. Devuelve null si no existe.
 *
 * Devuelve el enlace en CUALQUIER estado (usado, anulado, caducado) a propósito:
 * quien llama necesita saber por qué no sirve para enseñar el mensaje correcto,
 * no un 404 seco. Para saber si vale, usar `enlaceUtilizable` de enlaces-tipos.
 */
export async function buscarEnlace(token: string): Promise<EnlaceConvenio | null> {
  if (!token) return null;
  const sql = getSql();
  const filas = (await sql`
    select * from enlaces_convenio where token = ${token} limit 1
  `) as FilaEnlace[];

  return filas.length ? mapear(filas[0]) : null;
}

/** Todos los enlaces, el más reciente primero (pantalla interna de seguimiento). */
export async function listarEnlaces(limite = 200): Promise<EnlaceConvenio[]> {
  const sql = getSql();
  const filas = (await sql`
    select * from enlaces_convenio
     order by creado_en desc
     limit ${limite}
  `) as FilaEnlace[];

  return filas.map(mapear);
}
