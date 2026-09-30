"use client";

// ═══════════════════════════════════════════════════════════════════════
// /convenios/enlaces  → SEGUIMIENTO DE ENLACES (interno, con contraseña)
// ═══════════════════════════════════════════════════════════════════════
//
// La razón de haber elegido Postgres y no Redis: aquí se ve de un vistazo qué
// enlaces hay vivos, quién usó cuál y cuándo. En Redis las claves desaparecen al
// caducar y este histórico no existiría.
//
// Solo lee y anula. Los enlaces se crean desde el formulario de cada plantilla,
// que es donde el equipo ya está cuando los necesita.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import Gate from "@/components/convenios/Gate";
import Shell from "@/components/convenios/Shell";
import { anularEnlace, listarEnlaces } from "@/lib/enlaces-cliente";
import {
  ETIQUETA_ESTADO,
  estadoVisible,
  urlDeEnlace,
  type EnlaceConvenio,
  type EstadoVisible,
} from "@/lib/enlaces-tipos";
import { getTipoConvenio } from "@/lib/tipos-convenio";

const COLOR_ESTADO: Record<EstadoVisible, { fondo: string; texto: string }> = {
  pendiente: { fondo: "var(--marca-turquesa-light)", texto: "#1f6d66" },
  usado: { fondo: "#EFEFF1", texto: "var(--text-muted)" },
  caducado: { fondo: "var(--danger-bg)", texto: "var(--danger)" },
  anulado: { fondo: "#EFEFF1", texto: "var(--text-muted)" },
};

function fecha(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EnlacesPage() {
  const [enlaces, setEnlaces] = useState<EnlaceConvenio[] | null>(null);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");
  const [ocupado, setOcupado] = useState("");

  /** Recarga la lista. La usan las acciones (anular), no la carga inicial. */
  const cargar = useCallback(async () => {
    setError("");
    try {
      setEnlaces(await listarEnlaces());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEnlaces([]);
    }
  }, []);

  // Carga inicial. No reutiliza `cargar` a propósito: su primer setError() sería
  // un setState síncrono dentro del efecto (react-hooks/set-state-in-effect), y
  // al montar no hay error que limpiar. Mismo patrón que Gate.tsx.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await listarEnlaces();
        if (!cancelado) setEnlaces(lista);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof Error ? err.message : String(err));
        setEnlaces([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(urlDeEnlace(window.location.origin, token));
      setCopiado(token);
      setTimeout(() => setCopiado(""), 2500);
    } catch {
      setError("No se ha podido copiar al portapapeles.");
    }
  }

  async function anular(token: string) {
    setOcupado(token);
    setError("");
    try {
      await anularEnlace(token);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado("");
    }
  }

  const pendientes = enlaces?.filter((e) => estadoVisible(e) === "pendiente").length ?? 0;

  return (
    <Gate>
      <Shell seccion="Enlaces">
        <div className="section-head">
          <div className="dot" />
          <h3>Enlaces generados</h3>
        </div>

        <div className="card">
          <p style={{ marginTop: 0, marginBottom: 18, opacity: 0.75, fontSize: 14 }}>
            Cada enlace sirve para un solo envío. Se crean desde el formulario de cada
            plantilla.
            {enlaces && enlaces.length > 0 && (
              <>
                {" "}
                Ahora mismo hay <strong>{pendientes}</strong>{" "}
                {pendientes === 1 ? "enlace activo" : "enlaces activos"}.
              </>
            )}
          </p>

          {error && <div className="error-bar">{error}</div>}

          {enlaces === null ? (
            <div className="loader">
              <div className="spinner-ring" />
              <p>Cargando enlaces…</p>
            </div>
          ) : enlaces.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
              Todavía no se ha generado ningún enlace.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tabla-enlaces">
                <thead>
                  <tr>
                    <th>Para quién</th>
                    <th>Convenio</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>Caduca</th>
                    <th>Usado por</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {enlaces.map((e) => {
                    const estado = estadoVisible(e);
                    const color = COLOR_ESTADO[estado];
                    const tipo = getTipoConvenio(e.codigo);
                    return (
                      <tr key={e.token}>
                        <td>{e.nota || <span style={{ opacity: 0.45 }}>sin nota</span>}</td>
                        <td>
                          <strong>{e.codigo}</strong>
                          {tipo && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {tipo.label}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="badge-estado"
                            style={{ background: color.fondo, color: color.texto }}
                          >
                            {ETIQUETA_ESTADO[estado]}
                          </span>
                        </td>
                        <td>{fecha(e.creadoEn)}</td>
                        <td>{fecha(e.caducaEn)}</td>
                        <td>
                          {e.usadoPor || <span style={{ opacity: 0.45 }}>—</span>}
                          {e.usadoEn && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {fecha(e.usadoEn)}
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          {estado === "pendiente" && (
                            <>
                              <button
                                type="button"
                                className="btn-action"
                                onClick={() => copiar(e.token)}
                              >
                                {copiado === e.token ? "¡Copiado!" : "Copiar"}
                              </button>{" "}
                              <button
                                type="button"
                                className="btn-action"
                                onClick={() => anular(e.token)}
                                disabled={ocupado === e.token}
                              >
                                {ocupado === e.token ? "…" : "Anular"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Shell>
    </Gate>
  );
}
