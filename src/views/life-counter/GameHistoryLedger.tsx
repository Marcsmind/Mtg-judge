import React from "react";
import { Scroll, ChevronRight, ChevronLeft } from "lucide-react";

interface GameHistoryLedgerProps {
  history: string[];
  collapsed: boolean;
  onToggle: () => void;
}

export const GameHistoryLedger: React.FC<GameHistoryLedgerProps> = ({ history, collapsed, onToggle }) => {
  if (collapsed) {
    return (
      <div
        className="glass-panel"
        style={{
          width: "32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "10px 0",
          flexShrink: 0,
          gap: "10px",
        }}
      >
        <button
          onClick={onToggle}
          aria-label="Expand Game History"
          title="Expand Game History"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--accent-cyan)", padding: "4px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          letterSpacing: "0.5px",
          fontWeight: 600,
          textTransform: "uppercase",
          userSelect: "none",
        }}>
          History {history.length > 0 ? `(${Math.min(history.length, 99)})` : ""}
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        width: "230px",
        display: "flex",
        flexDirection: "column",
        padding: "14px",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "10px",
          marginBottom: "10px",
        }}
      >
        <Scroll size={16} color="var(--accent-cyan)" />
        <h3 style={{ fontSize: "0.92rem", fontWeight: 700, flex: 1 }}>Game History</h3>
        <button
          onClick={onToggle}
          aria-label="Collapse Game History"
          title="Collapse Game History"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", padding: "2px",
            display: "flex", alignItems: "center",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--accent-cyan)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
        {history.length === 0 ? (
          <p
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              fontSize: "0.72rem",
              textAlign: "center",
              marginTop: "20px",
            }}
          >
            No adjustments yet.
          </p>
        ) : (
          history.map((log, idx) => (
            <div
              key={idx}
              style={{
                fontSize: "0.7rem",
                color: idx === 0 ? "#fff" : "var(--text-secondary)",
                fontWeight: idx === 0 ? 600 : 400,
                padding: "5px 7px",
                borderRadius: "4px",
                background: idx === 0 ? "rgba(139,92,246,0.08)" : "transparent",
                borderLeft:
                  idx === 0 ? "2px solid var(--accent-purple)" : "none",
                wordBreak: "break-word",
                lineHeight: 1.35,
              }}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
