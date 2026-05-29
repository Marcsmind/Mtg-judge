import React, { useEffect } from "react";
import { Crown } from "lucide-react";
import { track } from "../services/analytics";

interface UpgradePromptProps {
  message: string;
  compact?: boolean;
}

/** Inline upgrade nudge. Dispatches 'go-to-settings' to navigate to the plan panel. */
export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ message, compact = false }) => {
  useEffect(() => { track("upgrade_prompt_shown", { message }); }, [message]);
  return (
  <div style={{
    display: "flex", alignItems: compact ? "center" : "flex-start",
    gap: "10px", padding: compact ? "10px 14px" : "14px 16px",
    background: "rgba(139,92,246,0.07)",
    border: "1px solid rgba(139,92,246,0.25)",
    borderRadius: "10px",
  }}>
    <Crown size={compact ? 14 : 16} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: compact ? 0 : "1px" }} />
    <span style={{ flex: 1, fontSize: compact ? "0.82rem" : "0.88rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
      {message}
    </span>
    <button
      onClick={() => {
        track("upgrade_prompt_clicked", { message });
        window.dispatchEvent(new CustomEvent("go-to-settings"));
      }}
      style={{
        flexShrink: 0, padding: compact ? "5px 10px" : "6px 13px",
        background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)",
        borderRadius: "8px", cursor: "pointer",
        color: "var(--accent-purple)", fontSize: compact ? "0.78rem" : "0.82rem",
        fontWeight: 700, whiteSpace: "nowrap",
      }}
    >
      Upgrade →
    </button>
  </div>
  );
};
