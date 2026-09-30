// ═══════════════════════════════════════════════════════════════════════
// ENLACE NO VÁLIDO (usado, caducado, anulado o inexistente)
// ═══════════════════════════════════════════════════════════════════════
//
// Lo ve la empresa, así que explica qué ha pasado y qué hacer, sin jerga y sin
// pinta de error del sistema.
//
// DECISIÓN (Nicolás, 30 sept. 2026): **no se muestra ningún correo de contacto.**
// Se valoró poner administracion@fundacionintegra.org, pero ese buzón quedaría
// expuesto a cualquiera que tenga un enlace caducado. Se remite a la persona de
// la Fundación con la que ya está hablando: siempre la hay, porque el enlace se
// lo mandó alguien.
// ═══════════════════════════════════════════════════════════════════════

import MarcoPublico from '@/components/convenios/MarcoPublico';

export type MotivoNoValido =
  | 'usado'
  | 'caducado'
  | 'anulado'
  | 'desconocido'
  /** La URL sin token de una plantilla que exige enlace personalizado (ENT-01). */
  | 'requiere-enlace';

const TEXTOS: Record<MotivoNoValido, { titulo: string; explicacion: string }> = {
  usado: {
    titulo: 'Este enlace ya se ha utilizado',
    explicacion:
      'El convenio se envió correctamente a Fundación Íntegra y el enlace quedó cerrado. ' +
      'Cada enlace sirve para un único envío.',
  },
  caducado: {
    titulo: 'Este enlace ha caducado',
    explicacion:
      'Los enlaces tienen una validez limitada por seguridad. Este ya no admite envíos, ' +
      'pero se puede generar uno nuevo sin problema.',
  },
  anulado: {
    titulo: 'Este enlace ya no está activo',
    explicacion: 'Fundación Íntegra lo ha anulado. Si aún tienes que enviar el convenio, se te facilitará otro.',
  },
  'requiere-enlace': {
    titulo: 'Necesitas un enlace personalizado',
    explicacion:
      'Este convenio se cumplimenta a través de un enlace propio, que Fundación Íntegra genera ' +
      'para cada entidad. Esta dirección, por sí sola, no permite enviarlo.',
  },
  desconocido: {
    titulo: 'No encontramos este enlace',
    explicacion:
      'Puede que la dirección esté incompleta. Comprueba que has copiado el enlace entero, ' +
      'tal y como te llegó.',
  },
};

export default function EnlaceNoValido({ motivo }: { motivo: MotivoNoValido }) {
  const { titulo, explicacion } = TEXTOS[motivo];

  return (
    <MarcoPublico titulo={titulo}>
      <div className="card">
        <p style={{ marginTop: 0, lineHeight: 1.7 }}>{explicacion}</p>
        <p style={{ marginBottom: 0, lineHeight: 1.7 }}>
          Para continuar, <strong>ponte en contacto con la persona de Fundación Íntegra con
          quien estás tramitando el convenio</strong> y te enviará un enlace nuevo.
        </p>
      </div>
    </MarcoPublico>
  );
}
