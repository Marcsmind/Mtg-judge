import React, { useMemo } from "react";
import { Scale, Heart, Wand2, Sparkles, Crown, LogIn, ChevronRight, Clock } from "lucide-react";
import { STORAGE_KEYS } from "../constants/storageKeys";
import type { TabId } from "../constants/tabIds";
import type { AuthUser } from "../services/auth";
import type { SubscriptionTier } from "../types/subscription";
import type { SavedDeck } from "../types/deck";

interface HomeProps {
  authUser: AuthUser | null;
  tier: SubscriptionTier;
  onNavigate: (tab: TabId) => void;
  onSignIn: () => void;
}

interface Message { role: "user" | "model"; content: string; }
interface GameSlot { savedAt: number; playerCount: number; startingLife: number; }

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}

export const Home: React.FC<HomeProps> = ({ authUser, tier, onNavigate, onSignIn }) => {
  const isAnonymous = !authUser || authUser.isAnonymous;
  const isPro = tier === "pro" || tier === "lifetime";

  const lastQuestion = useMemo(() => {
    const chat = readJson<Message[]>(STORAGE_KEYS.AI_CHAT) ?? [];
    return chat.findLast(m => m.role === "user")?.content ?? null;
  }, []);

  const savedGames = useMemo(() => {
    const slots = readJson<(GameSlot | null)[]>(STORAGE_KEYS.SAVED_GAMES) ?? [];
    return slots.filter(Boolean) as GameSlot[];
  }, []);

  const savedDecks = useMemo(() => {
    return readJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS) ?? [];
  }, []);

  const quickActions: { id: TabId; label: string; sub: string; icon: React.ElementType; color: string; glow: string }[] = [
    { id: "judge",    label: "AI Judge",     sub: "Ask a rules question",    icon: Scale,    color: "var(--accent-purple)", glow: "rgba(139,92,246,0.15)" },
    { id: "life",     label: "Life Counter", sub: "Start a new game",        icon: Heart,    color: "var(--accent-rose)",   glow: "rgba(244,63,94,0.12)"  },
    { id: "deck",     label: "Deck Builder", sub: "Build or manage decks",   icon: Wand2,    color: "var(--accent-cyan)",   glow: "rgba(6,182,212,0.12)"  },
    { id: "gamenight",label: "Game Night",   sub: "Host a Commander pod",    icon: Sparkles, color: "var(--accent-gold)",   glow: "rgba(234,179,8,0.12)"  },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "20px", maxWidth: "640px", margin: "0 auto", width: "100%", paddingBottom: "80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingTop: "8px" }}>
        <div style={{
          width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
          background: "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 18px rgba(139,92,246,0.4)",
        }}>
          <Scale size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #fff 30%, var(--accent-purple) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Arbiter
          </h1>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Commander Companion
          </p>
        </div>
        {isPro && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "20px", padding: "4px 10px" }}>
            <Crown size={12} color="var(--accent-purple)" />
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--accent-purple)", letterSpacing: "0.06em" }}>PRO</span>
          </div>
        )}
      </div>

      {/* Account CTA — anonymous only */}
      {isAnonymous && (
        <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(6,182,212,0.06) 100%)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "16px", padding: "20px" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "6px" }}>Save your progress</h2>
          <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: "16px" }}>
            Create a free account to sync your decks, game history, and AI rulings across all your devices.
          </p>
          <button
            onClick={onSignIn}
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "linear-gradient(135deg, var(--accent-purple) 0%, rgba(139,92,246,0.8) 100%)",
              border: "none", borderRadius: "10px", padding: "10px 18px",
              color: "#fff", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <LogIn size={15} />
            Create Free Account
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>Quick Actions</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {quickActions.map(({ id, label, sub, icon: Icon, color, glow }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px",
                padding: "16px", background: "var(--bg-card)", border: "1px solid var(--border-color)",
                borderRadius: "14px", cursor: "pointer", textAlign: "left",
                transition: "all 0.15s ease", boxShadow: `0 0 0 0 ${glow}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = glow; e.currentTarget.style.borderColor = color; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-card)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}
            >
              <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: glow, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1px" }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {(lastQuestion || savedGames.length > 0 || savedDecks.length > 0) && (
        <div>
          <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>Recent Activity</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

            {lastQuestion && (
              <button
                onClick={() => onNavigate("judge")}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", cursor: "pointer", textAlign: "left", width: "100%" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(139,92,246,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
              >
                <Scale size={16} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "2px" }}>Last AI question</div>
                  <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastQuestion}</div>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            )}

            {savedDecks.length > 0 && (
              <button
                onClick={() => onNavigate("deck")}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", cursor: "pointer", textAlign: "left", width: "100%" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(6,182,212,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
              >
                <Wand2 size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "2px" }}>Decks</div>
                  <div style={{ fontSize: "0.84rem", color: "var(--text-primary)" }}>{savedDecks.length} deck{savedDecks.length !== 1 ? "s" : ""} saved{savedDecks[0] ? ` · ${savedDecks[0].name}` : ""}</div>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            )}

            {savedGames.length > 0 && (
              <button
                onClick={() => onNavigate("life")}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", cursor: "pointer", textAlign: "left", width: "100%" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(244,63,94,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
              >
                <Clock size={16} color="var(--accent-rose)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "2px" }}>Last game</div>
                  <div style={{ fontSize: "0.84rem", color: "var(--text-primary)" }}>
                    {savedGames[savedGames.length - 1].playerCount}P · {savedGames[savedGames.length - 1].startingLife} life · {new Date(savedGames[savedGames.length - 1].savedAt).toLocaleDateString()}
                  </div>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pro upgrade nudge — signed in free users only */}
      {!isAnonymous && !isPro && (
        <button
          onClick={() => onNavigate("settings")}
          style={{
            display: "flex", alignItems: "center", gap: "12px", padding: "16px 18px",
            background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: "14px", cursor: "pointer", textAlign: "left", width: "100%",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(139,92,246,0.2)"}
        >
          <Crown size={18} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>Upgrade to Pro</div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "1px" }}>Unlimited AI questions, multiplayer pods, cloud sync</div>
          </div>
          <ChevronRight size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        </button>
      )}

    </div>
  );
};
