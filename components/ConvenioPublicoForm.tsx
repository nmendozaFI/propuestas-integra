"use client";

// Wrapper cliente de la ruta pública: inyecta el loader sin contraseña
// (endpoint /api/convenio-publico) al FormularioConvenio compartido.

import FormularioConvenio from "@/components/FormularioConvenio";
import { cargarPlantillaConvenioPublica } from "@/lib/convenio-publico-cliente";
import { getTipoConvenio } from "@/lib/tipos-convenio";

export default function ConvenioPublicoForm({
  codigo,
  valoresIniciales,
  fijados,
}: {
  codigo: string;
  valoresIniciales?: Record<string, string>;
  fijados?: Record<string, string>;
}) {
  const tipo = getTipoConvenio(codigo);
  // En la ruta pública, las plantillas marcadas descargan PDF (no editable).
  const salida = tipo?.descargaPdfPublica ? "pdf" : "word";
  // Y las marcadas con `flujoEnvio` no descargan: se revisa y se envía.
  const modo = tipo?.flujoEnvio ? "envio" : "descarga";

  return (
    <FormularioConvenio
      codigo={codigo}
      cargarBytes={() => cargarPlantillaConvenioPublica(codigo)}
      valoresIniciales={valoresIniciales}
      fijados={fijados}
      fijadosReadOnly
      salida={salida}
      modo={modo}
    />
  );
}
