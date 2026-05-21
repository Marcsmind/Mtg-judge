import React from "react";
import { Scale, Heart, Dices, Shuffle, Settings, Search, BookOpen, Menu, Wand2 } from "lucide-react";
import type { TabId } from "../constants/tabIds";

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  openCodex: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, openCodex, collapsed, onToggleCollapsed }) => {
  const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "judge", label: "AI Judge",      icon: Scale     },
    { id: "life",  label: "Life Counter",  icon: Heart     },
    { id: "dice",  label: "Dice & Coins",  icon: Dices     },
    { id: "turns", label: "Turn Order",    icon: Shuffle   },
    { id: "rules", label: "Quick Rules",   icon: BookOpen  },
    { id: "deck",  label: "Deck Builder",  icon: Wand2     },
  ];

  return (
    <aside
      className="glass-panel"
      onClick={collapsed ? onToggleCollapsed : undefined}
      style={{
        width: collapsed ? "64px" : "260px",
        height: "calc(100vh - 48px)",
        margin: "24px 0 24px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: collapsed ? "16px 8px" : "16px 16px",
        zIndex: 10,
        flexShrink: 0,
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), padding 0.22s ease",
        overflow: "hidden",
        cursor: collapsed ? "pointer" : "default",
      }}
    >
      <div>
        {/* ── Top bar: hamburger toggle + brand (when expanded) ── */}
        <div
          className="sidebar-brand"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            marginBottom: collapsed ? "20px" : "28px",
            gap: "10px",
          }}
        >
          {/* Logo square — always visible */}
          <div
            style={{
              width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
              background: "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 15px rgba(139,92,246,0.4)",
              animation: "pulse-glow 3s infinite",
            }}
          >
            <Scale size={20} color="#fff" />
          </div>

          {/* Brand text — only when expanded */}
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: "1.15rem", fontWeight: 800, letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
                NEXUS <span className="gradient-text">JUDGE</span>
              </h1>
              <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "1px", textTransform: "uppercase", marginTop: "-1px" }}>
                Commander Companion
              </p>
            </div>
          )}

          {/* Hamburger toggle — only when expanded (disappears when collapsed; click the bar to re-expand) */}
          {!collapsed && (
            <button
              onClick={e => { e.stopPropagation(); onToggleCollapsed(); }}
              className="sidebar-collapse-toggle"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "32px", height: "32px", flexShrink: 0,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px", color: "var(--text-muted)", cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <Menu size={16} />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav
          role="navigation"
          aria-label="Main navigation"
          style={{ display: "flex", flexDirection: "column", gap: "4px" }}
        >
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={e => { e.stopPropagation(); setActiveTab(item.id); }}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: "12px",
                  width: "100%",
                  padding: collapsed ? "12px 0" : "11px 12px",
                  background: isActive ? "rgba(139,92,246,0.12)" : "transparent",
                  border: "none",
                  borderRadius: "8px",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  fontSize: "0.93rem",
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
                }}
                onMouseEnter={e => {
                  if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text-primary)"; }
                }}
                onMouseLeave={e => {
                  if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }
                }}
              >
                <Icon size={18} style={{ color: isActive ? "var(--accent-purple)" : "var(--text-secondary)", flexShrink: 0 }} />
                {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls */}
      <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {/* Card Codex */}
        <button
          onClick={e => { e.stopPropagation(); openCodex(); }}
          className="glass-button"
          title={collapsed ? "Card Codex" : undefined}
          style={{
            width: "100%", justifyContent: "center",
            padding: collapsed ? "10px 0" : "10px",
            fontSize: "0.88rem", background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.05)",
          }}
        >
          <Search size={16} color="var(--accent-cyan)" />
          {!collapsed && <span className="sidebar-nav-label">Card Codex</span>}
        </button>

        {/* Settings */}
        <button
          onClick={e => { e.stopPropagation(); setActiveTab("settings"); }}
          className={`sidebar-link ${activeTab === "settings" ? "active" : ""}`}
          title={collapsed ? "Settings" : undefined}
          style={{
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: "12px", width: "100%",
            padding: collapsed ? "11px 0" : "11px 12px",
            background: activeTab === "settings" ? "rgba(139,92,246,0.12)" : "transparent",
            border: "none", borderRadius: "8px",
            color: activeTab === "settings" ? "#fff" : "var(--text-secondary)",
            fontSize: "0.93rem", fontWeight: activeTab === "settings" ? 600 : 500,
            cursor: "pointer", textAlign: "left",
            transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
          }}
          onMouseEnter={e => { if (activeTab !== "settings") { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
          onMouseLeave={e => { if (activeTab !== "settings") { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; } }}
        >
          <Settings size={18} style={{ color: activeTab === "settings" ? "var(--accent-purple)" : "var(--text-secondary)", flexShrink: 0 }} />
          {!collapsed && <span className="sidebar-nav-label">Settings</span>}
        </button>
      </div>
    </aside>
  );
};
