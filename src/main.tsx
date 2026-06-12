import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import * as Sentry from '@sentry/react'
import './index.css'
import './services/analytics' // side-effect import — initialises PostHog on module load
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { AppErrorFallback } from './components/AppErrorFallback.tsx'

// ── Sentry error monitoring ────────────────────────────────────────────────────
// Set VITE_SENTRY_DSN in .env (and Netlify env vars) after creating a Sentry project.
// No-op when the DSN is absent (local dev, pre-setup).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}

// Service-worker auto-update with a subtle toast notification
registerSW({
  onNeedRefresh() {
    // Show a small "Update ready — tap to reload" banner
    const toast = document.createElement('div')
    toast.id = 'pwa-toast'
    toast.innerHTML = `
      <span>✨ Update ready</span>
      <button onclick="window.location.reload()" style="
        margin-left:12px; padding:4px 12px; border-radius:6px;
        background:var(--accent-purple,#8b5cf6); color:#fff;
        border:none; cursor:pointer; font-weight:600; font-size:0.8rem;">
        Reload
      </button>
      <button onclick="document.getElementById('pwa-toast').remove()" style="
        margin-left:6px; padding:4px 10px; border-radius:6px;
        background:rgba(255,255,255,0.08); color:#ccc;
        border:none; cursor:pointer; font-size:0.8rem;">
        Later
      </button>
    `
    Object.assign(toast.style, {
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(10,8,16,0.96)',
      border: '1px solid rgba(139,92,246,0.35)',
      borderRadius: '12px', padding: '10px 16px',
      display: 'flex', alignItems: 'center',
      color: '#fff', fontSize: '0.88rem', fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      zIndex: '9999', backdropFilter: 'blur(12px)',
      fontFamily: 'var(--font-body, Inter, sans-serif)',
    })
    document.body.appendChild(toast)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error }) => <AppErrorFallback error={error as Error} />}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
