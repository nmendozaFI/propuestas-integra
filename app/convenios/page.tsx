"use client";

import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import {
  GRUPOS_CONVENIO,
  tiposDeGrupo,
  contarDisponibles,
  getTipoConvenio,
  type GrupoConvenioId,
  type CampoConfig,
} from "@/lib/tipos-convenio";
import {
  rellenarConvenio,
  nombreArchivoConvenio,
  type LogoData,
} from "@/lib/docx-convenios";
import { cargarPlantillaBytes } from "@/lib/plantillas-cliente";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════
const PASSWORD_STORAGE_KEY = "integra_app_password"; // mismo que el generador de propuestas

function fechaHoyTexto(): string {
  // "1 de junio de 2026"
  return new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function Convenios() {
  // ── Auth ──
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Navegación ──
  const [grupoSel, setGrupoSel] = useState<GrupoConvenioId | null>(null);
  const [codigoSel, setCodigoSel] = useState<string | null>(null);

  // ── Formulario ──
  const [valores, setValores] = useState<Record<string, string>>({});

  // ── Logo ──
  const [logo, setLogo] = useState<LogoData | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoFilename, setLogoFilename] = useState("");

  // ── Generación ──
  const [plantillasCache, setPlantillasCache] = useState<
    Record<string, Uint8Array>
  >({});
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const tipo = codigoSel ? getTipoConvenio(codigoSel) : undefined;

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

  // Precargar la plantilla del tipo seleccionado
  useEffect(() => {
    if (!authed || !tipo?.plantilla) return;
    const ruta = tipo.plantilla;
    if (plantillasCache[ruta]) return;
    (async () => {
      try {
        const bytes = await cargarPlantillaBytes(ruta);
        setPlantillasCache((prev) => ({ ...prev, [ruta]: bytes }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo cargar la plantilla (${ruta}): ${msg}`);
      }
    })();
  }, [authed, tipo, plantillasCache]);

  // ─────────────────────────────────────────────────────────────────
  // HANDLERS
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

  function elegirGrupo(g: GrupoConvenioId) {
    setGrupoSel(g);
    setCodigoSel(null);
    setError("");
  }

  function elegirTipo(codigo: string) {
    setCodigoSel(codigo);
    setError("");
    // valores iniciales: lugar y fecha por defecto
    setValores({ lugarFirma: "Madrid", fechaFirma: fechaHoyTexto() });
  }

  function volverAGrupos() {
    setGrupoSel(null);
    setCodigoSel(null);
    setError("");
  }

  function volverAPlantillas() {
    setCodigoSel(null);
    setError("");
  }

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
    const input = document.getElementById(
      "f-logo-conv",
    ) as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function generar() {
    if (!tipo?.plantilla || !tipo.campos) return;
    const faltan = tipo.campos
      .filter((c) => c.obligatorio && !(valores[c.key] || "").trim())
      .map((c) => c.label);
    if (faltan.length > 0) {
      setError(`Faltan campos obligatorios: ${faltan.join(", ")}.`);
      return;
    }

    let plantillaBytes = plantillasCache[tipo.plantilla];
    if (!plantillaBytes) {
      try {
        plantillaBytes = await cargarPlantillaBytes(tipo.plantilla);
        setPlantillasCache((prev) => ({
          ...prev,
          [tipo.plantilla!]: plantillaBytes!,
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
      // La ciudad de la declaración se intuye del lugar de firma si se deja vacía.
      const datos = { ...valores };
      if (!(datos.cuidadFirma || "").trim()) {
        datos.cuidadFirma = (datos.lugarFirma || "").trim();
      }
      const blob = await rellenarConvenio({ plantillaBytes, datos, logo });
      saveAs(
        blob,
        nombreArchivoConvenio(tipo.codigo, valores.nombreEmpresa || ""),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`❌ Error al generar el Word: ${msg}`);
    } finally {
      setDownloading(false);
    }
  }

  const plantillaLista = !!(tipo?.plantilla && plantillasCache[tipo.plantilla]);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: carga / login
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
          <h2>Generador de convenios</h2>
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
  const grupoActual = grupoSel
    ? GRUPOS_CONVENIO.find((g) => g.id === grupoSel)
    : null;

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
          <h2 style={{ marginTop: "2rem" }}>Generador de convenios</h2>
          <p style={{ marginTop: ".75rem" }}>
            Elige el grupo y la plantilla, rellena los datos de la empresa y
            descarga el convenio en Word listo para firmar.
          </p>
        </div>

        <div>
          <p className="step-label">Cómo funciona</p>
          <div className="step-list">
            <div className="step">
              <div className="step-num">1</div>
              <div className="step-text">
                <strong>Elige el grupo</strong> (Socio, LGD, Patrono…).
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div className="step-text">
                <strong>Elige la plantilla</strong> del grupo.
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div className="step-text">
                <strong>Rellena los datos</strong> y sube el logo (opcional).
              </div>
            </div>
            <div className="step">
              <div className="step-num">4</div>
              <div className="step-text">
                <strong>Descarga el Word</strong> para firmar.
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
        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 18,
            fontSize: 14,
            flexWrap: "wrap",
          }}
        >
          <button onClick={volverAGrupos} style={migaStyle(!grupoSel)}>
            Convenios
          </button>
          {grupoActual && (
            <>
              <span style={{ opacity: 0.4 }}>›</span>
              <button onClick={volverAPlantillas} style={migaStyle(!codigoSel)}>
                {grupoActual.emoji} {grupoActual.label}
              </button>
            </>
          )}
          {tipo && (
            <>
              <span style={{ opacity: 0.4 }}>›</span>
              <span style={migaStyle(true)}>
                {tipo.codigo} · {tipo.label}
              </span>
            </>
          )}
        </div>

        {/* ─── PASO 1: grupos ─── */}
        {!grupoSel && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Elige el grupo de convenio</h3>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {GRUPOS_CONVENIO.map((g) => {
                const total = tiposDeGrupo(g.id).length;
                const disp = contarDisponibles(g.id);
                const activo = disp > 0;
                return (
                  <button
                    key={g.id}
                    onClick={() => activo && elegirGrupo(g.id)}
                    disabled={!activo}
                    style={tarjetaGrupoStyle(activo)}
                  >
                    <div style={{ fontSize: 30, lineHeight: 1 }}>{g.emoji}</div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {g.label}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {activo
                        ? `${disp} de ${total} disponible${total > 1 ? "s" : ""}`
                        : "Próximamente"}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ─── PASO 2: plantillas del grupo ─── */}
        {grupoSel && !codigoSel && grupoActual && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Plantillas · {grupoActual.label}</h3>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {tiposDeGrupo(grupoSel).map((t) => {
                const activo = !t.proximamente;
                return (
                  <button
                    key={t.codigo}
                    onClick={() => activo && elegirTipo(t.codigo)}
                    disabled={!activo}
                    style={tarjetaPlantillaStyle(activo)}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        opacity: 0.55,
                      }}
                    >
                      {t.codigo}
                    </div>
                    <div
                      style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}
                    >
                      {t.label}
                    </div>
                    {!activo && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                        Próximamente
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ─── PASO 3: formulario ─── */}
        {tipo?.campos && (
          <>
            <div className="section-head">
              <div className="dot" />
              <h3>Datos del convenio</h3>
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
                Rellena los datos de la empresa. El importe en letras y la fecha
                de hoy se añaden automáticamente; puedes editarlos.
              </p>
              <CamposDinamicos
                campos={tipo.campos}
                valores={valores}
                onChange={setCampo}
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
                    <span>
                      {logo ? "Cambiar archivo" : "Seleccionar archivo"}
                    </span>
                  </label>
                  <input
                    type="file"
                    id="f-logo-conv"
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
                        onClick={quitarLogo}
                      >
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {downloading ? "Generando Word…" : "Generar y descargar Word"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Estilos inline para grid/breadcrumb (el resto usa clases existentes) ───
function migaStyle(activo: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    cursor: activo ? "default" : "pointer",
    color: activo ? "#1a1a1a" : "#C73E3A",
    fontWeight: activo ? 600 : 500,
    fontSize: 14,
    fontFamily: "inherit",
  };
}

function tarjetaGrupoStyle(activo: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
    textAlign: "left",
    padding: "20px 18px",
    borderRadius: 14,
    border: "1px solid #e6e6e6",
    background: activo ? "#fff" : "#fafafa",
    cursor: activo ? "pointer" : "not-allowed",
    opacity: activo ? 1 : 0.55,
    fontFamily: "inherit",
    transition: "border-color .15s, box-shadow .15s",
  };
}

function tarjetaPlantillaStyle(activo: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left",
    padding: "18px 18px",
    borderRadius: 14,
    border: "1px solid #e6e6e6",
    background: activo ? "#fff" : "#fafafa",
    cursor: activo ? "pointer" : "not-allowed",
    opacity: activo ? 1 : 0.6,
    fontFamily: "inherit",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMPONENTE: formulario dinámico (misma lógica que en propuestas)
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
