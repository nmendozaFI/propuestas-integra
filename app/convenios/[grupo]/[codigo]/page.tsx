"use client";

// ═══════════════════════════════════════════════════════════════════════
// /convenios/[grupo]/[codigo]  → FORMULARIO INTERNO (con contraseña)
// ═══════════════════════════════════════════════════════════════════════
// Misma experiencia que antes (el equipo rellena y descarga), más el panel
// "Copiar enlace para la empresa". Usa la versión viva del almacén vía manifest
// (cargarPlantillaBytes, que ya resuelve override de Cloudinary / seed).
// ═══════════════════════════════════════════════════════════════════════

import { useParams } from "next/navigation";
import Link from "next/link";
import Gate from "@/components/convenios/Gate";
import Shell from "@/components/convenios/Shell";
import FormularioConvenio from "@/components/FormularioConvenio";
import CopiarEnlace from "@/components/convenios/CopiarEnlace";
import { getTipoConvenio, type GrupoConvenioId } from "@/lib/tipos-convenio";
import { camposFijables } from "@/lib/convenios-fijables";
import { cargarPlantillaBytes } from "@/lib/plantillas-cliente";

function fechaHoyTexto(): string {
  return new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function FormularioInterno() {
  const params = useParams<{ grupo: string; codigo: string }>();
  const grupoId = params.grupo as GrupoConvenioId;
  const codigo = (params.codigo || "").toUpperCase();
  const tipo = getTipoConvenio(codigo);

  if (!tipo?.plantilla || !tipo.campos) {
    return (
      <Gate>
        <Shell grupo={grupoId}>
          <div className="card">
            <p style={{ margin: 0 }}>
              Convenio no encontrado.{" "}
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

  const plantilla = tipo.plantilla;

  return (
    <Gate>
      <Shell grupo={grupoId} codigo={codigo}>
        <CopiarEnlace codigo={codigo} campos={camposFijables(codigo)} />
        <FormularioConvenio
          codigo={codigo}
          cargarBytes={() => cargarPlantillaBytes(plantilla)}
          valoresIniciales={{
            lugarFirma: "Madrid",
            fechaFirma: fechaHoyTexto(),
          }}
        />
      </Shell>
    </Gate>
  );
}
