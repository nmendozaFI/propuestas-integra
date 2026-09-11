"use client";

// ═══════════════════════════════════════════════════════════════════════
// /convenios/[grupo]  → PLANTILLAS DEL GRUPO (interno, con contraseña)
// ═══════════════════════════════════════════════════════════════════════

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Gate from "@/components/convenios/Gate";
import Shell from "@/components/convenios/Shell";
import {
  GRUPOS_CONVENIO,
  tiposDeGrupo,
  type GrupoConvenioId,
} from "@/lib/tipos-convenio";

export default function PlantillasDeGrupo() {
  const params = useParams<{ grupo: string }>();
  const grupoId = params.grupo as GrupoConvenioId;
  const grupo = GRUPOS_CONVENIO.find((g) => g.id === grupoId);

  if (!grupo) {
    return (
      <Gate>
        <Shell>
          <div className="card">
            <p style={{ margin: 0 }}>
              Grupo no encontrado.{" "}
              <Link href="/convenios" style={{ color: "var(--marca-rojo)" }}>
                Volver a convenios
              </Link>
              .
            </p>
          </div>
        </Shell>
      </Gate>
    );
  }

  return (
    <Gate>
      <Shell grupo={grupoId}>
        <Lista grupoId={grupoId} grupoLabel={grupo.label} />
      </Shell>
    </Gate>
  );
}

function Lista({
  grupoId,
  grupoLabel,
}: {
  grupoId: GrupoConvenioId;
  grupoLabel: string;
}) {
  const router = useRouter();
  return (
    <>
      <div className="section-head">
        <div className="dot" />
        <h3>Plantillas · {grupoLabel}</h3>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {tiposDeGrupo(grupoId).map((t) => {
          const activo = !t.proximamente;
          return (
            <button
              key={t.codigo}
              onClick={() =>
                activo && router.push(`/convenios/${grupoId}/${t.codigo}`)
              }
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
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>
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
  );
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
