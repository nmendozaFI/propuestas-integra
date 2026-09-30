"use client";

// ═══════════════════════════════════════════════════════════════════════
// GENERAR ENLACE PARA LA EMPRESA
// ═══════════════════════════════════════════════════════════════════════
// Antes esto construía `/convenio/[codigo]?importe=5000` en el navegador. Ese
// enlace era reutilizable sin límite y los valores "fijados por la Fundación"
// se podían editar desde la barra de direcciones (el readOnly era solo pantalla).
//
// Ahora pide al servidor un enlace con token (/api/enlaces): un solo uso,
// caducidad, y los fijados guardados en la base, fuera del alcance de la empresa.
// Como el token se crea al pulsar, el enlace ya no aparece solo: hay que generarlo.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import Link from "next/link";
import type { CampoConfig } from "@/lib/tipos-convenio";
import { crearEnlace } from "@/lib/enlaces-cliente";
import { DIAS_VALIDEZ_POR_DEFECTO, urlDeEnlace } from "@/lib/enlaces-tipos";

export default function CopiarEnlace({
  codigo,
  campos,
}: {
  codigo: string;
  /** Campos que la Fundación puede fijar en este convenio (subconjunto curado). */
  campos: CampoConfig[];
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nota, setNota] = useState("");
  const [enlace, setEnlace] = useState("");
  const [caducaEn, setCaducaEn] = useState<Date | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);

  function setCampo(key: string, val: string) {
    setValores((prev) => ({ ...prev, [key]: val }));
  }

  async function generar() {
    setGenerando(true);
    setError("");
    try {
      const fijados: Record<string, string> = {};
      for (const c of campos) {
        const v = (valores[c.key] || "").trim();
        if (v) fijados[c.key] = v;
      }
      const creado = await crearEnlace({ codigo, fijados, nota });
      const url = urlDeEnlace(window.location.origin, creado.token);
      setEnlace(url);
      setCaducaEn(creado.caducaEn);
      // Se copia sola: el caso normal es generar y pegar en un correo.
      try {
        await navigator.clipboard.writeText(url);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      } catch {
        /* sin portapapeles: queda el input para copiar a mano */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      const input = document.getElementById("enlace-empresa") as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function otro() {
    setEnlace("");
    setCaducaEn(null);
    setNota("");
    setValores({});
    setError("");
  }

  return (
    <>
      <div className="section-head">
        <div className="dot" />
        <h3>Enlace para la empresa</h3>
      </div>
      <div className="card">
        {enlace ? (
          <>
            <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
              Enlace creado{nota ? ` para «${nota}»` : ""}. Sirve para{" "}
              <strong>un solo envío</strong> y caduca el{" "}
              <strong>
                {caducaEn?.toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              . Si necesitas mandárselo a otra empresa, genera uno nuevo.
            </p>
            <div className="field">
              <label>Enlace público</label>
              <div className="enlace-row">
                <input id="enlace-empresa" type="text" value={enlace} readOnly />
                <button type="button" className="btn-copiar" onClick={copiar}>
                  {copiado ? "¡Copiado!" : "Copiar enlace"}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center" }}>
              <button type="button" className="btn-action" onClick={otro}>
                Generar otro enlace
              </button>
              <Link href="/convenios/enlaces" style={{ color: "var(--marca-rojo)", fontSize: 14 }}>
                Ver todos los enlaces →
              </Link>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75, fontSize: 14 }}>
              Genera un enlace para que la empresa rellene el convenio ella misma. Cada enlace
              sirve para <strong>un solo envío</strong> y caduca a los {DIAS_VALIDEZ_POR_DEFECTO}{" "}
              días.
              {campos.length > 0
                ? " Los valores que fijes aquí quedan guardados en el servidor: la empresa los verá ya rellenos y no podrá cambiarlos."
                : ""}
            </p>

            <div className="field">
              <label>¿Para quién es? (solo lo ves tú)</label>
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Bimbo · Ana Ruiz"
                maxLength={200}
              />
            </div>

            {campos.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <CamposFijables campos={campos} valores={valores} onChange={setCampo} />
              </div>
            )}

            {error && (
              <div className="error-bar" style={{ marginTop: 16, marginBottom: 0 }}>
                No se ha podido crear el enlace: {error}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <button type="button" className="btn-action primary" onClick={generar} disabled={generando}>
                {generando ? "Generando…" : "Generar enlace"}
              </button>
            </div>
          </>
        )}
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
