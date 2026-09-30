// ═══════════════════════════════════════════════════════════════════════
// Aplica los .sql de db/ a la base de datos de DATABASE_URL
// ═══════════════════════════════════════════════════════════════════════
//
//   pnpm db:migrar
//
// Los archivos se aplican en orden alfabético (por eso van numerados: 001-, 002-…)
// y están escritos para poder relanzarse sin romper nada (`create ... if not exists`),
// así que ejecutar esto dos veces es inofensivo.
//
// Es deliberadamente tonto: no lleva tabla de migraciones aplicadas. Con un puñado
// de archivos idempotentes no hace falta; si algún día hay migraciones destructivas
// (drop / alter con pérdida), habrá que añadirla.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

/**
 * Parte un .sql en sentencias por el `;` de primer nivel.
 *
 * No vale un `split(';')` a secas: un `;` dentro de una cadena o de un comentario
 * partiría la sentencia por la mitad. Esto recorre el texto llevando la cuenta de
 * si está dentro de '…' (con '' como escape), de -- comentario o de un /* bloque *​/.
 */
function partirEnSentencias(sql) {
  const trozos = [];
  let actual = '';
  let enCadena = false;
  let enLinea = false;
  let enBloque = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const sig = sql[i + 1];

    if (enLinea) {
      actual += c;
      if (c === '\n') enLinea = false;
      continue;
    }
    if (enBloque) {
      actual += c;
      if (c === '*' && sig === '/') { actual += sig; i++; enBloque = false; }
      continue;
    }
    if (enCadena) {
      actual += c;
      if (c === "'") {
        if (sig === "'") { actual += sig; i++; } // '' escapada, sigue dentro
        else enCadena = false;
      }
      continue;
    }
    if (c === '-' && sig === '-') { actual += c + sig; i++; enLinea = true; continue; }
    if (c === '/' && sig === '*') { actual += c + sig; i++; enBloque = true; continue; }
    if (c === "'") { actual += c; enCadena = true; continue; }
    if (c === ';') { trozos.push(actual); actual = ''; continue; }
    actual += c;
  }
  trozos.push(actual);

  // Descarta lo que, quitados los comentarios, no tenga nada ejecutable
  // (típicamente la cabecera del archivo y la cola tras el último `;`).
  const sinComentarios = (t) =>
    t.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

  return trozos.map((t) => t.trim()).filter((t) => t && sinComentarios(t));
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = join(raiz, 'db');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✖ Falta DATABASE_URL. Se lee del .env (el script usa --env-file).');
  process.exit(1);
}

const sql = neon(url);
const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();

if (!archivos.length) {
  console.log('No hay archivos .sql en db/.');
  process.exit(0);
}

for (const archivo of archivos) {
  const sentencias = partirEnSentencias(readFileSync(join(carpeta, archivo), 'utf8'));
  process.stdout.write(`→ ${archivo} (${sentencias.length} sentencias) … `);
  try {
    // Neon por HTTP rechaza varias sentencias en una llamada ("cannot insert multiple
    // commands into a prepared statement"), así que van de una en una.
    // sql.query() manda el texto tal cual: es lo que necesita el DDL, que no lleva parámetros.
    for (const sentencia of sentencias) await sql.query(sentencia);
    console.log('ok');
  } catch (e) {
    console.log('ERROR');
    console.error(`\n✖ ${archivo}: ${e.message}\n`);
    process.exit(1);
  }
}

console.log('\n✔ Base de datos al día.');
