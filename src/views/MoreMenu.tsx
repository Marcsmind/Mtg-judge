import React from "react";
import { Shuffle, Wand2, Trophy, Settings, ChevronRight, Package } from "lucide-react";
import type { TabId } from "../constants/tabIds";

interface MoreMenuProps {
  onNavigate: (tab: TabId) => void;
}

export const MoreMenu: React.FC<MoreMenuProps> = ({ onNavigate }) => {
  const menuItems = [
    { id: "turns",       label: "Turn Order",   icon: Shuffle,  color: "var(--accent-purple)" },
    { id: "draft",       label: "Draft Mode",   icon: Package,  color: "var(--accent-cyan)"   },
    { id: "deck",        label: "Deck Builder", icon: Wand2,    color: "#a78bfa"               },
    { id: "leaderboard", label: "Stats",        icon: Trophy,   color: "var(--accent-gold)"   },
    { id: "settings",    label: "Settings",     icon: Settings, color: "var(--text-secondary)" },
  ] as const;

  return (
    <div className="view-container" style={{ padding: "24px", maxWidth: "800px", margin: "0 auto", width: "100%", animation: "fadeIn 0.3s ease" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>Menu</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "4px" }}>Access more tools and application settings.</p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="glass-panel sidebar-link"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                width: "100%",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-color)",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                e.currentTarget.style.borderColor = item.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <Icon size={24} style={{ color: item.color }} />
                <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {item.label}
                </span>
              </div>
              <ChevronRight size={20} color="var(--text-muted)" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
