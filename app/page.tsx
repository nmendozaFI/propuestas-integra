'use client';

import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  TIPOS_PROPUESTA,
  TIPOS_PROPUESTA_LIST,
  type TipoPropuestaId,
  type CampoConfig,
} from '@/lib/tipos-propuesta';

// ═══════════════════════════════════════════════════════════════════════
// TIPOS LOCALES
// ═══════════════════════════════════════════════════════════════════════
type LineaKey =
  | 'reclutamiento'
  | 'lgd'
  | 'voluntariado'
  | 'sensibilizacion'
  | 'comunicacion'
  | 'esg';

type DatosGeneracion = {
  nombre: string;
  sector: string;
  tamano: string;
  historial: string;
  valores: string;
  contexto: string;
  importe: string;
  via: string;
  lineas: string[];
  tipo: TipoPropuestaId;
  // Valores de campos extra para tipos sin IA (lgd, empleo-sin-barreras)
  extras: Record<string, string>;
};

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════
const LINEAS_MAP: Record<LineaKey, string> = {
  reclutamiento: 'Reclutamiento e inserción laboral de personas vulnerables',
  lgd: 'Consultoría y cumplimiento de la LGD (Ley General de Discapacidad)',
  voluntariado: 'Voluntariado corporativo con beneficiarios de la Fundación',
  sensibilizacion: 'Jornadas de sensibilización y transformación cultural',
  comunicacion: 'Acciones de comunicación y refuerzo de imagen de marca',
  esg: 'Informe anual de huella social ESG',
};

const LINEAS_LIST: { key: LineaKey; label: string; default: boolean }[] = [
  { key: 'reclutamiento', label: 'Reclutamiento e inserción laboral', default: true },
  { key: 'lgd', label: 'Consultoría LGD', default: true },
  { key: 'voluntariado', label: 'Voluntariado corporativo', default: false },
  { key: 'sensibilizacion', label: 'Jornadas de sensibilización', default: false },
  { key: 'comunicacion', label: 'Comunicación y marca', default: false },
  { key: 'esg', label: 'Informe huella social ESG', default: false },
];

const PASSWORD_STORAGE_KEY = 'integra_app_password';

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════
function xmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizarImporte(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/€|eur|euro/i.test(s)) return s;
  if (/^[\d.,\s]+$/.test(s)) return s.trim() + '€';
  return s;
}

/**
 * Parser de markdown-style negritas para inyectar en Word.
 * Solo usado por el tipo 'socios' (los demás tipos no llaman a IA).
 */
