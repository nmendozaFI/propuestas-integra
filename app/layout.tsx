  import type { Metadata } from 'next';
  import './globals.css';
  import Navbar from '@/components/Navbar';

  export const metadata: Metadata = {
    title: 'Generador de propuestas · Fundación Íntegra',
    description: 'Equipo · Fundación Íntegra',
  };

  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <html lang="es">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>
        <Navbar />
        {children}
        </body>
      </html>
    );
  }
