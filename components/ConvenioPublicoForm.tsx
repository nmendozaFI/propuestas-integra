"use client";

// Wrapper cliente de la ruta pública: inyecta el loader sin contraseña
// (endpoint /api/convenio-publico) al FormularioConvenio compartido.

import FormularioConvenio from "@/components/FormularioConvenio";
import { cargarPlantillaConvenioPublica } from "@/lib/convenio-publico-cliente";

export default function ConvenioPublicoForm({
  codigo,
  valoresIniciales,
  fijados,
}: {
  codigo: string;
  valoresIniciales?: Record<string, string>;
  fijados?: Record<string, string>;
}) {
  return (
    <FormularioConvenio
      codigo={codigo}
      cargarBytes={() => cargarPlantillaConvenioPublica(codigo)}
      valoresIniciales={valoresIniciales}
      fijados={fijados}
      fijadosReadOnly
    />
  );
}