function buildRunsConNegritas(texto: string, propsBase: string): string {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return partes
    .map((parte, i) => {
      if (!parte) return '';
      const isBold = i % 2 === 1;
      const rPr = isBold ? `${propsBase}<w:b/><w:bCs/>` : propsBase;
      return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlEscape(parte)}</w:t></w:r>`;
    })
    .join('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function Home() {
  // ── Auth gate ──
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // ── Datos formulario (clásico, solo se usa para 'socios') ──
  const [tipo, setTipo] = useState<TipoPropuestaId>('socios');
  const [nombre, setNombre] = useState('');
  const [sector, setSector] = useState('');
  const [tamano, setTamano] = useState('');
  const [historial, setHistorial] = useState('');
  const [valores, setValores] = useState('');
  const [contexto, setContexto] = useState('');
  const [importe, setImporte] = useState('');
  const [via, setVia] = useState('Donación directa');
  const [lineasState, setLineasState] = useState<Record<LineaKey, boolean>>(() => {
    const init = {} as Record<LineaKey, boolean>;
    LINEAS_LIST.forEach((l) => (init[l.key] = l.default));
    return init;
  });

  // ── Estado para campos dinámicos (tipos sin IA: lgd, empleo-sin-barreras) ──
  const [valoresExtra, setValoresExtra] = useState<Record<string, string>>({});

  // ── Logo ──
  const [logoBytes, setLogoBytes] = useState<Uint8Array | null>(null);
  const [logoExt, setLogoExt] = useState<'png' | 'jpg' | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>('');
  const [logoFilename, setLogoFilename] = useState<string>('');

  // ── Estado generación ──
  const [plantillasCache, setPlantillasCache] = useState<Record<string, Uint8Array>>({});
  const [plantillaError, setPlantillaError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [textoGenerado, setTextoGenerado] = useState('');
  const [datosUltima, setDatosUltima] = useState<DatosGeneracion | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copiar solo el texto');

  const resultRef = useRef<HTMLDivElement>(null);

  // Tipo activo y si usa IA
  const tipoConfig = TIPOS_PROPUESTA[tipo];
  const usaIA = tipoConfig.usaIA;

  // ─────────────────────────────────────────────────────────────────
  // EFECTO: Verificar contraseña guardada al cargar
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = localStorage.getItem(PASSWORD_STORAGE_KEY);
      if (!saved) {
        if (!cancelled) setAuthed(false);
        return;
      }
      try {
        const res = await fetch('/api/verificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: saved }),
        });
        if (cancelled) return;
        if (res.ok) setAuthed(true);
        else {
          localStorage.removeItem(PASSWORD_STORAGE_KEY);
          setAuthed(false);
        }
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // EFECTO: Precargar plantilla del tipo activo
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    const ruta = tipoConfig.plantilla;
    if (plantillasCache[ruta]) return;
    (async () => {
      try {
        const res = await fetch(ruta);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        setPlantillasCache((prev) => ({ ...prev, [ruta]: new Uint8Array(buf) }));
        setPlantillaError('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPlantillaError(`No se pudo cargar la plantilla (${ruta}): ${msg}`);
      }
    })();
  }, [authed, tipoConfig.plantilla, plantillasCache]);

  // ─────────────────────────────────────────────────────────────────
  // EFECTO: cuando cambia el tipo, limpiar estado intermedio
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setTextoGenerado('');
    setDatosUltima(null);
    setError('');
  }, [tipo]);

  // ─────────────────────────────────────────────────────────────────
  // HANDLERS: Auth
  // ─────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch('/api/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        localStorage.setItem(PASSWORD_STORAGE_KEY, passwordInput);
        setAuthed(true);
      } else setAuthError('Contraseña incorrecta');
    } catch {
      setAuthError('Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setAuthed(false);
    setPasswordInput('');
  }

  // ─────────────────────────────────────────────────────────────────
  // HANDLERS: Logo
  // ─────────────────────────────────────────────────────────────────
  async function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const name = (file.name || '').toLowerCase();
    const isPng = file.type === 'image/png' || name.endsWith('.png');
    const isJpg =
      file.type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg');
    const isSvg = file.type === 'image/svg+xml' || name.endsWith('.svg');
    if (!isPng && !isJpg && !isSvg) {
      setError('Formato no soportado. Usa PNG, JPG o SVG.');
      event.target.value = '';
      return;
    }
    try {
      let bytes: Uint8Array;
      let ext: 'png' | 'jpg';
      if (isSvg) {
        const svgText = await file.text();
        bytes = await svgToPngBytes(svgText);
        ext = 'png';
      } else {
        const buf = await file.arrayBuffer();
        bytes = new Uint8Array(buf);
        ext = isPng ? 'png' : 'jpg';
      }
      setLogoBytes(bytes);
      setLogoExt(ext);
      setLogoFilename(file.name);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: ext === 'png' ? 'image/png' : 'image/jpeg',
      });
      setLogoPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudo leer la imagen: ${msg}`);
      removeLogo();
    }
  }

  function removeLogo() {
    setLogoBytes(null);
    setLogoExt(null);
    setLogoPreviewUrl('');
    setLogoFilename('');
    const input = document.getElementById('f-logo') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function svgToPngBytes(svgText: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const maxW = 600;
        const ratio = img.width && img.height ? img.height / img.width : 0.3;
        const w = img.width ? Math.min(img.width, maxW) : maxW;
        const h = Math.round(w * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('No se pudo crear canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(async (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error('No se pudo convertir SVG a PNG'));
            return;
          }
          const buf = await blob.arrayBuffer();
          resolve(new Uint8Array(buf));
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('SVG inválido'));
      };
      img.src = url;
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // HANDLER: Acción principal
  //
  // Para tipos con IA (socios) → llama a /api/generar, muestra el texto,
  // espera a que el usuario pulse "Descargar".
  // Para tipos sin IA (lgd, empleo-sin-barreras) → salta la IA y descarga
  // el Word directamente con los campos rellenados.
  // ─────────────────────────────────────────────────────────────────
  async function accionPrincipal() {
    // Validación de campos según el tipo
    if (usaIA) {
      // Tipo 'socios': mismas validaciones que antes
      const nombreT = nombre.trim();
      const sectorT = sector.trim();
      if (!nombreT || !sectorT) {
        setError('Por favor completa el nombre y el sector de la empresa.');
        return;
      }
    } else {
      // Validar todos los campos obligatorios declarados
      const faltantes = tipoConfig.campos
        .filter((c) => c.obligatorio && !(valoresExtra[c.key] || '').trim())
        .map((c) => c.label);
      if (faltantes.length > 0) {
        setError(`Faltan campos obligatorios: ${faltantes.join(', ')}.`);
        return;
      }
    }

    // Construir el snapshot de datos para 'datosUltima'
    let datos: DatosGeneracion;
    if (usaIA) {
      const lineas = LINEAS_LIST.filter((l) => lineasState[l.key]).map(
        (l) => LINEAS_MAP[l.key],
      );
      datos = {
        nombre: nombre.trim(),
        sector: sector.trim(),
        tamano,
        historial,
        valores: valores.trim(),
        contexto: contexto.trim(),
        importe: importe.trim(),
        via,
        lineas,
        tipo,
        extras: {},
      };
    } else {
      // Tipos sin IA: el "nombre" sale de valoresExtra.nombre, el importe de extras.importe, etc.
      datos = {
        nombre: (valoresExtra.nombre || '').trim(),
        sector: '',
        tamano: '',
        historial: '',
        valores: '',
        contexto: '',
        importe: (valoresExtra.importe || '').trim(),
        via: '',
        lineas: [],
        tipo,
        extras: valoresExtra,
      };
    }

    setDatosUltima(datos);
    setError('');

    if (!usaIA) {
      // No IA: descarga directa
      await descargarWord(datos);
      return;
    }

    // Sí IA: pedir texto a /api/generar
    setLoading(true);
    try {
      const password = localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
      const res = await fetch('/api/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': password },
        body: JSON.stringify(datos),
      });
      if (res.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        setAuthed(false);
        setError('Sesión expirada. Vuelve a introducir la contraseña.');
        return;
      }
      if (!res.ok) {
        const errJson: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const { texto } = (await res.json()) as { texto: string };
      setTextoGenerado(texto.trim());
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ Error al generar la propuesta: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // HANDLER: Descargar Word
  //
  // Si se pasa `datosOverride` se usan esos datos (caso de tipos sin IA
  // que invocan descarga directamente sin haber poblado `datosUltima`).
  // Si no, se usan `datosUltima` (caso clásico de 'socios').
  // ─────────────────────────────────────────────────────────────────
  async function descargarWord(datosOverride?: DatosGeneracion) {
    const d = datosOverride ?? datosUltima;
    if (!d) {
      setError('Faltan datos. Pulsa el botón principal primero.');
      return;
    }
    // Para tipos con IA, exigimos texto generado. Para los demás, no.
    const tipoCfg = TIPOS_PROPUESTA[d.tipo];
    if (tipoCfg.usaIA && !textoGenerado) {
      setError('Falta el texto generado. Pulsa "Generar propuesta" primero.');
      return;
    }

    const rutaPlantilla = tipoCfg.plantilla;
    let plantillaBytes = plantillasCache[rutaPlantilla];
    if (!plantillaBytes) {
      try {
        const resP = await fetch(rutaPlantilla);
        if (!resP.ok) throw new Error(`HTTP ${resP.status}`);
        const buf = await resP.arrayBuffer();
        plantillaBytes = new Uint8Array(buf);
        setPlantillasCache((prev) => ({ ...prev, [rutaPlantilla]: plantillaBytes! }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo cargar la plantilla: ${msg}`);
        return;
      }
    }

    setDownloading(true);
    setError('');
    try {
      const zip = await JSZip.loadAsync(plantillaBytes);
      let xml = await zip.file('word/document.xml')!.async('string');

      const mesNombre = new Date()
        .toLocaleDateString('es-ES', { month: 'long' })
        .toUpperCase();
      const fecha = `${mesNombre} ${new Date().getFullYear()}`;

      const importeFmt = normalizarImporte(d.importe) || 'Por definir';
      const viaFmt = d.via || 'Por definir';

      // Reemplazos básicos (existen en todas las plantillas o se ignoran si no)
      xml = xml.split('{{FECHA}}').join(xmlEscape(fecha));
      xml = xml.split('{{NOMBRE_EMPRESA}}').join(xmlEscape(d.nombre.toUpperCase()));
      xml = xml.split('{{SECTOR}}').join(xmlEscape(d.sector));
      xml = xml.split('{{IMPORTE}}').join(xmlEscape(importeFmt));
      xml = xml.split('{{IMPORTE_CUERPO}}').join(xmlEscape(importeFmt));
      xml = xml.split('{{VIA}}').join(xmlEscape(viaFmt));
      xml = xml.split('{{VIA_CUERPO}}').join(xmlEscape(viaFmt));

      // ─── Placeholders extra de tipos sin IA ───
      // Convención: key del campo → placeholder en MAYÚSCULAS.
      // duracion → {{DURACION}}, fechaInicio → {{FECHA_INICIO}}, numBeneficiarios → {{NUM_BENEFICIARIOS}}
      const camelToSnake = (s: string) =>
        s.replace(/([A-Z])/g, '_$1').toUpperCase();
      for (const [key, val] of Object.entries(d.extras || {})) {
        // 'nombre' e 'importe' ya están cubiertos arriba — los saltamos
        if (key === 'nombre' || key === 'importe') continue;
        const placeholder = `{{${camelToSnake(key)}}}`;
        xml = xml.split(placeholder).join(xmlEscape(val));
      }

      // ─── TEXTO_OBJETIVO con soporte de **negritas** (solo si usa IA) ───
      if (tipoCfg.usaIA) {
        const objProps =
          '<w:rFonts w:ascii="Calibri Light" w:cs="Calibri Light" w:eastAsia="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="1a1a1a"/><w:sz w:val="22"/>';
        const objPara =
          '<w:spacing w:after="160" w:line="300" w:lineRule="auto"/><w:jc w:val="both"/>';
        const parrafos = String(textoGenerado)
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);

        let textoObjetivoXml = '';
        parrafos.forEach((p, i) => {
          const runs = buildRunsConNegritas(p, objProps);
          if (i === 0) textoObjetivoXml += `</w:t></w:r>${runs}`;
          else textoObjetivoXml += `</w:p><w:p><w:pPr>${objPara}</w:pPr>${runs}`;
        });
        if (parrafos.length > 1) {
          textoObjetivoXml += `<w:r><w:rPr>${objProps}</w:rPr><w:t xml:space="preserve">`;
        }
        if (parrafos.length === 0) textoObjetivoXml = '';
        xml = xml.split('{{TEXTO_OBJETIVO}}').join(textoObjetivoXml);

        // ─── LINEAS ───
        const linProps =
          '<w:rFonts w:ascii="Calibri Light" w:cs="Calibri Light" w:eastAsia="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="1a1a1a"/><w:sz w:val="22"/>';
        const linPara =
          '<w:spacing w:after="100" w:line="280" w:lineRule="auto"/><w:ind w:left="360" w:hanging="200"/>';
        const lineasXml = d.lineas
          .map((l, i) =>
            i === 0
              ? xmlEscape(l)
              : `</w:t></w:r></w:p><w:p><w:pPr>${linPara}</w:pPr><w:r><w:rPr><w:b/><w:color w:val="C73E3A"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">• </w:t></w:r><w:r><w:rPr>${linProps}</w:rPr><w:t xml:space="preserve">${xmlEscape(l)}`,
          )
          .join('');
        xml = xml.split('{{LINEAS}}').join(lineasXml);
      }

      zip.file('word/document.xml', xml);

      // ─── Logo de empresa en el header ───
      let header = await zip.file('word/header1.xml')!.async('string');

      if (logoBytes && logoExt) {
        const logoMediaFilename = `logo_empresa.${logoExt}`;
        zip.file(`word/media/${logoMediaFilename}`, logoBytes);

        let rels = await zip.file('word/_rels/header1.xml.rels')!.async('string');
        if (!rels.includes(logoMediaFilename)) {
          rels = rels.replace(
            '</Relationships>',
            `  <Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${logoMediaFilename}"/>\n</Relationships>`,
          );
          zip.file('word/_rels/header1.xml.rels', rels);
        }

        const cx = 1524000;
        const cy = 457200;
        const drawingXml = `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="101" name="LogoEmpresa"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="101" name="LogoEmpresa"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId99"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

        header = header.replace(
          /<w:r>(?:(?!<\/w:r>).)*?\{\{LOGO\}\}[^<]*<\/w:t><\/w:r>/,
          drawingXml,
        );

        let ct = await zip.file('[Content_Types].xml')!.async('string');
        const mimeForExt: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
        };
        const mt = mimeForExt[logoExt];
        if (mt && !ct.includes(`Extension="${logoExt}"`)) {
          ct = ct.replace(
            '</Types>',
            `<Default Extension="${logoExt}" ContentType="${mt}"/></Types>`,
          );
          zip.file('[Content_Types].xml', ct);
        }
      } else {
        header = header.split('{{LOGO}}').join('');
      }

      zip.file('word/header1.xml', header);

      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const nombreArchivo = `Propuesta_Integra_${d.nombre.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}.docx`;
      saveAs(blob, nombreArchivo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ Error al generar el Word: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }

  function copiarTexto() {
    navigator.clipboard.writeText(textoGenerado).then(() => {
      setCopyLabel('¡Copiado!');
      setTimeout(() => setCopyLabel('Copiar solo el texto'), 2000);
    });
  }

  function toggleLinea(key: LineaKey) {
    setLineasState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setExtra(key: string, val: string) {
    setValoresExtra((prev) => ({ ...prev, [key]: val }));
  }

  const plantillaActivaLista = !!plantillasCache[tipoConfig.plantilla];

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: pantalla de carga inicial
  // ═══════════════════════════════════════════════════════════════════
  if (authed === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div className="spinner-ring" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: login gate
  // ═══════════════════════════════════════════════════════════════════
  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-box" onSubmit={handleLogin}>
          <div className="login-logo">
            <div className="icon-box">
              <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <span>Fundación Íntegra</span>
          </div>
          <h2>Generador de propuestas</h2>
          <p className="login-sub">Introduce la contraseña del equipo de alianzas.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Contraseña"
            autoFocus
          />
          {authError && <div className="login-error">{authError}</div>}
          <button type="submit" disabled={authLoading || !passwordInput}>
            {authLoading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: app principal
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            <div className="icon-box">
              <svg viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <span>
              Fundación
              <br />
              Íntegra
            </span>
          </div>
          <h2 style={{ marginTop: '2rem' }}>Generador de propuestas</h2>
          <p style={{ marginTop: '.75rem' }}>
            Rellena los datos, sube el logo de la empresa y descarga la propuesta en Word
            lista para enviar.
          </p>
        </div>

        <div>
          <p className="step-label">Cómo funciona</p>
          <div className="step-list">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-text">
                <strong>Elige el tipo</strong> y rellena los datos.
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-text">
                <strong>Sube el logo</strong> de la empresa (opcional).
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-text">
                <strong>{usaIA ? 'Genera' : 'Pulsa "Descargar"'}</strong>{' '}
                {usaIA ? '→ la IA redacta la portada.' : '→ se rellena la plantilla.'}
              </div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div className="step-text">
                <strong>Descarga el Word</strong> completo.
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            Cerrar sesión
          </button>
          <p>Equipo de Alianzas · Fundación Íntegra</p>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="section-head">
          <div className="dot" />
          <h3>Tipo de propuesta</h3>
        </div>
        <div className="tipo-tabs">
          {TIPOS_PROPUESTA_LIST.map((t) => (
            <button
              key={t.id}
              className={`tipo-tab ${tipo === t.id ? 'active' : ''}`}
              onClick={() => setTipo(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            RAMA A: tipos que usan IA (socios) — form clásico completo
            ════════════════════════════════════════════════════════ */}
        {usaIA && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Datos de la empresa</h3>
            </div>
            <div className="card">
              <div className="grid2">
                <div className="field">
                  <label>Nombre de la empresa *</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Deloitte España"
                  />
                </div>
                <div className="field">
                  <label>Sector *</label>
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder="Ej: Consultoría financiera"
                  />
                </div>
              </div>
              <div className="grid2" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>Tamaño aproximado</label>
                  <select value={tamano} onChange={(e) => setTamano(e.target.value)}>
                    <option value="">— Sin especificar —</option>
                    <option>Pyme (hasta 50 personas)</option>
                    <option>Mediana (50–250 personas)</option>
                    <option>Grande (250–1000 personas)</option>
                    <option>Corporación (+1000 personas)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Historial con Íntegra</label>
                  <select value={historial} onChange={(e) => setHistorial(e.target.value)}>
                    <option value="">Sin historial previo</option>
                    <option>Contacto inicial reciente</option>
                    <option>Ex socio / colaborador</option>
                    <option>Socio activo en renovación</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>
                  Valores RSC / enfoque ESG{' '}
                  <span style={{ fontWeight: 300, opacity: 0.7 }}>(si los conoces)</span>
                </label>
                <textarea
                  value={valores}
                  onChange={(e) => setValores(e.target.value)}
                  placeholder="Ej: Firmantes del Pacto Mundial, tienen plan de diversidad, objetivos de contratación inclusiva..."
                />
              </div>
              <div className="field">
                <label>Contexto del contacto / motivación</label>
                <textarea
                  value={contexto}
                  onChange={(e) => setContexto(e.target.value)}
                  placeholder="Ej: Nos contactaron por la LGD, necesitan certificado antes de junio, interés en voluntariado corporativo..."
                />
              </div>
            </div>

            <div className="section-head">
              <div className="dot" />
              <h3>Líneas de colaboración a destacar</h3>
            </div>
            <div className="card">
              <div className="lineas-grid">
                {LINEAS_LIST.map((l) => (
                  <label
                    key={l.key}
                    className={`linea-item ${lineasState[l.key] ? 'on' : ''}`}
                    onClick={() => toggleLinea(l.key)}
                  >
                    <div className="linea-check" />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="section-head">
              <div className="dot" />
              <h3>Presupuesto orientativo (opcional)</h3>
            </div>
            <div className="card">
              <div className="grid2">
                <div className="field">
                  <label>Importe (€)</label>
                  <input
                    type="text"
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                    placeholder="Ej: 10.000 · el € se añade solo"
                  />
                </div>
                <div className="field">
                  <label>Vía de financiación</label>
                  <select value={via} onChange={(e) => setVia(e.target.value)}>
                    <option>Donación directa</option>
                    <option>Fondos LGD</option>
                    <option>Presupuesto RSC</option>
                    <option>Por definir</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            RAMA B: tipos sin IA (lgd, empleo-sin-barreras) — form mínimo
            ════════════════════════════════════════════════════════ */}
        {!usaIA && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Datos para la plantilla</h3>
            </div>
            <div className="card">
              <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
                Esta propuesta usa una plantilla fija con texto predefinido. Solo necesitas
                rellenar los siguientes datos:
              </p>
              <CamposDinamicos
                campos={tipoConfig.campos}
                valores={valoresExtra}
                onChange={setExtra}
              />
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            LOGO — común a todos los tipos
            ════════════════════════════════════════════════════════ */}
        <div className="section-head">
          <div className="dot" />
          <h3>Logo de la empresa (opcional)</h3>
        </div>
        <div className="card">
          <div className="field" style={{ margin: 0 }}>
            <label>Sube el logo (PNG, JPG o SVG · recomendado fondo transparente)</label>
            <div className="logo-upload-row">
              <label htmlFor="f-logo" className="logo-upload-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>{logoBytes ? 'Cambiar archivo' : 'Seleccionar archivo'}</span>
              </label>
              <input
                type="file"
                id="f-logo"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={handleLogoFile}
              />
              {logoPreviewUrl && (
                <div className="logo-preview-box">
                  <img src={logoPreviewUrl} alt="Logo" />
                  <button type="button" className="logo-remove" onClick={removeLogo}>
                    ×
                  </button>
                </div>
              )}
            </div>
            <p className="logo-help">
              {logoBytes
                ? `Logo cargado (${logoFilename}). Aparecerá en el header del documento.`
                : 'Si no subes logo, el hueco quedará en blanco para añadirlo a mano después.'}
            </p>
          </div>
        </div>

        {plantillaError && <div className="error-bar on">⚠️ {plantillaError}</div>}
        {error && <div className="error-bar on">{error}</div>}

        <button
          className="btn-generate"
          onClick={accionPrincipal}
          disabled={loading || downloading || !plantillaActivaLista}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          {usaIA
            ? 'Generar propuesta completa'
            : downloading
            ? 'Generando Word…'
            : 'Generar y descargar Word'}
        </button>

        {loading && (
          <div className="loader">
            <div className="spinner-ring" />
            <p>Redactando propuesta personalizada…</p>
          </div>
        )}

        {/* Bloque resultado: solo para tipos con IA */}
        {usaIA && textoGenerado && (
          <div ref={resultRef} className="result-section">
            <div className="result-top">
              <h2>Propuesta para {datosUltima?.nombre}</h2>
              <p>Revisa el texto generado y descarga el Word completo.</p>
            </div>

            <div className="proposal-block">
              <h4>Texto generado para la portada — {datosUltima?.nombre}</h4>
              <div className="proposal-content">{textoGenerado}</div>
            </div>

            <div className="action-row">
              <button
                className="btn-action primary"
                onClick={() => descargarWord()}
                disabled={downloading}
              >
                {downloading ? 'Generando Word…' : 'Descargar Word completo'}
              </button>
              <button className="btn-action" onClick={copiarTexto}>
                {copyLabel}
              </button>
              <button className="btn-action" onClick={accionPrincipal}>
                Regenerar
              </button>
            </div>

            <div className="info-callout">
              <strong>Ya casi</strong> — Descarga el Word, revisa que todo esté correcto,
              guárdalo como PDF y envíalo.{' '}
              {logoBytes
                ? 'El logo de la empresa ya viene integrado.'
                : 'Recuerda añadir el logo de la empresa a mano antes de enviar.'}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: form dinámico a partir de la declaración de campos
// ═══════════════════════════════════════════════════════════════════════
function CamposDinamicos({
  campos,
  valores,
  onChange,
}: {
  campos: CampoConfig[];
  valores: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  // Renderizamos en pares cuando son 'medio' consecutivos para mantener el grid2 del estilo actual.
  // Lógica simple: agrupamos los campos en filas. Un campo 'completo' ocupa fila entera.
  const filas: CampoConfig[][] = [];
  let pendiente: CampoConfig | null = null;
  for (const c of campos) {
    const ancho = c.ancho ?? 'medio';
    if (ancho === 'completo') {
      if (pendiente) {
        filas.push([pendiente]);
        pendiente = null;
      }
      filas.push([c]);
    } else {
      if (pendiente) {
        filas.push([pendiente, c]);
        pendiente = null;
      } else {
        pendiente = c;
      }
    }
  }
  if (pendiente) filas.push([pendiente]);

  return (
    <>
      {filas.map((fila, idx) => (
        <div
          key={idx}
          className={fila.length === 2 ? 'grid2' : ''}
          style={idx > 0 ? { marginTop: 14 } : undefined}
        >
          {fila.map((c) => (
            <CampoRender
              key={c.key}
              campo={c}
              valor={valores[c.key] || ''}
              onChange={(v) => onChange(c.key, v)}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function CampoRender({
  campo,
  valor,
  onChange,
}: {
  campo: CampoConfig;
  valor: string;
  onChange: (v: string) => void;
}) {
  const label = campo.obligatorio ? `${campo.label} *` : campo.label;
  return (
    <div className="field">
      <label>{label}</label>
      {campo.tipo === 'textarea' ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      ) : campo.tipo === 'select' ? (
        <select value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Selecciona —</option>
          {(campo.opciones || []).map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      ) : (
        <input
          type={campo.tipo === 'number' ? 'number' : 'text'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      )}
      {campo.ayuda && (
        <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{campo.ayuda}</p>
      )}
    </div>
  );
}