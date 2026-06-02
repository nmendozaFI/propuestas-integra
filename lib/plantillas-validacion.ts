// ═══════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE PLANTILLAS — la "red de seguridad" de los {{placeholders}}
// ═══════════════════════════════════════════════════════════════════════
//
// Se ejecuta en LOS DOS lados (mismo código, sin divergencias):
//   - En el navegador: feedback instantáneo al soltar el .docx, antes de subir.
//   - En el servidor (/api/plantillas/subir): puerta real que autoriza la subida.
//
// Filosofía: validar por DIFF contra la versión actual ("baseline").
//   Regla → "tu nueva versión debe conservar los mismos {{placeholders}}
//   sustituibles que la que está viva ahora". Cero listas que mantener;
//   se adapta solo a medida que las plantillas evolucionan.
//
// CLAVE: el validador mira el documento con los MISMOS criterios que el
// motor de relleno (docx-convenios.ts / app/page.tsx). Por eso puede avisar
// del fallo silencioso "Word partió el placeholder y no se sustituirá".
// ═══════════════════════════════════════════════════════════════════════

import JSZip from 'jszip';

const RE_TOKEN = /\{\{([A-Z0-9_]+)\}\}/g;

// MISMA recomposición que usa el motor: une los {{...}} que Word haya partido
// en varios runs, SIEMPRE que las dos llaves de apertura/cierre estén pegadas.
// (Si Word parte también las llaves entre sí, el motor NO lo arregla → lo
// detectamos comparando con la vista "humana", ver `partidos` más abajo.)
function unirPlaceholders(xml: string): string {
  return xml.replace(/\{\{[^{}]*?\}\}/g, (m) => m.replace(/<[^>]+>/g, ''));
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, '');
}

function tokensDe(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(RE_TOKEN)) out.add(`{{${m[1]}}}`);
  return out;
}

export type AnalisisDocx = {
  // {{TOKEN}} que el MOTOR puede sustituir (su mismo criterio).
  engineTokens: Set<string>;
  // {{TOKEN}} tal y como los lee un humano (texto sin etiquetas XML).
  textTokens: Set<string>;
  // Tokens que se LEEN bien pero el motor NO sustituirá (Word partió las llaves).
  partidos: string[];
  // Fragmentos con llaves rotas / typos: "{{ NOMBRE }}", "{{nombre}}", "{NOMBRE}"…
  malformados: string[];
};

const ES_XML_WORD = (n: string) =>
  n.startsWith('word/') &&
  n.endsWith('.xml') &&
  !n.includes('/_rels/') &&
  !n.includes('/media/');

export async function analizarDocx(bytes: Uint8Array): Promise<AnalisisDocx> {
  const zip = await JSZip.loadAsync(bytes);
  const nombres = Object.keys(zip.files).filter(ES_XML_WORD);

  const engineTokens = new Set<string>();
  const textTokens = new Set<string>();
  const malformados = new Set<string>();

  for (const n of nombres) {
    const raw = await zip.file(n)!.async('string');

    // 1) Lo que el MOTOR ve (su recomposición sobre el XML con etiquetas).
    for (const t of tokensDe(unirPlaceholders(raw))) engineTokens.add(t);

    // 2) Lo que un HUMANO ve: al quitar TODAS las etiquetas, el texto se
    //    concatena entre runs. Reúne incluso llaves partidas por etiquetas
    //    que el motor NO sabe arreglar.
    const texto = stripTags(raw);
    for (const t of tokensDe(texto)) textTokens.add(t);

    // 3) Llaves rotas / typos: tras quitar los tokens VÁLIDOS, ¿queda alguna
    //    llave suelta? Si la hay, es un placeholder mal escrito.
    const resto = texto.replace(RE_TOKEN, '');
    if (/[{}]/.test(resto)) {
      const frags = resto.match(/.{0,12}[{}]+.{0,12}/g) || [];
      for (const f of frags) {
        const limpio = f.replace(/\s+/g, ' ').trim();
        if (limpio) malformados.add(limpio.slice(0, 60));
      }
    }
  }

  // Se leen bien pero el motor no los sustituirá (llaves partidas por etiquetas).
  const partidos = [...textTokens].filter((t) => !engineTokens.has(t));

  return { engineTokens, textTokens, partidos, malformados: [...malformados] };
}

// {{LOGO}} puede faltar sin romper nada: el motor simplemente no inserta logo
// (p. ej. la plantilla PRO no tiene hueco de logo).
export const OPCIONALES_GLOBALES = new Set<string>(['{{LOGO}}']);

export type MotivoFaltante = 'partido' | 'eliminado';
export type Faltante = { token: string; motivo: MotivoFaltante };

export type ResultadoValidacion = {
  ok: boolean; // false si hay ERRORES que deben bloquear la subida
  errores: string[]; // bloquean
  avisos: string[]; // no bloquean
  faltantes: Faltante[]; // requeridos del baseline que ya no se sustituirán
  nuevos: string[]; // tokens nuevos respecto al baseline
};

/**
 * Compara la plantilla recién subida contra la versión viva (baseline).
 * `baselineBytes` = bytes del .docx actualmente en uso (Cloudinary o, si aún
 * no hay override, el seed de /public).
 */
export async function validarSubida(opts: {
  nuevoBytes: Uint8Array;
  baselineBytes: Uint8Array;
}): Promise<ResultadoValidacion> {
  const [nuevo, base] = await Promise.all([
    analizarDocx(opts.nuevoBytes),
    analizarDocx(opts.baselineBytes),
  ]);

  const faltantes: Faltante[] = [];
  for (const t of base.engineTokens) {
    if (nuevo.engineTokens.has(t)) continue;
    if (OPCIONALES_GLOBALES.has(t)) continue; // puede faltar sin romper
    faltantes.push({ token: t, motivo: nuevo.textTokens.has(t) ? 'partido' : 'eliminado' });
  }

  const nuevos = [...nuevo.engineTokens].filter((t) => !base.engineTokens.has(t));

  const errores: string[] = [];
  const avisos: string[] = [];

  for (const f of faltantes) {
    if (f.motivo === 'partido') {
      errores.push(
        `El placeholder ${f.token} sigue en el documento, pero Word lo ha partido en trozos: ` +
          `el generador NO podrá rellenarlo. Bórralo y vuelve a escribirlo de una sola vez (sin dar formato letra a letra).`,
      );
    } else {
      errores.push(
        `Falta ${f.token}, que sí estaba en la versión actual. Si lo has quitado sin querer, vuelve a añadirlo tal cual.`,
      );
    }
  }

  for (const m of nuevo.malformados) {
    errores.push(
      `Llaves sospechosas o incompletas cerca de: "${m}". Un placeholder debe ser exactamente {{ASI_EN_MAYUSCULAS}}, sin espacios.`,
    );
  }

  for (const t of nuevos) {
    // OJO: un placeholder nuevo NO lo rellenará el generador hasta que se añada
    // un campo al formulario (cambio en tipos-*.ts → código). No bloquea la
    // subida, pero hay que avisar al responsable de la app.
    avisos.push(
      `⚠ Placeholder nuevo ${t}: el generador NO lo rellenará hasta que se añada un campo al formulario ` +
        `(requiere un cambio en la app). Avisa al responsable antes de usar esta plantilla en producción.`,
    );
  }

  return { ok: errores.length === 0, errores, avisos, faltantes, nuevos };
}