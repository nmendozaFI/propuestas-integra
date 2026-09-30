// ═══════════════════════════════════════════════════════════════════════
// PANTALLA PÚBLICA DEL CONVENIO (pasos + aviso + formulario)
// ═══════════════════════════════════════════════════════════════════════
//
// Lo que ve la empresa, venga por enlace abierto (/convenio/[codigo]) o por
// enlace de un solo uso (/convenio/t/[token]). La ÚNICA diferencia entre las dos
// rutas es de dónde salen los `fijados` y si hay `token`; todo lo demás —los tres
// pasos, el aviso de privacidad, el formulario— es idéntico, así que vive aquí.
//
// Los textos cambian según dos flags del catálogo (lib/tipos-convenio.ts):
//   descargaPdfPublica → se entrega PDF en vez de Word
//   flujoEnvio         → no se descarga nada: se revisa en pantalla y se envía
//
// Server Component.
// ═══════════════════════════════════════════════════════════════════════

import type { TipoConvenio } from '@/lib/tipos-convenio';
import MarcoPublico, { Paso } from '@/components/convenios/MarcoPublico';
import ConvenioPublicoForm from '@/components/ConvenioPublicoForm';

export default function PantallaConvenio({
  tipo,
  fijados,
  token,
}: {
  tipo: TipoConvenio;
  /** Campos que fija la Fundación: del query param, o de la base si hay token. */
  fijados: Record<string, string>;
  /** Presente solo en la ruta con token; se consume al enviar. */
  token?: string;
}) {
  const esPdf = !!tipo.descargaPdfPublica;
  const esEnvio = !!tipo.flujoEnvio;

  // Defaults públicos: lugar de firma "Madrid", fecha de firma vacía
  // (la empresa firmará otro día).
  const valoresIniciales: Record<string, string> = {
    lugarFirma: 'Madrid',
    fechaFirma: '',
  };

  const pasos = (
    <>
      <Paso n={1}>
        <strong>Rellena</strong> los datos de tu empresa
        {esEnvio ? ' y sube tu logo.' : ' y, si quieres, sube tu logo.'}
      </Paso>
      <Paso n={2}>
        {esEnvio ? (
          <>
            <strong>Revisa</strong> el documento ya cumplimentado en pantalla.
          </>
        ) : (
          <>
            <strong>Descarga</strong> el {esPdf ? 'PDF' : 'Word'} ya cumplimentado.
          </>
        )}
      </Paso>
      <Paso n={3}>
        {esEnvio ? (
          <>
            <strong>Acepta y envía</strong>: nos llega al instante y te lo devolvemos firmado.
          </>
        ) : (
          <>
            <strong>Revísalo y envíalo nuevamente</strong> a la Fundación.
          </>
        )}
      </Paso>
    </>
  );

  const aviso = esEnvio ? (
    <>
      El documento se rellena aquí mismo, en tu navegador. Al pulsar enviar, el PDF se remite
      únicamente a Fundación Íntegra: se convierte en un servicio seguro (Unión Europea) que no
      conserva ninguna copia, y tus datos no se usan para nada más.
    </>
  ) : esPdf ? (
    <>
      El documento se rellena aquí mismo, en tu navegador. Para entregártelo en PDF, se convierte
      en un servicio de conversión seguro (Unión Europea) y no se conserva ninguna copia.
    </>
  ) : (
    <>
      Tus datos no salen de tu ordenador: el documento se genera aquí mismo, en tu navegador. No
      se envía nada a ningún servidor.
    </>
  );

  return (
    <MarcoPublico titulo={tipo.label} codigo={tipo.codigo} pasos={pasos} aviso={aviso}>
      <ConvenioPublicoForm
        codigo={tipo.codigo}
        valoresIniciales={valoresIniciales}
        fijados={fijados}
        token={token}
      />
    </MarcoPublico>
  );
}
