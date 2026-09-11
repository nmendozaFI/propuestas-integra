"use client";

// ═══════════════════════════════════════════════════════════════════════
// FORMULARIO DE CONVENIO — componente compartido
// ═══════════════════════════════════════════════════════════════════════
//
// Lo usan las dos rutas:
//   - interna  (/convenios/[grupo]/[codigo])  → el equipo, con contraseña
//   - pública  (/convenio/[codigo])           → la empresa, sin contraseña
//
// Es agnóstico de la fuente de la plantilla: recibe `cargarBytes()`, que en la
// ruta interna resuelve la versión viva vía manifest (con contraseña) y en la
// pública vía el endpoint público de un solo convenio.
//
// TODOS los campos son opcionales. Los que se dejen vacíos salen en el Word como
// una línea para rellenar a mano (lo resuelve el motor `docx-convenios.ts`).
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { saveAs } from "file-saver";
import { getTipoConvenio, type CampoConfig } from "@/lib/tipos-convenio";
import {
  rellenarConvenio,
  nombreArchivoConvenio,
  type LogoData,
} from "@/lib/docx-convenios";

// ═══════════════════════════════════════════════════════════════════════
// HELPERS DE LOGO (idénticos a los del generador de propuestas)
// ═══════════════════════════════════════════════════════════════════════
async function leerLogoConDimensiones(file: File): Promise<LogoData> {
  const name = (file.name || "").toLowerCase();
  const isPng = file.type === "image/png" || name.endsWith(".png");
  const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
  if (isSvg) return rasterizarSvg(await file.text());

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

function rasterizarSvg(svgText: string): Promise<LogoData> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgText], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const maxW = 600;
      const ratio = img.width && img.height ? img.width / img.height : 3;
      const w = img.width ? Math.min(img.width, maxW) : maxW;
      const h = Math.max(1, Math.round(w / ratio));
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
// COMPONENTE
// ═══════════════════════════════════════════════════════════════════════
export default function FormularioConvenio({
  codigo,
  cargarBytes,
  valoresIniciales,
  fijados,
  fijadosReadOnly = false,
}: {
  codigo: string;
  cargarBytes: () => Promise<Uint8Array>;
  valoresIniciales?: Record<string, string>;
  /** Campos fijados por la Fundación (llegan por query param en la ruta pública). */
  fijados?: Record<string, string>;
  /** Si true, los campos fijados se muestran de solo lectura (ruta pública). */
  fijadosReadOnly?: boolean;
}) {
  const tipo = getTipoConvenio(codigo);

  const [valores, setValores] = useState<Record<string, string>>({
    ...(valoresIniciales || {}),
    ...(fijados || {}),
  });
  const [logo, setLogo] = useState<LogoData | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoFilename, setLogoFilename] = useState("");

  const [plantillaBytes, setPlantillaBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const inputLogoRef = useRef<HTMLInputElement | null>(null);

  // Precargar la plantilla
  useEffect(() => {
    if (!tipo?.plantilla) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await cargarBytes();
        if (!cancelled) setPlantillaBytes(bytes);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo cargar la plantilla: ${msg}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  function setCampo(key: string, val: string) {
    setValores((prev) => ({ ...prev, [key]: val }));
  }

  async function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    const name = (file.name || "").toLowerCase();
    const ok =
      file.type === "image/png" ||
      name.endsWith(".png") ||
      file.type === "image/jpeg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      file.type === "image/svg+xml" ||
      name.endsWith(".svg");
    if (!ok) {
      setError("Formato no soportado. Usa PNG, JPG o SVG.");
      event.target.value = "";
      return;
    }
    try {
      const data = await leerLogoConDimensiones(file);
      setLogo(data);
      setLogoFilename(file.name);
      const blob = new Blob([data.bytes.buffer as ArrayBuffer], {
        type: data.ext === "png" ? "image/png" : "image/jpeg",
      });
      setLogoPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudo leer la imagen: ${msg}`);
      quitarLogo();
    }
  }

  function quitarLogo() {
    setLogo(null);
    setLogoPreviewUrl("");
    setLogoFilename("");
    if (inputLogoRef.current) inputLogoRef.current.value = "";
  }

  async function generar() {
    if (!tipo?.plantilla || !tipo.campos) return;

    let bytes = plantillaBytes;
    if (!bytes) {
      try {
        bytes = await cargarBytes();
        setPlantillaBytes(bytes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo cargar la plantilla: ${msg}`);
        return;
      }
    }

    setDownloading(true);
    setError("");
    try {
      // La ciudad de la declaración se intuye del lugar de firma si se deja vacía.
      const datos = { ...valores };
      if (!(datos.cuidadFirma || "").trim()) {
        datos.cuidadFirma = (datos.lugarFirma || "").trim();
      }
      const blob = await rellenarConvenio({ plantillaBytes: bytes, datos, logo });
      saveAs(blob, nombreArchivoConvenio(tipo.codigo, valores.nombreEmpresa || ""));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ Error al generar el Word: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }

  if (!tipo?.campos) return null;

  const plantillaLista = !!plantillaBytes;
  const fijadosSet = fijados || {};

  return (
    <>
      <div className="section-head">
        <div className="dot" />
        <h3>Datos del convenio</h3>
      </div>
      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
          Todos los campos son opcionales. Los que dejes en blanco saldrán en el
          Word como una línea (__________) para rellenar a mano. El importe en
          letras se añade automáticamente a partir de la cifra.
        </p>
        <CamposDinamicos
          campos={tipo.campos}
          valores={valores}
          onChange={setCampo}
          fijados={fijadosReadOnly ? fijadosSet : {}}
        />
      </div>

      {/* Logo */}
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
            <label htmlFor="f-logo-conv" className="logo-upload-btn">
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
              <span>{logo ? "Cambiar archivo" : "Seleccionar archivo"}</span>
            </label>
            <input
              ref={inputLogoRef}
              type="file"
              id="f-logo-conv"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              style={{ display: "none" }}
              onChange={handleLogoFile}
            />
            {logoPreviewUrl && (
              <div className="logo-preview-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreviewUrl} alt="Logo" />
                <button type="button" className="logo-remove" onClick={quitarLogo}>
                  ×
                </button>
              </div>
            )}
          </div>
          <p className="logo-help">
            {logo
              ? `Logo cargado (${logoFilename}). Se encajará en una caja máx. 4×1,5 cm sin deformación, en la portada.`
              : "Si no subes logo, el hueco de la portada quedará en blanco."}
          </p>
        </div>
      </div>

      {error && <div className="error-bar on">{error}</div>}

      <button
        className="btn-generate"
        onClick={generar}
        disabled={downloading || !plantillaLista}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        {downloading
          ? "Generando Word…"
          : plantillaLista
            ? "Generar y descargar Word"
            : "Cargando plantilla…"}
      </button>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTES: formulario dinámico
// ═══════════════════════════════════════════════════════════════════════
function CamposDinamicos({
  campos,
  valores,
  onChange,
  fijados,
}: {
  campos: CampoConfig[];
  valores: Record<string, string>;
  onChange: (key: string, val: string) => void;
  fijados: Record<string, string>;
}) {
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
    } else if (pendiente) {
      filas.push([pendiente, c]);
      pendiente = null;
    } else {
      pendiente = c;
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
              fijado={Object.prototype.hasOwnProperty.call(fijados, c.key)}
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
  fijado,
}: {
  campo: CampoConfig;
  valor: string;
  onChange: (v: string) => void;
  fijado: boolean;
}) {
  return (
    <div className="field">
      <label>{campo.label}</label>
      {campo.tipo === "textarea" ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
          readOnly={fijado}
          className={fijado ? "campo-fijado" : undefined}
        />
      ) : campo.tipo === "select" ? (
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={fijado}
          className={fijado ? "campo-fijado" : undefined}
        >
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
          readOnly={fijado}
          className={fijado ? "campo-fijado" : undefined}
        />
      )}
      {fijado ? (
        <p className="campo-fijado-nota">Fijado por Fundación Íntegra</p>
      ) : (
        campo.ayuda && (
          <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{campo.ayuda}</p>
        )
      )}
    </div>
  );
}
