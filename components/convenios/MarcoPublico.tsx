// ═══════════════════════════════════════════════════════════════════════
// MARCO DE LAS PÁGINAS PÚBLICAS (banda de marca + pasos + aviso + pie)
// ═══════════════════════════════════════════════════════════════════════
//
// Lo comparten las tres pantallas que ve la empresa:
//   /convenio/[codigo]      (enlace abierto, plantillas que solo se descargan)
//   /convenio/t/[token]     (enlace de un solo uso)
//   la pantalla de "enlace no válido"
//
// Estaba todo escrito dentro de /convenio/[codigo]/page.tsx. Al aparecer la ruta
// con token habría que haberlo copiado entero, así que vive aquí: un cambio de
// marca o de dirección postal se hace una vez.
//
// Server Component (sin estado ni eventos).
// ═══════════════════════════════════════════════════════════════════════

import { MARCA } from '@/lib/marca';

export default function MarcoPublico({
  titulo,
  codigo,
  pasos,
  aviso,
  children,
}: {
  titulo: string;
  /** Código de plantilla bajo el título (ENT-01). Se omite en la página de error. */
  codigo?: string;
  /** Los tres pasos de la cabecera. Sin ellos, no se pinta el bloque. */
  pasos?: React.ReactNode;
  /** Aviso de privacidad. Sin él, no se pinta el bloque. */
  aviso?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Banda roja de marca a todo el ancho con el logo negativo centrado */}
      <div className="publico-banda">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="publico-logo" src={MARCA.logoNegativo} alt="Fundación Íntegra" />
      </div>

      <div className="publico-wrap">
        <header className="publico-header">
          <h1 className="publico-titulo">{titulo}</h1>
          {codigo && <p className="publico-codigo">{codigo}</p>}
        </header>

        {pasos && <div className="publico-pasos">{pasos}</div>}

        {aviso && (
          <div className="aviso-privacidad">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>{aviso}</span>
          </div>
        )}

        <main className="publico-main">{children}</main>

        <footer className="publico-footer">
          Fundación Íntegra · Paseo de la Castellana 86, 2ª pl., 28046 Madrid ·{' '}
          <a href="https://fundacionintegra.org" target="_blank" rel="noopener noreferrer">
            fundacionintegra.org
          </a>
        </footer>
      </div>
    </>
  );
}

/** Un paso numerado de la cabecera. */
export function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="paso">
      <div className="paso-num">{n}</div>
      <div className="paso-text">{children}</div>
    </div>
  );
}
