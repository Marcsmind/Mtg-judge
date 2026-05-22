/**
 * Toast / Snackbar notification system
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast("Room code copied!", "success");
 *
 * Wrap your app (or the relevant subtree) in <ToastProvider>.
 */
import React, { createContext, useCallback, useContext, useState } from "react";
import { Check, AlertCircle, Info, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: React.ReactNode }> = {
    success: {
      bg:     "rgba(16,185,129,0.12)",
      border: "rgba(16,185,129,0.35)",
      icon:   <Check size={15} color="var(--accent-emerald)" />,
    },
    error: {
      bg:     "rgba(244,63,94,0.12)",
      border: "rgba(244,63,94,0.35)",
      icon:   <AlertCircle size={15} color="var(--accent-rose)" />,
    },
    info: {
      bg:     "rgba(139,92,246,0.12)",
      border: "rgba(139,92,246,0.35)",
      icon:   <Info size={15} color="var(--accent-purple)" />,
    },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed bottom-centre */}
      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", gap: "8px",
            zIndex: 9999, pointerEvents: "none", alignItems: "center",
          }}
        >
          {toasts.map(t => {
            const s = variantStyles[t.variant];
            return (
              <div
                key={t.id}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  backdropFilter: "blur(12px)",
                  borderRadius: "10px", padding: "10px 16px",
                  fontSize: "0.88rem", fontWeight: 600,
                  color: "var(--text-primary)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
                  pointerEvents: "all",
                  animation: "toast-in 0.2s ease-out",
                  maxWidth: "340px",
                }}
              >
                {s.icon}
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", padding: "2px", display: "flex",
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};
