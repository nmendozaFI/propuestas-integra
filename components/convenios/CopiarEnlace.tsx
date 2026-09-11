"use client";

// ═══════════════════════════════════════════════════════════════════════
// COPIAR ENLACE PARA LA EMPRESA
// ═══════════════════════════════════════════════════════════════════════
// Construye el enlace público /convenio/[codigo] con los valores que la
// Fundación quiere dejar fijados (viajan como query params = key del campo).
// La empresa los verá de solo lectura. Solo se incluyen los que tengan valor.
// El origen se toma de window.location.origin (más adelante, dominio propio).
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import type { CampoConfig } from "@/lib/tipos-convenio";

export default function CopiarEnlace({
  codigo,
  campos,
}: {
  codigo: string;
  /** Campos que la Fundación puede fijar en este convenio (subconjunto curado). */
  campos: CampoConfig[];
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState(false);

  function setCampo(key: string, val: string) {
    setValores((prev) => ({ ...prev, [key]: val }));
    setCopiado(false);
  }

  function construirEnlace(): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const base = `${origin}/convenio/${codigo}`;
    const qs = new URLSearchParams();
    for (const c of campos) {
      const v = (valores[c.key] || "").trim();
      if (v) qs.set(c.key, v);
    }
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  }

  const enlace = construirEnlace();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Fallback: seleccionar el input para copiar a mano
      const input = document.getElementById(
        "enlace-empresa",
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  return (
    <>
      <div className="section-head">
        <div className="dot" />
        <h3>Enlace para la empresa</h3>
      </div>
      <div className="card">
        <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
          Comparte este enlace para que la empresa rellene el convenio ella misma.
          {campos.length > 0
            ? " Opcionalmente, fija aquí los valores que decide la Fundación: la empresa los verá ya rellenos y no podrá cambiarlos."
            : ""}
        </p>

        {campos.length > 0 && (
          <CamposFijables campos={campos} valores={valores} onChange={setCampo} />
        )}

        <div className="field" style={{ marginTop: campos.length > 0 ? 18 : 0 }}>
          <label>Enlace público</label>
          <div className="enlace-row">
            <input id="enlace-empresa" type="text" value={enlace} readOnly />
            <button type="button" className="btn-copiar" onClick={copiar}>
              {copiado ? "¡Copiado!" : "Copiar enlace"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CamposFijables({
  campos,
  valores,
  onChange,
}: {
  campos: CampoConfig[];
  valores: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  // Distribución en filas de dos (campos "completo" ocupan la fila entera).
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
            <div className="field" key={c.key}>
              <label>{c.label}</label>
              <input
                type="text"
                value={valores[c.key] || ""}
                onChange={(e) => onChange(c.key, e.target.value)}
                placeholder={c.placeholder}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
