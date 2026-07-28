import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090B" />
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

        {/* ── Design system: tokens, keyframes, utilities ── */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            /* Surfaces */
            --bg: #09090B;
            --bg-raised: #0F0F12;
            --card: #111114;
            --card-hover: #16161A;
            /* Borders */
            --border: #1F1F24;
            --border-hover: #2E2E36;
            --border-focus: #3B82F6;
            /* Brand accent */
            --accent: #3B82F6;
            --accent-strong: #2563EB;
            --accent-soft: rgba(59,130,246,0.12);
            --accent-glow: rgba(59,130,246,0.35);
            /* Micro-highlight */
            --gold: #FACC15;
            --gold-soft: rgba(250,204,21,0.12);
            /* Status (semantic) */
            --success: #22C55E;
            --success-soft: rgba(34,197,94,0.12);
            --danger: #EF4444;
            --danger-soft: rgba(239,68,68,0.10);
            --warning: #F59E0B;
            --warning-soft: rgba(245,158,11,0.12);
            --whatsapp: #25D366;
            /* Text */
            --text: #FAFAFA;
            --text-2: #A1A1AA;
            --text-3: #70707B;
            /* Radius */
            --r-lg: 16px;
            --r-md: 12px;
            --r-sm: 8px;
            --r-full: 999px;
            /* Shadows */
            --shadow-1: 0 1px 2px rgba(0,0,0,.5);
            --shadow-2: 0 8px 32px rgba(0,0,0,.45);
            /* Hero glow */
            --hero-glow: radial-gradient(ellipse at top, rgba(59,130,246,.15), transparent 60%);
          }

          * { box-sizing: border-box; }
          html, body {
            margin: 0; padding: 0;
            background: var(--bg);
            color: var(--text);
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
          }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 3px; }
          ::selection { background: var(--accent-soft); }

          button { font-family: inherit; }
          input, select, textarea { font-family: inherit; color-scheme: dark; }
          input::placeholder, textarea::placeholder { color: var(--text-3); }
          input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--border-focus) !important;
            box-shadow: 0 0 0 3px var(--accent-soft);
          }
          input, select, textarea { transition: border-color .15s ease, box-shadow .15s ease; }

          /* ── Keyframes ── */
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes spin { to { transform: rotate(360deg); } }

          /* ── Utilities ── */
          .fade-up { animation: fadeInUp .35s ease-out; }

          .tm-card { transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
          .tm-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }

          .tm-btn { transition: all .15s ease; }
          .tm-btn:active:not(:disabled) { transform: scale(.98); }
          .tm-btn:disabled { opacity: .4; cursor: not-allowed; }
          .tm-btn-primary:hover:not(:disabled) {
            background: var(--accent-strong) !important;
            box-shadow: 0 0 18px var(--accent-glow);
          }
          .tm-btn-ghost:hover:not(:disabled) { border-color: var(--border-hover) !important; background: var(--card-hover) !important; }
          .tm-btn-danger:hover:not(:disabled) { background: rgba(239,68,68,.18) !important; }

          .tm-row { transition: background .15s ease, border-color .15s ease; }
          .tm-row:hover { background: var(--card-hover) !important; }

          .tm-modal-overlay { animation: fadeIn .15s ease-out; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
          .tm-modal { animation: fadeInUp .2s ease-out; }

          .tm-dock {
            position: relative;
            background: rgba(9,9,11,0.92);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 -8px 32px rgba(0,0,0,0.35);
            padding-bottom: env(safe-area-inset-bottom);
          }
          .tm-dock::before {
            content: "";
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 720px;
            border-top: 1px solid var(--border);
          }
          .tm-dock-inner { max-width: 520px; margin: 0 auto; display: flex; gap: 4px; padding: 6px 10px; }
          .tm-nav-item { transition: color .15s ease, background .15s ease; }
          .tm-nav-item:hover { color: var(--text) !important; }

          .tm-link-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
          .tm-link-card:hover { transform: translateY(-3px); border-color: var(--border-hover) !important; box-shadow: 0 8px 28px rgba(59,130,246,0.15) !important; }

          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          @media (max-width: 500px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
          }

          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
          }
        ` }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
