'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

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
        className={pathname === '/convenios' ? 'active' : ''}
      >
        Convenios
      </Link>
    </nav>
  );
}