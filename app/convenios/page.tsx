"use client";

// ═══════════════════════════════════════════════════════════════════════
// /convenios  → ÍNDICE DE GRUPOS (interno, con contraseña)
// ═══════════════════════════════════════════════════════════════════════
// La navegación grupo → plantilla vive en la URL:
//   /convenios → /convenios/[grupo] → /convenios/[grupo]/[codigo]
// ═══════════════════════════════════════════════════════════════════════

import { useRouter } from "next/navigation";
import Gate from "@/components/convenios/Gate";
import Shell from "@/components/convenios/Shell";
import {
  GRUPOS_CONVENIO,
  tiposDeGrupo,
  contarDisponibles,
} from "@/lib/tipos-convenio";

export default function ConveniosIndex() {
  return (
    <Gate>
      <Shell>
        <Grupos />
      </Shell>
    </Gate>
  );
}

function Grupos() {
  const router = useRouter();
  return (
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
              onClick={() => activo && router.push(`/convenios/${g.id}`)}
              disabled={!activo}
              style={tarjetaGrupoStyle(activo)}
            >
              <div style={{ fontSize: 30, lineHeight: 1 }}>{g.emoji}</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{g.label}</div>
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
  );
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
