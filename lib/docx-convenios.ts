// ═══════════════════════════════════════════════════════════════════════
// MOTOR DE RELLENO DE CONVENIOS (sin IA)
// ═══════════════════════════════════════════════════════════════════════
//
// Toma una plantilla .docx (con {{PLACEHOLDERS}}) + los datos del formulario
// + un logo opcional, y devuelve el .docx final como Blob.
//
// Diferencias respecto al motor de propuestas (app/page.tsx):
//   1. El nombre de empresa NO se pasa a mayúsculas (en convenios va dentro de
//      texto corrido legal: "...la empresa Acme Soluciones, S.L. acuerda...").
//   2. El importe en letras ({{IMPORTE_LETRAS}}) se GENERA aquí desde la cifra.
//   3. El logo se busca en CUALQUIER word/headerN.xml (en propuestas vivía solo
//      en header1; en los convenios vive en el header de portada, header2).
//
// Cuando se unifiquen ambos flujos, esta lógica puede ser la base común.
// ═══════════════════════════════════════════════════════════════════════

import JSZip from 'jszip';

// ─── Logo: caja máxima (igual que en propuestas) ───
const EMU_POR_CM = 914400 / 2.54;
export const LOGO_CAJA_W_EMU = Math.round(4.0 * EMU_POR_CM); // ≈ 1440945 (4 cm)
export const LOGO_CAJA_H_EMU = Math.round(1.5 * EMU_POR_CM); // ≈ 540354  (1,5 cm)

export type LogoData = {
  bytes: Uint8Array;
  ext: 'png' | 'jpg';
  w: number;
  h: number;
};

export type DatosConvenio = Record<string, string>; // keys camelCase del formulario

// ─── Utilidades ───
function xmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const camelToSnake = (s: string): string =>
  s.replace(/([A-Z])/g, '_$1').toUpperCase();

/**
 * Recompone placeholders que Word haya partido en varios runs.
 * Al editar a mano en Word, "{{COD_POSTAL}}" puede quedar como
 * "{{COD</w:t>...<w:t>_POSTAL}}" (texto roto por etiquetas XML). Esto
 * elimina las etiquetas que hayan quedado DENTRO de unas dobles llaves,
 * dejando el placeholder entero en un solo trozo para poder sustituirlo.
 * (Asume que las llaves de apertura/cierre no están partidas entre sí,
 * que es el caso habitual.)
 */
export function unirPlaceholders(xml: string): string {
  return xml.replace(/\{\{[^{}]*?\}\}/g, (m) => m.replace(/<[^>]+>/g, ''));
}

export function fitInBox(
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: boxW, h: boxH };
  const ratio = naturalW / naturalH;
  const boxRatio = boxW / boxH;
  if (ratio > boxRatio) return { w: boxW, h: Math.round(boxW / ratio) };
  return { w: Math.round(boxH * ratio), h: boxH };
}

// ─── Importe: parseo + número a letras (español, MAYÚSCULAS) ───
export function parseImporteNum(raw: string): number | null {
  if (!raw) return null;
  const sinSimbolos = String(raw).replace(/€|eur(os)?/gi, '').trim();
  const entero = sinSimbolos.split(',')[0].replace(/[.\s]/g, '');
  if (!/^\d+$/.test(entero)) return null;
  const n = parseInt(entero, 10);
  return Number.isFinite(n) ? n : null;
}

const UNI = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESP: Record<number, string> = {
  10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
  16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
  20: 'VEINTE', 21: 'VEINTIUNO', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO',
  25: 'VEINTICINCO', 26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE',
};
const DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function decenas(n: number): string {
  if (n < 10) return UNI[n];
  if (n < 30) return ESP[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DEC[d] : `${DEC[d]} Y ${UNI[u]}`;
}

function centenas(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const cen = c > 0 ? CEN[c] : '';
  const res = r > 0 ? decenas(r) : '';
  return [cen, res].filter(Boolean).join(' ');
}

/** Convierte 0..999.999 a su texto en español, en MAYÚSCULAS. */
export function numeroALetras(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 0 || n > 999999) return String(n); // fuera de rango: dejar la cifra
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles > 0) {
    if (miles === 1) partes.push('MIL');
    else {
      const m = centenas(miles).replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/\bUNO$/, 'UN');
      partes.push(`${m} MIL`);
    }
  }
  if (resto > 0) partes.push(centenas(resto));
  return partes.join(' ');
}

