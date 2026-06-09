"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  TIPOS_PROPUESTA,
  TIPOS_PROPUESTA_LIST,
  LINEAS_LIST,
  type TipoPropuestaId,
  type LineaKey,
  type CampoConfig,
} from "@/lib/tipos-propuesta";
import { cargarPlantillaBytes } from "@/lib/plantillas-cliente";

// ═══════════════════════════════════════════════════════════════════════
// TIPOS LOCALES
// ═══════════════════════════════════════════════════════════════════════
type DatosGeneracion = {
  nombre: string;
  sector: string;
  tamano: string;
  historial: string;
  valores: string;
  contexto: string;
  importe: string;
  via: string;
  lineas: string[]; // frases canónicas de las líneas seleccionadas
  tipo: TipoPropuestaId;
  extras: Record<string, string>;
};

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════
const PASSWORD_STORAGE_KEY = "integra_app_password";

// Logo: caja máxima dentro de la cual el logo se encaja sin deformación.
// Unidades EMU (English Metric Units): 914400 EMU = 1 inch = 2.54 cm.
// 4cm × 1.5cm queda elegante, suficientemente visible y no compite con
// el logo de Íntegra que ya está en el header.
const EMU_POR_CM = 914400 / 2.54;
const LOGO_CAJA_W_EMU = Math.round(4.0 * EMU_POR_CM); // ≈ 1440945
const LOGO_CAJA_H_EMU = Math.round(1.5 * EMU_POR_CM); // ≈ 540354

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════
function xmlEscape(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizarImporte(raw?: string): string {
  if (!raw) return '';

  let s = String(raw).trim();
  if (!s) return '';

  const tieneEuro = /€|euros?/i.test(s);

  s = s
    .replace(/€/g, '')
    .replace(/euros?/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!s) return '';

  const ultimoPunto = s.lastIndexOf('.');
  const ultimaComa = s.lastIndexOf(',');

  let normalizado = s;

  if (ultimaComa > ultimoPunto) {
    normalizado = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > ultimaComa) {
    const decimales = s.length - ultimoPunto - 1;
    if (decimales === 3 && s.indexOf(',') === -1) {
      normalizado = s.replace(/\./g, '');
    } else {
      normalizado = s.replace(/,/g, '');
    }
  } else {
    normalizado = s.replace(/[.,]/g, '');
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return raw.trim();

  const tieneDecimales = !Number.isInteger(n);

  const formateado = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: tieneDecimales ? 2 : 0,
    maximumFractionDigits: tieneDecimales ? 2 : 2,
  }).format(n);

  return tieneEuro ? `${formateado} €` : formateado;
}

/**
 * Encaja un logo de dimensiones naturalW × naturalH dentro de una caja
 * boxW × boxH manteniendo proporciones. Devuelve las dimensiones finales
 * en las mismas unidades que la caja.
 */
function fitInBox(
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  if (!naturalW || !naturalH) return { w: boxW, h: boxH };
  const ratio = naturalW / naturalH;
  const boxRatio = boxW / boxH;
  if (ratio > boxRatio) {
    // Imagen más panorámica que la caja → ancho lleno, alto proporcional
    return { w: boxW, h: Math.round(boxW / ratio) };
  }
  // Imagen igual o más vertical → alto lleno, ancho proporcional
  return { w: Math.round(boxH * ratio), h: boxH };
}

/**
 * Parser de markdown-style negritas para inyectar en Word.
 * Solo usado por el tipo 'socios' (los demás tipos no llaman a IA).
 */
