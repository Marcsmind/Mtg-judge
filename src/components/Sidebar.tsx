import React, { useState } from "react";
import { Scale, Heart, Dices, Shuffle, Settings, Search, BookOpen, Menu, Wand2, Trophy, Sparkles, HelpCircle, MoreHorizontal } from "lucide-react";
import type { TabId } from "../constants/tabIds";
import { BottomSheet } from "./BottomSheet";
import { useMobile } from "../hooks/useMobile";

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  openCodex: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// Primary tabs always shown in the mobile bottom bar (5 + "More" = 6 items)
const PRIMARY_IDS: TabId[] = ["judge", "life", "gamenight", "dice", "deck"];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, openCodex, collapsed, onToggleCollapsed }) => {
  const isMobile = useMobile(768);
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "judge",       label: "AI Judge",      icon: Scale       },
    { id: "life",        label: "Life Counter",  icon: Heart       },
    { id: "gamenight",   label: "Game Night",    icon: Sparkles    },
    { id: "dice",        label: "Dice & Coins",  icon: Dices       },
    { id: "turns",       label: "Turn Order",    icon: Shuffle     },
    { id: "deck",        label: "Deck Builder",  icon: Wand2       },
    { id: "leaderboard", label: "Leaderboard",   icon: Trophy      },
    { id: "rules",       label: "Quick Rules",   icon: BookOpen    },
    { id: "guide",       label: "App Guide",     icon: HelpCircle  },
  ];

  const primaryItems = navItems.filter(i => PRIMARY_IDS.includes(i.id));
  const moreItems    = navItems.filter(i => !PRIMARY_IDS.includes(i.id));

  // ── Mobile: bottom tab bar ──────────────────────────────────────────────────
  if (isMobile) {
    const makeTabBtn = (item: typeof navItems[0], onPress: () => void) => {
      const Icon = item.icon;
      const isActive = activeTab === item.id;
      return (
        <button
          key={item.id}
          onClick={onPress}
          className={`sidebar-link ${isActive ? "active" : ""}`}
          aria-current={isActive ? "page" : undefined}
          aria-label={item.label}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "3px", padding: "6px 4px",
            background: isActive ? "rgba(139,92,246,0.12)" : "transparent",
            border: "none", borderRadius: "8px",
            color: isActive ? "var(--accent-purple)" : "var(--text-muted)",
            fontSize: "0.55rem", fontWeight: isActive ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s ease",
          }}
        >
          <Icon size={20} />
          <span style={{ fontSize: "0.55rem", lineHeight: 1 }}>{item.label.split(" ")[0]}</span>
        </button>
      );
    };

    return (
      <aside className="glass-panel" style={{ /* CSS media query handles layout */ }}>
        <nav role="navigation" aria-label="Main navigation" style={{ display: "flex", flex: 1 }}>
          {primaryItems.map(item => makeTabBtn(item, () => setActiveTab(item.id)))}
          {/* "More" button — opens bottom drawer */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More navigation options"
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "3px", padding: "6px 4px",
              background: "transparent",
              border: "none", borderRadius: "8px",
              color: "var(--text-muted)",
              fontSize: "0.55rem", fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s ease",
            }}
          >
            <MoreHorizontal size={20} />
            <span style={{ fontSize: "0.55rem", lineHeight: 1 }}>More</span>
          </button>
        </nav>

        {/* "More" drawer */}
        {moreOpen && (
          <BottomSheet onClose={() => setMoreOpen(false)} zIndex={300} maxWidth="400px" padding="20px">
            <div style={{ marginBottom: "16px", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              More
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
              {moreItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setMoreOpen(false); }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", gap: "5px", padding: "10px 6px",
                      background: isActive ? "rgba(139,92,246,0.14)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isActive ? "rgba(139,92,246,0.4)" : "var(--border-color)"}`,
                      borderRadius: "10px", cursor: "pointer",
                      color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                      fontSize: "0.7rem", fontWeight: isActive ? 700 : 500,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {/* Card Codex */}
              <button
                onClick={() => { openCodex(); setMoreOpen(false); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: "5px", padding: "10px 6px",
                  background: "rgba(6,182,212,0.06)",
                  border: "1px solid rgba(6,182,212,0.2)",
                  borderRadius: "10px", cursor: "pointer",
                  color: "var(--accent-cyan)",
                  fontSize: "0.7rem", fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
              >
                <Search size={18} />
                <span>Card Codex</span>
              </button>
              {/* Settings */}
              <button
                onClick={() => { setActiveTab("settings"); setMoreOpen(false); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: "5px", padding: "10px 6px",
                  background: activeTab === "settings" ? "rgba(139,92,246,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${activeTab === "settings" ? "rgba(139,92,246,0.4)" : "var(--border-color)"}`,
                  borderRadius: "10px", cursor: "pointer",
                  color: activeTab === "settings" ? "var(--accent-purple)" : "var(--text-secondary)",
                  fontSize: "0.7rem", fontWeight: activeTab === "settings" ? 700 : 500,
                  transition: "all 0.15s ease",
                }}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>
            </div>
          </BottomSheet>
        )}
      </aside>
    );
  }

  // ── Desktop: collapsible sidebar ─────────────────────────────────────────────
  return (
    <aside
      className="glass-panel"
      onClick={collapsed ? onToggleCollapsed : undefined}
      style={{
        width: collapsed ? "64px" : "260px",
        height: "calc(100dvh - 48px)",
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
