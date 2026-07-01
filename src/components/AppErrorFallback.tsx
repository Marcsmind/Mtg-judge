import React from "react";

export const AppErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100dvh",
      padding: "32px",
      background: "#08070b",
      color: "#fff",
      gap: "20px",
      textAlign: "center",
      fontFamily: "Inter, sans-serif",
    }}
  >
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
    <div>
      <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "6px" }}>Something went wrong</p>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", lineHeight: 1.5 }}>
        {error?.message || "An unexpected error occurred. Please restart the app."}
      </p>
    </div>
    <button
      onClick={() => window.location.reload()}
      style={{
        padding: "12px 28px",
        borderRadius: "10px",
        background: "color-mix(in srgb, var(--accent-purple) 15%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent-purple) 40%, transparent)",
        color: "#c4b5fd",
        fontWeight: 600,
        fontSize: "0.9rem",
        cursor: "pointer",
      }}
    >
      Restart App
    </button>
  </div>
);
