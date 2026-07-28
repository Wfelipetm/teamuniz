import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b1120" />
        <meta name="application-name" content="Team Muniz" />
        <meta name="description" content="Team Muniz — Performance & Discipline" />

        {/* iOS / Safari PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Team Muniz" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Android */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Viewport — garante que o app não escale em mobile, viewport-fit=cover para notch do iPhone */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* Disable pull-to-refresh no mobile/PWA */}
        <style>{`
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          @media (max-width: 500px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            .stats-grid .stat-box-label { font-size: 12px !important; }
          }
        `}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
