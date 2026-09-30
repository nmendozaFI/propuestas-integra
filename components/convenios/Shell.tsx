"use client";

// ═══════════════════════════════════════════════════════════════════════
// SHELL INTERNO DE CONVENIOS — sidebar + breadcrumb + main
// ═══════════════════════════════════════════════════════════════════════
// La navegación grupo → plantilla vive en la URL, así que el breadcrumb usa
// <Link> (el botón atrás funciona y los enlaces se pueden guardar).
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import {
  GRUPOS_CONVENIO,
  getTipoConvenio,
  type GrupoConvenioId,
} from "@/lib/tipos-convenio";
import { cerrarSesionConvenios } from "@/components/convenios/Gate";
import { MARCA } from "@/lib/marca";

export default function Shell({
  grupo,
  codigo,
  seccion,
  children,
}: {
  grupo?: GrupoConvenioId;
  codigo?: string;
  /** Última miga para pantallas que no son grupo/plantilla (p. ej. "Enlaces"). */
  seccion?: string;
  children: React.ReactNode;
}) {
  const grupoActual = grupo
    ? GRUPOS_CONVENIO.find((g) => g.id === grupo)
    : null;
  const tipo = codigo ? getTipoConvenio(codigo) : undefined;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARCA.logoNegativo} alt="Fundación Íntegra" />
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
                <strong>Rellena los datos</strong> o copia el enlace para que lo
                haga la empresa.
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
          <Link href="/convenios/enlaces" className="sidebar-link">
            Enlaces generados →
          </Link>
          <button className="logout-btn" onClick={cerrarSesionConvenios}>
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
          {grupoActual || tipo || seccion ? (
            <Link href="/convenios" style={migaStyle(false)}>
              Convenios
            </Link>
          ) : (
            <span style={migaStyle(true)}>Convenios</span>
          )}
          {grupoActual && (
            <>
              <span style={{ opacity: 0.4 }}>›</span>
              {tipo ? (
                <Link href={`/convenios/${grupoActual.id}`} style={migaStyle(false)}>
                  {grupoActual.emoji} {grupoActual.label}
                </Link>
              ) : (
                <span style={migaStyle(true)}>
                  {grupoActual.emoji} {grupoActual.label}
                </span>
              )}
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
          {seccion && (
            <>
              <span style={{ opacity: 0.4 }}>›</span>
              <span style={migaStyle(true)}>{seccion}</span>
            </>
          )}
        </div>

        {children}
      </main>
    </div>
  );
}

function migaStyle(activo: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    cursor: activo ? "default" : "pointer",
    color: activo ? "var(--text)" : "var(--marca-rojo)",
    fontWeight: activo ? 600 : 500,
    fontSize: 14,
    fontFamily: "inherit",
    textDecoration: "none",
  };
}
