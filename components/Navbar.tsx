'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  // La ruta pública de la empresa (/convenio/…) no lleva la barra de navegación
  // interna. OJO: no confundir con /convenios (índice interno), que sí la lleva.
  if (pathname === '/convenio' || pathname.startsWith('/convenio/')) {
    return null;
  }

  return (
    <nav className="navbar">
      <Link
        href="/"
        className={pathname === '/' ? 'active' : ''}
      >
        Propuestas Alianzas
      </Link>
      <Link
        href="/convenios"
        className={pathname.startsWith('/convenios') ? 'active' : ''}
      >
        Convenios
      </Link>
     <Link
        href="/plantillas"
        className={pathname === '/plantillas' ? 'active' : ''}
      >
        Plantillas
      </Link>
    </nav>
  );
}
