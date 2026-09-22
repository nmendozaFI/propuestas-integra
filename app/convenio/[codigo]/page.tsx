// ═══════════════════════════════════════════════════════════════════════
// /convenio/[codigo]  → RUTA PÚBLICA (la empresa rellena el convenio)
// ═══════════════════════════════════════════════════════════════════════
//
// Sin contraseña y sin la barra de navegación de la app (el Navbar se oculta
// solo en /convenio/…). Server Component: valida el código, lee los campos que
// la Fundación fija por query param y los pasa al formulario compartido.
//
// El .docx se genera ÍNTEGRAMENTE en el navegador (JSZip): los datos del
// formulario no se envían a ningún servidor. Por eso mostramos el aviso de
// privacidad y la plantilla se descarga vía el endpoint público de un solo
// convenio (versión viva del almacén, sin exponer el manifest).
// ═══════════════════════════════════════════════════════════════════════

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTipoConvenio } from '@/lib/tipos-convenio';
import { MARCA } from '@/lib/marca';
import ConvenioPublicoForm from '@/components/ConvenioPublicoForm';

type Params = { codigo: string };
type Search = Record<string, string | string[] | undefined>;

function normalizarCodigo(raw: string): string {
  return (raw || '').toUpperCase();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const tipo = getTipoConvenio(normalizarCodigo(codigo));
  const titulo = tipo
    ? `${tipo.label} · Fundación Íntegra`
    : 'Convenio · Fundación Íntegra';
  const descripcion =
    'Rellena, descarga y devuelve firmado tu convenio con Fundación Íntegra.';
  return {
    title: titulo,
    description: descripcion,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descripcion,
      type: 'website',
      locale: 'es_ES',
      images: [{ url: MARCA.ogConvenio, width: 1200, height: 630, alt: 'Fundación Íntegra' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      images: [MARCA.ogConvenio],
    },
  };
}

export default async function ConvenioPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { codigo: rawCodigo } = await params;
  const codigo = normalizarCodigo(rawCodigo);
  const tipo = getTipoConvenio(codigo);
  if (!tipo?.plantilla || !tipo.campos) notFound();

  // Plantillas que se descargan en PDF (calcado del Word) en vez de .docx.
  const esPdf = !!tipo.descargaPdfPublica;

  // Campos fijados por la Fundación: cualquier query param cuyo nombre coincida
  // con la `key` de un campo de esta plantilla.
  const sp = await searchParams;
  const keysValidas = new Set(tipo.campos.map((c) => c.key));
  const fijados: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (!keysValidas.has(k)) continue;
    const valor = Array.isArray(v) ? v[0] : v;
    if (valor != null && valor.trim() !== '') fijados[k] = valor;
  }

  // Defaults públicos: lugar de firma "Madrid", fecha de firma vacía
  // (la empresa firmará otro día).
  const valoresIniciales: Record<string, string> = {
    lugarFirma: 'Madrid',
    fechaFirma: '',
  };

  return (
    <>
      {/* Banda roja de marca a todo el ancho con el logo negativo centrado */}
      <div className="publico-banda">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="publico-logo" src={MARCA.logoNegativo} alt="Fundación Íntegra" />
      </div>

      <div className="publico-wrap">
        <header className="publico-header">
          <h1 className="publico-titulo">{tipo.label}</h1>
          <p className="publico-codigo">{tipo.codigo}</p>
        </header>

        <div className="publico-pasos">
          <div className="paso">
            <div className="paso-num">1</div>
            <div className="paso-text">
              <strong>Rellena</strong> los datos de tu empresa y, si quieres, sube
              tu logo.
            </div>
          </div>
          <div className="paso">
            <div className="paso-num">2</div>
            <div className="paso-text">
              <strong>Descarga</strong> el {esPdf ? "PDF" : "Word"} ya
              cumplimentado.
            </div>
          </div>
          <div className="paso">
            <div className="paso-num">3</div>
            <div className="paso-text">
              <strong>Revísalo y envíalo nuevamente</strong> a la Fundación.
            </div>
          </div>
        </div>

        <div className="aviso-privacidad">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>
            {esPdf ? (
              <>
                El documento se rellena aquí mismo, en tu navegador. Para
                entregártelo en PDF, se convierte en un servicio de conversión
                seguro (Unión Europea) y no se conserva ninguna copia.
              </>
            ) : (
              <>
                Tus datos no salen de tu ordenador: el documento se genera aquí
                mismo, en tu navegador. No se envía nada a ningún servidor.
              </>
            )}
          </span>
        </div>

        <main className="publico-main">
          <ConvenioPublicoForm
            codigo={codigo}
            valoresIniciales={valoresIniciales}
            fijados={fijados}
          />
        </main>

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
