import React from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Scroll, Undo2 } from "lucide-react";

interface HistoryModalProps {
  history: string[];
  onUndo: () => void;
  canUndo: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  history,
  onUndo,
  canUndo,
  onClose,
}) => {
  return (
    <BottomSheet onClose={onClose} zIndex={400} padding="24px" maxWidth="400px">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", color: "var(--text-primary)" }}>
        <div style={{ background: "rgba(255,255,255,0.1)", padding: "8px", borderRadius: "12px", display: "flex" }}>
          <Scroll size={24} color="var(--accent-cyan)" />
        </div>
        <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Game History</h2>
      </div>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          background: canUndo ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${canUndo ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"}`,
          borderRadius: "12px", padding: "12px",
          color: canUndo ? "var(--text-primary)" : "var(--text-muted)",
          cursor: canUndo ? "pointer" : "not-allowed",
          fontSize: "0.95rem", fontWeight: 700,
          marginBottom: "20px",
          transition: "all 0.15s ease",
        }}
      >
        <Undo2 size={18} />
        <span>Undo Last Action</span>
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          maxHeight: "50vh",
          overflowY: "auto",
          paddingRight: "4px",
        }}
      >
        {history.length === 0 ? (
          <p
            style={{
              color: "var(--text-muted)",
              fontStyle: "italic",
              fontSize: "0.85rem",
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
                fontSize: "0.85rem",
                color: idx === 0 ? "#fff" : "var(--text-secondary)",
                fontWeight: idx === 0 ? 600 : 400,
                padding: "8px 12px",
                borderRadius: "8px",
                background: idx === 0 ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.03)",
                borderLeft: idx === 0 ? "3px solid var(--accent-purple)" : "3px solid transparent",
                wordBreak: "break-word",
                lineHeight: 1.4,
              }}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
};