// ─── Inyección del logo en el header que contenga {{LOGO}} ───
async function inyectarLogo(zip: JSZip, logo: LogoData | null): Promise<void> {
  const headers = Object.keys(zip.files).filter((n) => /^word\/header\d+\.xml$/.test(n));

  // Limpia cualquier {{LOGO}} sobrante en todo word/*.xml (excepto el destino ya tratado).
  const limpiarTokens = async (excepto: string) => {
    const xmls = Object.keys(zip.files).filter((n) =>
      /^word\/(document|header\d+|footer\d+)\.xml$/.test(n),
    );
    for (const n of xmls) {
      if (n === excepto) continue;
      const f = zip.file(n);
      if (!f) continue;
      const c = await f.async('string');
      if (c.includes('{{LOGO}}')) zip.file(n, c.split('{{LOGO}}').join(''));
    }
  };

  // El logo solo se inserta automáticamente en un header (SOC/PAT/ENT). En LGD el
  // hueco vive en un cuadro de texto flotante del cuerpo; ahí NO inyectamos imagen
  // (rompería el documento): se deja el cuadro vacío para pegar el logo a mano.
  let targetName = '';
  let targetXml = '';
  if (logo) {
    for (const h of headers) {
      const c = await zip.file(h)!.async('string');
      if (c.includes('{{LOGO}}')) {
        targetName = h;
        targetXml = c;
        break;
      }
    }
  }

  // sin logo, o sin hueco en header (caso LGD): quitar todos los tokens y salir
  if (!logo || !targetName) {
    await limpiarTokens('');
    return;
  }

  // 1) media
  const mediaName = `logo_empresa.${logo.ext}`;
  zip.file(`word/media/${mediaName}`, logo.bytes);

  // 2) relationship en el .rels de ESE header
  const relPath = `word/_rels/${targetName.split('/').pop()}.rels`;
  let rels = '';
  const relFile = zip.file(relPath);
  if (relFile) rels = await relFile.async('string');
  else
    rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if (!rels.includes(mediaName)) {
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`,
    );
    zip.file(relPath, rels);
  }

  // 3) dibujo (con wp y r declarados inline → robusto en cualquier header)
  const { w: cx, h: cy } = fitInBox(logo.w, logo.h, LOGO_CAJA_W_EMU, LOGO_CAJA_H_EMU);
  const drawing =
    `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="101" name="LogoEmpresa"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="101" name="LogoEmpresa"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId99"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r>`;

  // reemplazar SOLO el primer run que contiene {{LOGO}} por el dibujo; luego
  // limpiar las copias restantes del token (p. ej. el respaldo VML de un cuadro de texto)
  let nuevo = targetXml.replace(
    /<w:r\b[^>]*>(?:(?!<\/w:r>).)*?\{\{LOGO\}\}[^<]*<\/w:t><\/w:r>/,
    drawing,
  );
  if (nuevo === targetXml) nuevo = targetXml.replace('{{LOGO}}', drawing);
  nuevo = nuevo.split('{{LOGO}}').join('');
  zip.file(targetName, nuevo);
  await limpiarTokens(targetName);

  // 4) content type
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  const mt = logo.ext === 'png' ? 'image/png' : 'image/jpeg';
  if (!ct.includes(`Extension="${logo.ext}"`)) {
    ct = ct.replace('</Types>', `<Default Extension="${logo.ext}" ContentType="${mt}"/></Types>`);
    zip.file('[Content_Types].xml', ct);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// API PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export async function rellenarConvenio(opts: {
  plantillaBytes: Uint8Array;
  datos: DatosConvenio;
  logo: LogoData | null;
}): Promise<Blob> {
  const { plantillaBytes, datos, logo } = opts;
  const zip = await JSZip.loadAsync(plantillaBytes);

  // ─── Importe (cifra formateada + letras) ───
  const impNum = parseImporteNum(datos.importe || '');
  const importeFmt = impNum !== null ? impNum.toLocaleString('es-ES') : (datos.importe || '').trim() || 'Por definir';
  const importeLetras = impNum !== null ? numeroALetras(impNum) : 'POR DEFINIR';

  // ─── Mapa de reemplazos {{SNAKE_CASE}} → valor ───
  const reemplazos: Record<string, string> = {
    '{{IMPORTE}}': xmlEscape(importeFmt),
    '{{IMPORTE_LETRAS}}': xmlEscape(importeLetras),
  };
  for (const [key, val] of Object.entries(datos)) {
    if (key === 'importe') continue; // gestionado arriba
    reemplazos[`{{${camelToSnake(key)}}}`] = xmlEscape((val || '').trim());
  }

  // ─── Aplicar a todos los XML bajo word/ (excepto _rels y media) ───
  const archivosXml = Object.keys(zip.files).filter(
    (n) =>
      n.startsWith('word/') &&
      n.endsWith('.xml') &&
      !n.includes('/_rels/') &&
      !n.includes('/media/'),
  );
  for (const nombreXml of archivosXml) {
    const original = await zip.file(nombreXml)!.async('string');
    let contenido = unirPlaceholders(original); // recompone los partidos por Word
    for (const [k, v] of Object.entries(reemplazos)) {
      if (contenido.includes(k)) contenido = contenido.split(k).join(v);
    }
    if (contenido !== original) zip.file(nombreXml, contenido);
  }

  // ─── Logo en el header de portada ───
  await inyectarLogo(zip, logo);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Nombre de archivo de descarga, p.ej. "SOC-01_Acme_Soluciones.docx". */
export function nombreArchivoConvenio(codigo: string, nombreEmpresa: string): string {
  const limpio = (nombreEmpresa || 'empresa')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return `${codigo}_${limpio}.docx`;
}