function buildRunsConNegritas(texto: string, propsBase: string): string {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return partes
    .map((parte, i) => {
      if (!parte) return "";
      const isBold = i % 2 === 1;
      const rPr = isBold ? `${propsBase}<w:b/><w:bCs/>` : propsBase;
      return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xmlEscape(parte)}</w:t></w:r>`;
    })
    .join("");
}

/**
 * Lee un archivo de imagen y devuelve sus bytes + las dimensiones naturales
 * para luego encajarlo proporcionalmente en el header.
 *
 * SVG: se rasteriza a PNG manteniendo el ancho original (máx 600px) y
 * se devuelven sus dimensiones rasterizadas.
 * PNG/JPG: se lee como bytes y se mide creando un Image temporal.
 */
async function leerLogoConDimensiones(
  file: File,
): Promise<{ bytes: Uint8Array; ext: "png" | "jpg"; w: number; h: number }> {
  const name = (file.name || "").toLowerCase();
  const isPng = file.type === "image/png" || name.endsWith(".png");
  const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");

  if (isSvg) {
    return rasterizarSvg(await file.text());
  }

  // PNG/JPG: leer bytes + medir dimensiones con un Image
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const ext: "png" | "jpg" = isPng ? "png" : "jpg";
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: ext === "png" ? "image/png" : "image/jpeg",
  });
  const url = URL.createObjectURL(blob);
  try {
    const dims = await medirImagen(url);
    return { bytes, ext, w: dims.w, h: dims.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function medirImagen(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error("No se pudo medir la imagen"));
    img.src = url;
  });
}

function rasterizarSvg(svgText: string): Promise<{
  bytes: Uint8Array;
  ext: "png";
  w: number;
  h: number;
}> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgText], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const maxW = 600;
      const naturalRatio = img.width && img.height ? img.width / img.height : 3;
      const w = img.width ? Math.min(img.width, maxW) : maxW;
      const h = Math.max(1, Math.round(w / naturalRatio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo crear canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(async (blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error("No se pudo convertir SVG a PNG"));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve({ bytes: new Uint8Array(buf), ext: "png", w, h });
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG inválido"));
    };
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function Home() {
  // ── Auth gate ──
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Datos formulario (clásico, solo se usa para 'socios') ──
  const [tipo, setTipo] = useState<TipoPropuestaId>("socios");
  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState("");
  const [tamano, setTamano] = useState("");
  const [historial, setHistorial] = useState("");
  const [valores, setValores] = useState("");
  const [contexto, setContexto] = useState("");
  const [importe, setImporte] = useState("");
  const [via, setVia] = useState("Donación directa");
  const [lineasState, setLineasState] = useState<Record<LineaKey, boolean>>(
    () => {
      const init = {} as Record<LineaKey, boolean>;
      LINEAS_LIST.forEach((l) => (init[l.key] = l.porDefecto));
      return init;
    },
  );

  // ── Campos dinámicos (tipos sin IA) ──
  const [valoresExtra, setValoresExtra] = useState<Record<string, string>>({});

  // ── Logo (ahora con dimensiones naturales para encajar sin deformación) ──
  const [logoBytes, setLogoBytes] = useState<Uint8Array | null>(null);
  const [logoExt, setLogoExt] = useState<"png" | "jpg" | null>(null);
  const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("");
  const [logoFilename, setLogoFilename] = useState<string>("");

  // ── Estado generación ──
  const [plantillasCache, setPlantillasCache] = useState<
    Record<string, Uint8Array>
  >({});
  const [plantillaError, setPlantillaError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [textoGenerado, setTextoGenerado] = useState("");
  const [datosUltima, setDatosUltima] = useState<DatosGeneracion | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copiar solo el texto");

  const resultRef = useRef<HTMLDivElement>(null);

  const tipoConfig = TIPOS_PROPUESTA[tipo];
  const usaIA = tipoConfig.usaIA;

  // ─────────────────────────────────────────────────────────────────
  // EFECTOS
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
        const res = await fetch("/api/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

  useEffect(() => {
    if (!authed) return;
    const ruta = tipoConfig.plantilla;
    if (plantillasCache[ruta]) return;
    (async () => {
      try {
        const bytes = await cargarPlantillaBytes(ruta);
        setPlantillasCache((prev) => ({ ...prev, [ruta]: bytes }));
        setPlantillaError("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPlantillaError(`No se pudo cargar la plantilla (${ruta}): ${msg}`);
      }
    })();
  }, [authed, tipoConfig.plantilla, plantillasCache]);

  useEffect(() => {
    setTextoGenerado("");
    setDatosUltima(null);
    setError("");
  }, [tipo]);

  // ─────────────────────────────────────────────────────────────────
  // HANDLERS: Auth
  // ─────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        localStorage.setItem(PASSWORD_STORAGE_KEY, passwordInput);
        setAuthed(true);
      } else setAuthError("Contraseña incorrecta");
    } catch {
      setAuthError("Error de conexión");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setAuthed(false);
    setPasswordInput("");
  }

  // ─────────────────────────────────────────────────────────────────
  // HANDLERS: Logo (ahora con medición de dimensiones)
  // ─────────────────────────────────────────────────────────────────
  async function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    const name = (file.name || "").toLowerCase();
    const isPng = file.type === "image/png" || name.endsWith(".png");
    const isJpg =
      file.type === "image/jpeg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg");
    const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
    if (!isPng && !isJpg && !isSvg) {
      setError("Formato no soportado. Usa PNG, JPG o SVG.");
      event.target.value = "";
      return;
    }
    try {
      const { bytes, ext, w, h } = await leerLogoConDimensiones(file);
      setLogoBytes(bytes);
      setLogoExt(ext);
      setLogoDims({ w, h });
      setLogoFilename(file.name);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: ext === "png" ? "image/png" : "image/jpeg",
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
    setLogoDims(null);
    setLogoPreviewUrl("");
    setLogoFilename("");
    const input = document.getElementById("f-logo") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  // ─────────────────────────────────────────────────────────────────
  // ACCIÓN PRINCIPAL
  // ─────────────────────────────────────────────────────────────────
  async function accionPrincipal() {
    if (usaIA) {
      const nombreT = nombre.trim();
      const sectorT = sector.trim();
      if (!nombreT || !sectorT) {
        setError("Por favor completa el nombre y el sector de la empresa.");
        return;
      }
    } else {
      const faltantes = tipoConfig.campos
        .filter((c) => c.obligatorio && !(valoresExtra[c.key] || "").trim())
        .map((c) => c.label);
      if (faltantes.length > 0) {
        setError(`Faltan campos obligatorios: ${faltantes.join(", ")}.`);
        return;
      }
    }

    let datos: DatosGeneracion;
    if (usaIA) {
      const lineas = LINEAS_LIST.filter((l) => lineasState[l.key]).map(
        (l) => l.frase,
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
      datos = {
        nombre: (valoresExtra.nombre || "").trim(),
        sector: "",
        tamano: "",
        historial: "",
        valores: "",
        contexto: "",
        importe: (valoresExtra.importe || "").trim(),
        via: "",
        lineas: [],
        tipo,
        extras: valoresExtra,
      };
    }

    setDatosUltima(datos);
    setError("");

    if (!usaIA) {
      await descargarWord(datos);
      return;
    }

    setLoading(true);
    try {
      const password = localStorage.getItem(PASSWORD_STORAGE_KEY) || "";
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-password": password,
        },
        body: JSON.stringify(datos),
      });
      if (res.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        setAuthed(false);
        setError("Sesión expirada. Vuelve a introducir la contraseña.");
        return;
      }
      if (!res.ok) {
        const errJson: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const { texto } = (await res.json()) as { texto: string };
      setTextoGenerado(texto.trim());
      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ Error al generar la propuesta: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // DESCARGAR WORD
  // ─────────────────────────────────────────────────────────────────
  async function descargarWord(datosOverride?: DatosGeneracion) {
    const d = datosOverride ?? datosUltima;
    if (!d) {
      setError("Faltan datos. Pulsa el botón principal primero.");
      return;
    }
    const tipoCfg = TIPOS_PROPUESTA[d.tipo];
    if (tipoCfg.usaIA && !textoGenerado) {
      setError('Falta el texto generado. Pulsa "Generar propuesta" primero.');
      return;
    }

    const rutaPlantilla = tipoCfg.plantilla;
    let plantillaBytes = plantillasCache[rutaPlantilla];
    if (!plantillaBytes) {
      try {
        plantillaBytes = await cargarPlantillaBytes(rutaPlantilla);
        setPlantillasCache((prev) => ({
          ...prev,
          [rutaPlantilla]: plantillaBytes!,
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo cargar la plantilla: ${msg}`);
        return;
      }
    }

    setDownloading(true);
    setError("");
    try {
      const zip = await JSZip.loadAsync(plantillaBytes);

      const mesNombre = new Date()
        .toLocaleDateString("es-ES", { month: "long" })
        .toUpperCase();
      const fecha = `${mesNombre} ${new Date().getFullYear()}`;

      const importeFmt = normalizarImporte(d.importe) || "Por definir";
      const viaFmt = d.via || "Por definir";

      // ─── Reemplazos básicos (string-to-string) ───
      // Operamos sobre TODOS los XML del directorio /word: document.xml,
      // header1.xml, footer1.xml, footer2.xml, etc. Esto permite que un
      // placeholder pueda vivir en cualquiera de esos archivos (por ejemplo,
      // {{FECHA_DOCUMENTO}} vive en footer1.xml en la plantilla ESB).
      // Los reemplazos especiales con XML inyectado (TEXTO_OBJETIVO, LINEAS,
      // LOGO) se gestionan después con su lógica propia.
      const camelToSnake = (s: string) =>
        s.replace(/([A-Z])/g, "_$1").toUpperCase();
      const reemplazosBasicos: Record<string, string> = {
        "{{FECHA}}": xmlEscape(fecha),
        "{{NOMBRE_EMPRESA}}": xmlEscape(d.nombre.toUpperCase()),
        "{{SECTOR}}": xmlEscape(d.sector),
        "{{IMPORTE}}": xmlEscape(importeFmt),
        "{{IMPORTE_CUERPO}}": xmlEscape(importeFmt),
        "{{VIA}}": xmlEscape(viaFmt),
        "{{VIA_CUERPO}}": xmlEscape(viaFmt),
      };
      // Placeholders extra de tipos sin IA (camelCase → SNAKE_CASE).
      // Ej: 'fechaDocumento' → {{FECHA_DOCUMENTO}}.
      for (const [key, val] of Object.entries(d.extras || {})) {
        if (key === "nombre" || key === "importe") continue;
        reemplazosBasicos[`{{${camelToSnake(key)}}}`] = xmlEscape(val);
      }

      // Aplicar a todos los XML del paquete bajo word/ (excepto los _rels y media)
      const archivosXml = Object.keys(zip.files).filter(
        (n) =>
          n.startsWith("word/") &&
          n.endsWith(".xml") &&
          !n.includes("/_rels/") &&
          !n.includes("/media/"),
      );
      for (const nombreXml of archivosXml) {
        let contenido = await zip.file(nombreXml)!.async("string");
        let modificado = false;
        for (const [k, v] of Object.entries(reemplazosBasicos)) {
          if (contenido.includes(k)) {
            contenido = contenido.split(k).join(v);
            modificado = true;
          }
        }
        if (modificado) zip.file(nombreXml, contenido);
      }

      // ─── Reemplazos especiales en document.xml ───
      // TEXTO_OBJETIVO y LINEAS solo existen en plantillas con IA y solo
      // tienen sentido inyectarlos como XML rico, no como texto plano.
      let xml = await zip.file("word/document.xml")!.async("string");

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

        let textoObjetivoXml = "";
        parrafos.forEach((p, i) => {
          const runs = buildRunsConNegritas(p, objProps);
          if (i === 0) textoObjetivoXml += `</w:t></w:r>${runs}`;
          else
            textoObjetivoXml += `</w:p><w:p><w:pPr>${objPara}</w:pPr>${runs}`;
        });
        if (parrafos.length > 1) {
          textoObjetivoXml += `<w:r><w:rPr>${objProps}</w:rPr><w:t xml:space="preserve">`;
        }
        if (parrafos.length === 0) textoObjetivoXml = "";
        xml = xml.split("{{TEXTO_OBJETIVO}}").join(textoObjetivoXml);

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
          .join("");
        xml = xml.split("{{LINEAS}}").join(lineasXml);
      }

      zip.file("word/document.xml", xml);

      // ─── Logo de empresa en el header (con encaje proporcional) ───
      let header = await zip.file("word/header1.xml")!.async("string");

      if (logoBytes && logoExt && logoDims) {
        const logoMediaFilename = `logo_empresa.${logoExt}`;
        zip.file(`word/media/${logoMediaFilename}`, logoBytes);

        let rels = await zip
          .file("word/_rels/header1.xml.rels")!
          .async("string");
        if (!rels.includes(logoMediaFilename)) {
          rels = rels.replace(
            "</Relationships>",
            `  <Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${logoMediaFilename}"/>\n</Relationships>`,
          );
          zip.file("word/_rels/header1.xml.rels", rels);
        }

        // CALCULAR TAMAÑO REAL: encajar las dimensiones naturales del logo
        // dentro de la caja máxima (4cm × 1.5cm) sin deformar.
        // Esto evita los logos estirados horizontalmente que aparecían
        // antes (caso Grupo Bimbo: ratio 2:1 forzado a ratio 10:3 = estirado).
        const { w: cx, h: cy } = fitInBox(
          logoDims.w,
          logoDims.h,
          LOGO_CAJA_W_EMU,
          LOGO_CAJA_H_EMU,
        );

        const drawingXml = `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="101" name="LogoEmpresa"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="101" name="LogoEmpresa"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId99"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

        header = header.replace(
          /<w:r>(?:(?!<\/w:r>).)*?\{\{LOGO\}\}[^<]*<\/w:t><\/w:r>/,
          drawingXml,
        );

        let ct = await zip.file("[Content_Types].xml")!.async("string");
        const mimeForExt: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
        };
        const mt = mimeForExt[logoExt];
        if (mt && !ct.includes(`Extension="${logoExt}"`)) {
          ct = ct.replace(
            "</Types>",
            `<Default Extension="${logoExt}" ContentType="${mt}"/></Types>`,
          );
          zip.file("[Content_Types].xml", ct);
        }
      } else {
        header = header.split("{{LOGO}}").join("");
      }

      zip.file("word/header1.xml", header);

      const blob = await zip.generateAsync({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const nombreArchivo = `Propuesta_Integra_${d.nombre.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "")}.docx`;
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
      setCopyLabel("¡Copiado!");
      setTimeout(() => setCopyLabel("Copiar solo el texto"), 2000);
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
  // RENDER: pantalla de carga
  // ═══════════════════════════════════════════════════════════════════
  if (authed === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div className="spinner-ring" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: login
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
          <p className="login-sub">
            Introduce la contraseña del equipo de alianzas.
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Contraseña"
            autoFocus
          />
          {authError && <div className="login-error">{authError}</div>}
          <button type="submit" disabled={authLoading || !passwordInput}>
            {authLoading ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: app
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="shell">
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
          <h2 style={{ marginTop: "2rem" }}>Generador de propuestas</h2>
          <p style={{ marginTop: ".75rem" }}>
            Rellena los datos, sube el logo de la empresa y descarga la
            propuesta en Word lista para enviar.
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
                <strong>{usaIA ? "Genera" : 'Pulsa "Descargar"'}</strong>{" "}
                {usaIA
                  ? "→ la IA redacta la portada."
                  : "→ se rellena la plantilla."}
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

      <main className="main">
        <div className="section-head">
          <div className="dot" />
          <h3>Tipo de propuesta</h3>
        </div>
        <div className="tipo-tabs">
          {TIPOS_PROPUESTA_LIST.map((t) => (
            <button
              key={t.id}
              className={`tipo-tab ${tipo === t.id ? "active" : ""}`}
              onClick={() => setTipo(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            RAMA A: tipos con IA (socios) — form completo
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
                  <select
                    value={tamano}
                    onChange={(e) => setTamano(e.target.value)}
                  >
                    <option value="">— Sin especificar —</option>
                    <option>Pyme (hasta 50 personas)</option>
                    <option>Mediana (50–250 personas)</option>
                    <option>Grande (250–1000 personas)</option>
                    <option>Corporación (+1000 personas)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Historial con Íntegra</label>
                  <select
                    value={historial}
                    onChange={(e) => setHistorial(e.target.value)}
                  >
                    <option value="">Sin historial previo</option>
                    <option>Contacto inicial reciente</option>
                    <option>Ex socio / colaborador</option>
                    <option>Socio activo en renovación</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>
                  Valores RSC / enfoque ESG{" "}
                  <span style={{ fontWeight: 300, opacity: 0.7 }}>
                    (si los conoces)
                  </span>
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
                    className={`linea-item ${lineasState[l.key] ? "on" : ""}`}
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
            RAMA B: tipos sin IA (lgd, empleo-sin-barreras)
            ════════════════════════════════════════════════════════ */}
        {!usaIA && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Datos para la plantilla</h3>
            </div>
            <div className="card">
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 14,
                  opacity: 0.75,
                  fontSize: 14,
                }}
              >
                Esta propuesta usa una plantilla fija con texto predefinido.
                Solo necesitas rellenar los siguientes datos:
              </p>
              <CamposDinamicos
                campos={tipoConfig.campos}
                valores={valoresExtra}
                onChange={setExtra}
              />
            </div>
          </>
        )}

        {/* LOGO — común a todos los tipos */}
        <div className="section-head">
          <div className="dot" />
          <h3>Logo de la empresa (opcional)</h3>
        </div>
        <div className="card">
          <div className="field" style={{ margin: 0 }}>
            <label>
              Sube el logo (PNG, JPG o SVG · recomendado fondo transparente)
            </label>
            <div className="logo-upload-row">
              <label htmlFor="f-logo" className="logo-upload-btn">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span>
                  {logoBytes ? "Cambiar archivo" : "Seleccionar archivo"}
                </span>
              </label>
              <input
                type="file"
                id="f-logo"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: "none" }}
                onChange={handleLogoFile}
              />
              {logoPreviewUrl && (
                <div className="logo-preview-box">
                  <img src={logoPreviewUrl} alt="Logo" />
                  <button
                    type="button"
                    className="logo-remove"
                    onClick={removeLogo}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            <p className="logo-help">
              {logoBytes
                ? `Logo cargado (${logoFilename}). Se encajará en una caja máx. 4×1.5 cm sin deformación.`
                : "Si no subes logo, el hueco quedará en blanco para añadirlo a mano después."}
            </p>
          </div>
        </div>

        {plantillaError && (
          <div className="error-bar on">⚠️ {plantillaError}</div>
        )}
        {error && <div className="error-bar on">{error}</div>}

        <button
          className="btn-generate"
          onClick={accionPrincipal}
          disabled={loading || downloading || !plantillaActivaLista}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          {usaIA
            ? "Generar propuesta completa"
            : downloading
              ? "Generando Word…"
              : "Generar y descargar Word"}
        </button>

        {loading && (
          <div className="loader">
            <div className="spinner-ring" />
            <p>Redactando propuesta personalizada…</p>
          </div>
        )}

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
                {downloading ? "Generando Word…" : "Descargar Word completo"}
              </button>
              <button className="btn-action" onClick={copiarTexto}>
                {copyLabel}
              </button>
              <button className="btn-action" onClick={accionPrincipal}>
                Regenerar
              </button>
            </div>

            <div className="info-callout">
              <strong>Ya casi</strong> — Descarga el Word, revisa que todo esté
              correcto, guárdalo como PDF y envíalo.{" "}
              {logoBytes
                ? "El logo de la empresa ya viene integrado."
                : "Recuerda añadir el logo de la empresa a mano antes de enviar."}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: form dinámico
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
  // Agrupamos campos en filas. Un campo 'completo' ocupa fila entera.
  const filas: CampoConfig[][] = [];
  let pendiente: CampoConfig | null = null;
  for (const c of campos) {
    const ancho = c.ancho ?? "medio";
    if (ancho === "completo") {
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
          className={fila.length === 2 ? "grid2" : ""}
          style={idx > 0 ? { marginTop: 14 } : undefined}
        >
          {fila.map((c) => (
            <CampoRender
              key={c.key}
              campo={c}
              valor={valores[c.key] || ""}
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
      {campo.tipo === "textarea" ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      ) : campo.tipo === "select" ? (
        <select value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Selecciona —</option>
          {(campo.opciones || []).map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      ) : (
        <input
          type={campo.tipo === "number" ? "number" : "text"}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      )}
      {campo.ayuda && (
        <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          {campo.ayuda}
        </p>
      )}
    </div>
  );
}
