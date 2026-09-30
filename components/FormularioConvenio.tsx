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
// Por defecto TODOS los campos son opcionales: los que se dejen vacíos salen en
// el Word como una línea para rellenar a mano (lo resuelve `docx-convenios.ts`).
// Las plantillas marcadas con `camposObligatorios` / `logoObligatorio` (hoy
// ENT-01) exigen tenerlo todo antes de generar nada.
//
// Dos modos de salida:
//   - `descarga` (por defecto) → se genera el documento y se descarga.
//   - `envio`    → rellenar → REVISAR el PDF en pantalla → aceptar y enviarlo a
//                  la Fundación por correo. La empresa no descarga nada.
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
  salida = "word",
  modo = "descarga",
  token,
}: {
  codigo: string;
  cargarBytes: () => Promise<Uint8Array>;
  valoresIniciales?: Record<string, string>;
  /** Campos fijados por la Fundación (llegan por query param en la ruta pública). */
  fijados?: Record<string, string>;
  /** Si true, los campos fijados se muestran de solo lectura (ruta pública). */
  fijadosReadOnly?: boolean;
  /** Formato de descarga. 'pdf' convierte el Word a PDF calcado (ruta pública de
   *  las plantillas marcadas con `descargaPdfPublica`). Por defecto 'word'. */
  salida?: "word" | "pdf";
  /** 'envio' sustituye la descarga por revisar el PDF y enviarlo a la Fundación. */
  modo?: "descarga" | "envio";
  /** Token del enlace de un solo uso (ruta /convenio/t/[token]). El servidor lo
   *  consume tras confirmar el correo, de modo que el enlace no vale dos veces. */
  token?: string;
}) {
  const tipo = getTipoConvenio(codigo);

  // Cuando la plantilla exige todos los campos (p. ej. ENT-01), no se puede
  // continuar hasta que estén completos. Se deriva del propio tipo.
  const exigir = !!tipo?.camposObligatorios;
  const exigirLogo = !!tipo?.logoObligatorio;
  const esEnvio = modo === "envio";

  const inicialesRef = useRef<Record<string, string>>({
    ...(valoresIniciales || {}),
    ...(fijados || {}),
  });

  const [valores, setValores] = useState<Record<string, string>>(
    inicialesRef.current,
  );
  const [logo, setLogo] = useState<LogoData | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoFilename, setLogoFilename] = useState("");

  const [plantillaBytes, setPlantillaBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  // true tras un intento de generar: activa el resaltado de campos vacíos.
  const [intentado, setIntentado] = useState(false);
  const inputLogoRef = useRef<HTMLInputElement | null>(null);

  // ─── Estado del flujo de envío (modo 'envio') ───
  const [vista, setVista] = useState<"form" | "revision">("form");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [aceptado, setAceptado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

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

  // Soltar las URLs de objeto vivas al desmontar (PDF de revisión y logo).
  const pdfUrlRef = useRef("");
  const logoUrlRef = useRef("");
  useEffect(() => {
    pdfUrlRef.current = pdfUrl;
  }, [pdfUrl]);
  useEffect(() => {
    logoUrlRef.current = logoPreviewUrl;
  }, [logoPreviewUrl]);
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    };
  }, []);

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
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudo leer la imagen: ${msg}`);
      quitarLogo();
    }
  }

  function quitarLogo() {
    setLogo(null);
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl("");
    setLogoFilename("");
    if (inputLogoRef.current) inputLogoRef.current.value = "";
  }

  // Campos que faltan por rellenar (solo si la plantilla los exige).
  function camposFaltantes(): CampoConfig[] {
    if (!exigir || !tipo?.campos) return [];
    return tipo.campos.filter((c) => !(valores[c.key] || "").trim());
  }

  /** Comprueba obligatorios (campos + logo). Devuelve el mensaje de error o "". */
  function validar(): string {
    const faltan = camposFaltantes();
    if (faltan.length > 0) {
      return `Faltan campos por rellenar: ${faltan.map((c) => c.label).join(", ")}.`;
    }
    if (exigirLogo && !logo) {
      return "Falta subir el logo de la empresa: es obligatorio en este convenio.";
    }
    return "";
  }

  /** Rellena la plantilla en el navegador y devuelve el .docx + el nombre base. */
  async function construirDocx(): Promise<{ blob: Blob; base: string }> {
    if (!tipo?.plantilla || !tipo.campos) throw new Error("Convenio no válido.");

    let bytes = plantillaBytes;
    if (!bytes) {
      bytes = await cargarBytes();
      setPlantillaBytes(bytes);
    }

    // La ciudad de la declaración se intuye del lugar de firma si se deja vacía.
    const datos = { ...valores };
    if (!(datos.cuidadFirma || "").trim()) {
      datos.cuidadFirma = (datos.lugarFirma || "").trim();
    }
    const blob = await rellenarConvenio({ plantillaBytes: bytes, datos, logo });
    const base = nombreArchivoConvenio(
      tipo.codigo,
      valores.nombreEmpresa || "",
    ).replace(/\.docx$/i, "");
    return { blob, base };
  }

  /** Convierte el .docx relleno a PDF calcado (servidor → CloudConvert). */
  async function convertirAPdf(docx: Blob, base: string): Promise<Blob> {
    const fd = new FormData();
    fd.append("file", docx, `${base}.docx`);
    fd.append("nombre", base);
    const resp = await fetch("/api/convenio-pdf", { method: "POST", body: fd });
    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      throw new Error(
        `No se pudo convertir a PDF (${resp.status}). ${detalle}`.trim(),
      );
    }
    return resp.blob();
  }

  // ─── Modo 'descarga': generar y descargar (comportamiento de siempre) ───
  async function generar() {
    if (!tipo?.plantilla || !tipo.campos) return;

    if (exigir || exigirLogo) {
      const problema = validar();
      if (problema) {
        setIntentado(true);
        setError(problema);
        return;
      }
    }

    setDownloading(true);
    setError("");
    try {
      const { blob, base } = await construirDocx();
      if (salida === "pdf") {
        saveAs(await convertirAPdf(blob, base), `${base}.pdf`);
      } else {
        saveAs(blob, `${base}.docx`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        `❌ Error al generar el ${salida === "pdf" ? "PDF" : "Word"}: ${msg}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  // ─── Modo 'envio', paso 2: preparar el PDF y pasar a revisión ───
  async function revisar() {
    if (!tipo?.plantilla || !tipo.campos) return;

    const problema = validar();
    if (problema) {
      setIntentado(true);
      setError(problema);
      return;
    }

    setDownloading(true);
    setError("");
    try {
      const { blob, base } = await construirDocx();
      const pdf = await convertirAPdf(blob, base);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfBlob(pdf);
      setPdfUrl(URL.createObjectURL(pdf));
      setAceptado(false);
      setVista("revision");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ No se pudo preparar el documento: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }

  function volverAEditar() {
    setError("");
    setVista("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Modo 'envio', paso 3: enviar a la Fundación y limpiar ───
  async function enviar() {
    if (!pdfBlob || !tipo) return;
    setEnviando(true);
    setError("");
    try {
      const base = nombreArchivoConvenio(
        tipo.codigo,
        valores.nombreEmpresa || "",
      ).replace(/\.docx$/i, "");
      const fd = new FormData();
      fd.append("file", pdfBlob, `${base}.pdf`);
      fd.append("codigo", tipo.codigo);
      fd.append("datos", JSON.stringify(valores));
      // Sin token el servidor rechaza el envío de las plantillas con flujoEnvio.
      if (token) fd.append("token", token);

      const resp = await fetch("/api/convenio-enviar", {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) {
        const j = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `El servidor respondió ${resp.status}.`);
      }

      // Enviado: se limpia todo para no dejar datos en pantalla.
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl("");
      setPdfBlob(null);
      setValores(inicialesRef.current);
      quitarLogo();
      setIntentado(false);
      setAceptado(false);
      setVista("form");
      setEnviado(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ No se pudo enviar el convenio: ${msg}`);
    } finally {
      setEnviando(false);
    }
  }

  if (!tipo?.campos) return null;

  const plantillaLista = !!plantillaBytes;
  const fijadosSet = fijados || {};
  const logoFaltante = exigirLogo && intentado && !logo;

  // Texto del botón principal según modo y estado.
  let textoBoton: string;
  if (!plantillaLista) textoBoton = "Cargando plantilla…";
  else if (esEnvio)
    textoBoton = downloading ? "Preparando el documento…" : "Revisar el documento";
  else if (downloading)
    textoBoton = salida === "pdf" ? "Generando PDF…" : "Generando Word…";
  else
    textoBoton =
      salida === "pdf" ? "Generar y descargar PDF" : "Generar y descargar Word";

  return (
    <>
      {vista === "revision" ? (
        // ─── PASO 2: revisar el documento antes de enviarlo ───
        <>
          <div className="section-head">
            <div className="dot" />
            <h3>Revisa el documento</h3>
          </div>
          <div className="card">
            <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
              Este es tu convenio ya cumplimentado. Compruébalo con calma: si hay
              algo que corregir, vuelve atrás y edítalo antes de enviarlo.
            </p>
            {/* #toolbar=0&navpanes=0: el visor de PDF de Chrome/Edge muestra por
                defecto botones de descargar e imprimir y el panel de miniaturas.
                Aquí estorban: el documento se envía, no se descarga. */}
            <iframe
              className="revision-visor"
              src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
              title="Vista previa del convenio"
            />
            <p className="logo-help">
              ¿No se ve la vista previa?{" "}
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                Ábrela en una pestaña nueva
              </a>
              .
            </p>
          </div>

          <div className="card">
            <label className="check-row">
              <input
                type="checkbox"
                checked={aceptado}
                onChange={(e) => setAceptado(e.target.checked)}
              />
              <span>
                He revisado el documento, confirmo que los datos son correctos y
                autorizo su envío a <strong>Fundación Íntegra</strong>.
              </span>
            </label>
          </div>

          {error && <div className="error-bar on">{error}</div>}

          <div className="action-row">
            <button
              type="button"
              className="btn-action"
              onClick={volverAEditar}
              disabled={enviando}
            >
              ← Volver a editar
            </button>
            <button
              className="btn-generate"
              onClick={enviar}
              disabled={!aceptado || enviando}
              style={{ flex: 1, minWidth: 220 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              {enviando ? "Enviando…" : "Aceptar y enviar"}
            </button>
          </div>
        </>
      ) : (
        // ─── PASO 1: rellenar el formulario ───
        <>
          <div className="section-head">
            <div className="dot" />
            <h3>Datos del convenio</h3>
          </div>
          <div className="card">
            <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
              {exigir ? (
                <>
                  Todos los campos son <strong>obligatorios</strong>: complétalos
                  para poder {esEnvio ? "revisar y enviar" : "descargar"} el
                  documento
                  {!esEnvio && salida === "pdf" ? " en PDF" : ""}. El importe en
                  letras se añade automáticamente a partir de la cifra.
                </>
              ) : (
                <>
                  Todos los campos son opcionales. Los que dejes en blanco saldrán
                  en el Word como una línea (__________) para rellenar a mano. El
                  importe en letras se añade automáticamente a partir de la cifra.
                </>
              )}
            </p>
            <CamposDinamicos
              campos={tipo.campos}
              valores={valores}
              onChange={setCampo}
              fijados={fijadosReadOnly ? fijadosSet : {}}
              exigir={exigir}
              intentado={intentado}
            />
          </div>

          {/* Logo */}
          <div className="section-head">
            <div className="dot" />
            <h3>Logo de la empresa {exigirLogo ? "(obligatorio)" : "(opcional)"}</h3>
          </div>
          <div className="card">
            <div className="field" style={{ margin: 0 }}>
              <label>
                Sube el logo (PNG, JPG o SVG · recomendado fondo transparente)
                {exigirLogo && (
                  <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>
                )}
              </label>
              <div className="logo-upload-row">
                <label
                  htmlFor="f-logo-conv"
                  className={`logo-upload-btn${logoFaltante ? " campo-faltante" : ""}`}
                  style={
                    logoFaltante
                      ? {
                          borderColor: "var(--danger-border)",
                          background: "var(--danger-bg)",
                        }
                      : undefined
                  }
                >
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
                    <button
                      type="button"
                      className="logo-remove"
                      onClick={quitarLogo}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              {logoFaltante ? (
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--danger)" }}>
                  El logo es obligatorio en este convenio.
                </p>
              ) : (
                <p className="logo-help">
                  {logo
                    ? `Logo cargado (${logoFilename}). Se encajará en una caja máx. 4×1,5 cm sin deformación, en la portada.`
                    : exigirLogo
                      ? "Tu logo aparecerá en la portada del convenio, junto al de Fundación Íntegra."
                      : "Si no subes logo, el hueco de la portada quedará en blanco."}
                </p>
              )}
            </div>
          </div>

          {error && <div className="error-bar on">{error}</div>}

          <button
            className="btn-generate"
            onClick={esEnvio ? revisar : generar}
            disabled={downloading || !plantillaLista}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {esEnvio ? (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              )}
            </svg>
            {textoBoton}
          </button>
        </>
      )}

      {/* ─── PASO 3: confirmación de envío ─── */}
      {enviado && (
        <div
          className="modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-gracias-titulo"
        >
          <div className="modal-caja">
            <div className="modal-tic" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 id="modal-gracias-titulo">¡Gracias!</h3>
            <p>
              Hemos recibido tu convenio correctamente. Te contactaremos en breve
              para enviarte el documento firmado por Fundación Íntegra.
            </p>
            <button
              type="button"
              className="btn-generate"
              onClick={() => setEnviado(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
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
  exigir,
  intentado,
}: {
  campos: CampoConfig[];
  valores: Record<string, string>;
  onChange: (key: string, val: string) => void;
  fijados: Record<string, string>;
  exigir: boolean;
  intentado: boolean;
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
          {fila.map((c) => {
            const fijado = Object.prototype.hasOwnProperty.call(fijados, c.key);
            const vacio = !(valores[c.key] || "").trim();
            return (
              <CampoRender
                key={c.key}
                campo={c}
                valor={valores[c.key] || ""}
                onChange={(v) => onChange(c.key, v)}
                fijado={fijado}
                exigir={exigir}
                faltante={exigir && intentado && vacio && !fijado}
              />
            );
          })}
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
  exigir,
  faltante,
}: {
  campo: CampoConfig;
  valor: string;
  onChange: (v: string) => void;
  fijado: boolean;
  exigir: boolean;
  faltante: boolean;
}) {
  // Borde ámbar cuando el campo es obligatorio y quedó vacío tras intentar
  // continuar (ámbar, no rojo de marca, para no confundir con la identidad).
  const estiloError = faltante
    ? { borderColor: "var(--danger-border)", background: "var(--danger-bg)" }
    : undefined;
  const clase = [fijado ? "campo-fijado" : "", faltante ? "campo-faltante" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      <label>
        {campo.label}
        {exigir && !fijado && (
          <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>
        )}
      </label>
      {campo.tipo === "textarea" ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
          readOnly={fijado}
          className={clase || undefined}
          style={estiloError}
        />
      ) : campo.tipo === "select" ? (
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={fijado}
          className={clase || undefined}
          style={estiloError}
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
          className={clase || undefined}
          style={estiloError}
        />
      )}
      {fijado ? (
        <p className="campo-fijado-nota">Fijado por Fundación Íntegra</p>
      ) : faltante ? (
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--danger)" }}>
          Este campo es obligatorio.
        </p>
      ) : (
        campo.ayuda && (
          <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{campo.ayuda}</p>
        )
      )}
    </div>
  );
}
