/**
 * AppGuide — data-driven help / readme view.
 *
 * To document a new feature: add a GuideFeature entry to the relevant
 * GuideSection's `features` array. No JSX changes required.
 * To document a new tab: add a new GuideSection to GUIDE_SECTIONS.
 */
import React, { useState } from "react";
import {
  Scale, Heart, Sparkles, Dices, Shuffle, Wand2, Trophy, BookOpen,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import type { TabId } from "../constants/tabIds";

interface GuideFeature {
  title: string;
  description: string;
  tips?: string[];
}

interface GuideSection {
  tabId: TabId;
  label: string;
  icon: React.ElementType;
  color: string;
  summary: string;
  features: GuideFeature[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    tabId: "judge",
    label: "AI Judge",
    icon: Scale,
    color: "var(--accent-purple)",
    summary: "Ask any MTG rules question in plain English. Powered by Google Gemini.",
    features: [
      {
        title: "Rules questions",
        description: "Type any rules scenario, targeting question, or card interaction. The AI references the current Comprehensive Rules and tournament policies.",
        tips: ["Be specific — include card names and the game state for more accurate rulings.", "Use @CardName to have the AI pull the oracle text automatically."],
      },
      {
        title: "Card lookup (@mentions)",
        description: "Tag any card in your question with @ (e.g. @Atraxa) and the AI will include its oracle text as context.",
      },
      {
        title: "Favorites",
        description: "Star any ruling to pin it at the top of your history — great for table rules you reference every session.",
      },
      {
        title: "Setup",
        description: "Add your Gemini API key in Settings to enable AI features. The key is stored locally on your device only.",
      },
    ],
  },
  {
    tabId: "life",
    label: "Life Counter",
    icon: Heart,
    color: "#f43f5e",
    summary: "Full Commander life tracking for 2–8 players with optional real-time multiplayer sync.",
    features: [
      {
        title: "Life totals",
        description: "Tap +/– to adjust life. Tap the life number to jump-edit by a large amount. Long-press the ±5 buttons to adjust by 10.",
      },
      {
        title: "Commander Damage",
        description: "Open the Cmd Dmg panel on any player card to track the 21-damage threshold from each commander source. Partner commanders are supported.",
      },
      {
        title: "Mechanics",
        description: "Enable Monarch, Initiative, Poison/Infect, Rad, City's Blessing, Day/Night, and token counters from the Controls bar.",
      },
      {
        title: "Commander",
        description: "Tap the wand (⚔) icon on any player card to set their commander. Scryfall autocomplete confirms the right card with art preview. You can also link a saved deck from My Decks.",
        tips: ["Setting a commander before a game ends lets it appear on the Leaderboard and tracks per-deck win stats."],
      },
      {
        title: "Multiplayer sync",
        description: "Create or join a room code to sync life totals in real time across devices. No account needed — just share the 4-letter code.",
      },
      {
        title: "Game history",
        description: "The History panel records every ±life change. On desktop it sits alongside the grid; on mobile, toggle it on from the Controls bar.",
      },
    ],
  },
  {
    tabId: "gamenight",
    label: "Game Night",
    icon: Sparkles,
    color: "var(--accent-cyan)",
    summary: "Full pre-game setup for Commander pods — commanders, colors, ready check, spin to pick who goes first.",
    features: [
      {
        title: "Host a Game",
        description: "Creates a room and generates a 4-letter code. Share it with your pod.",
      },
      {
        title: "Join a Game",
        description: "Enter the host's 4-letter code to join the lobby. Everyone sees each other's names, colors, and commanders in real time.",
      },
      {
        title: "Lobby setup",
        description: "Each player picks a color, sets their commander (with Scryfall art preview), and taps Ready. You can also select a commander from your saved decks.",
      },
      {
        title: "Spin to go first",
        description: "Once everyone is ready, the host starts the game. The Turn Order tab opens and the host spins the wheel — all devices animate to the same winner simultaneously.",
      },
      {
        title: "Life Counter handoff",
        description: "After the spin, the host taps Begin Game and all devices jump straight into the Life Counter with seating, colors, and commanders pre-loaded.",
      },
    ],
  },
  {
    tabId: "dice",
    label: "Dice & Coins",
    icon: Dices,
    color: "#f59e0b",
    summary: "Roll any polyhedral die, flip coins, and review your full roll history.",
    features: [
      {
        title: "Dice roller",
        description: "Roll d4, d6, d8, d10, d12, d20, or d100. Results are animated and logged.",
      },
      {
        title: "Coin flip",
        description: "Classic heads/tails flip with animation.",
      },
      {
        title: "Roll history",
        description: "Every result is saved in the session ledger so you can refer back. The ledger appears as a scrollable section on mobile.",
      },
    ],
  },
  {
    tabId: "turns",
    label: "Turn Order",
    icon: Shuffle,
    color: "#10b981",
    summary: "Randomly determine who goes first with an animated spin wheel.",
    features: [
      {
        title: "Single-device spin",
        description: "Add player names, hit Spin, and the wheel picks randomly.",
      },
      {
        title: "Multiplayer spin",
        description: "When coming from Game Night, the player list is locked to your lobby. The host spins and all devices animate to the same result.",
      },
      {
        title: "Rolloffs",
        description: "When multiple players tie, a rolloff automatically runs between tied players until a unique winner is found.",
      },
    ],
  },
  {
    tabId: "deck",
    label: "Deck Builder",
    icon: Wand2,
    color: "var(--accent-purple)",
    summary: "Build, import, and save your Commander decks. Track win rates per deck.",
    features: [
      {
        title: "AI Generate",
        description: "Describe a commander, strategy, and budget tier. Gemini generates a full 100-card list you can copy in Moxfield format.",
        tips: ["Requires a Gemini API key in Settings."],
      },
      {
        title: "Import & Analyze",
        description: "Paste a decklist from Moxfield or MTGO format. The app fetches card data from Scryfall, draws a mana curve and color spread chart, and lets you ask the AI about the deck.",
      },
      {
        title: "My Decks",
        description: "Save your commander + deck name for quick access across the app. Each saved deck tracks games played and wins. Select a deck anywhere you'd normally type a commander name.",
        tips: ["Win stats update automatically when you end a game with the deck linked.", "Add a partner commander for partner decks."],
      },
    ],
  },
  {
    tabId: "leaderboard",
    label: "Leaderboard",
    icon: Trophy,
    color: "#f59e0b",
    summary: "Track your win rate across all recorded sessions and compete on the global board.",
    features: [
      {
        title: "Personal stats",
        description: "See your total games, wins, and win rate. Stats accumulate whenever you end a game and choose End & Record.",
      },
      {
        title: "Global leaderboard",
        description: "Top 10 players ranked by win rate (minimum 3 games). Link a Google account in Settings or Leaderboard to appear with a persistent identity.",
      },
      {
        title: "Recent games",
        description: "Your last 10 sessions with player counts, starting life, duration, and final life totals.",
      },
    ],
  },
  {
    tabId: "rules",
    label: "Quick Rules",
    icon: BookOpen,
    color: "var(--accent-cyan)",
    summary: "Fast reference for common Commander rules — no internet required.",
    features: [
      {
        title: "Commander format rules",
        description: "Key rules for Commander: deck construction, commander damage, color identity, the command zone, and mulligan rules.",
      },
      {
        title: "Common mechanics",
        description: "Quick explanations of Monarch, Initiative, Myriad, Cascade, and other frequently-asked mechanics.",
      },
      {
        title: "Works offline",
        description: "Quick Rules is fully static — it loads from the app cache with no network request needed.",
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface AppGuideProps {
  onNavigate: (tab: TabId) => void;
}

export const AppGuide: React.FC<AppGuideProps> = ({ onNavigate }) => {
  // Track which sections are expanded (all open by default)
  const [collapsed, setCollapsed] = useState<Set<TabId>>(new Set());

  const toggle = (tabId: TabId) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId); else next.add(tabId);
      return next;
    });

  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "28px 28px 48px",
      display: "flex", flexDirection: "column", gap: "12px",
    }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: "8px" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "4px" }}>
          App Guide
        </h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          A breakdown of every tab and feature in Arbiter. Tap any section to expand it, or
          use the <strong>Go →</strong> button to jump straight there.
        </p>
      </div>

      {GUIDE_SECTIONS.map(section => {
        const Icon = section.icon;
        const isCollapsed = collapsed.has(section.tabId);

        return (
          <div
            key={section.tabId}
            className="glass-panel"
            style={{ padding: 0, overflow: "hidden" }}
          >
            {/* ── Section header ── */}
            <button
              onClick={() => toggle(section.tabId)}
              aria-expanded={!isCollapsed}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                width: "100%", padding: "14px 16px",
                background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
            >
              {/* Icon badge */}
              <div style={{
                width: "34px", height: "34px", borderRadius: "9px", flexShrink: 0,
                background: `${section.color}22`,
                border: `1px solid ${section.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={16} color={section.color} />
              </div>

              {/* Label + summary */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "1px" }}>
                  {section.label}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {section.summary}
                </p>
              </div>

              {/* Go → button */}
              <button
                onClick={e => { e.stopPropagation(); onNavigate(section.tabId); }}
                aria-label={`Go to ${section.label}`}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "5px 10px", borderRadius: "7px",
                  background: `${section.color}18`,
                  border: `1px solid ${section.color}44`,
                  color: section.color, fontSize: "0.72rem", fontWeight: 700,
                  cursor: "pointer", flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${section.color}30`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${section.color}18`; }}
              >
                Go <ExternalLink size={11} />
              </button>

              {/* Expand / collapse chevron */}
              <div style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
            </button>

            {/* ── Feature list ── */}
            {!isCollapsed && (
              <div style={{
                padding: "0 16px 14px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex", flexDirection: "column", gap: "10px",
              }}>
                {section.features.map((feat, i) => (
                  <div key={i} style={{ paddingTop: "10px" }}>
                    <p style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", marginBottom: "3px" }}>
                      {feat.title}
                    </p>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {feat.description}
                    </p>
                    {feat.tips && feat.tips.length > 0 && (
                      <ul style={{ margin: "5px 0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                        {feat.tips.map((tip, j) => (
                          <li key={j} style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
