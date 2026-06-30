import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, ChevronRight, Edit2, Check, LogOut, LogIn,
  Trophy, Clock, Heart, Wand2, Search, Image as ImageIcon,
} from "lucide-react";
import type { AuthUser } from "../services/auth";
import { getMyStats, getRecentGames, type PlayerStats, type RecentGame } from "../services/leaderboard";
import { isSupabaseConfigured } from "../services/supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";
import type { SavedDeck } from "../types/deck";
import { searchCardsWithImages } from "../services/scryfall";
import type { ScryfallCard } from "../services/scryfall";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameSlot { savedAt: number; playerCount: number; startingLife: number; }

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}

function formatDuration(secs: number): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

interface AvatarProps {
  src: string | null;
  initials: string;
  size?: number;
  style?: React.CSSProperties;
}

const Avatar: React.FC<AvatarProps> = ({ src, initials, size = 72, style }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: src ? "transparent" : "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-cyan) 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", border: "2px solid color-mix(in srgb, var(--accent-purple) 50%, transparent)",
    boxShadow: "0 0 20px color-mix(in srgb, var(--accent-purple) 30%, transparent)",
    ...style,
  }}>
    {src
      ? <img src={src} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <span style={{ fontSize: size * 0.36, fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>{initials}</span>
    }
  </div>
);

// ── Card art picker ────────────────────────────────────────────────────────────

interface ArtPickerProps {
  onSelect: (artCropUrl: string) => void;
  onClose: () => void;
}

const ArtPicker: React.FC<ArtPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    const cards = await searchCardsWithImages(q, abortRef.current.signal);
    setResults(cards);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 210,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column", padding: "16px",
      paddingTop: "max(48px, env(safe-area-inset-top))",
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>Choose Card Art</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: "4px" }}>
          <X size={20} />
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "16px" }}>
        <Search size={14} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
        <input
          className="glass-input"
          placeholder="Search for a card…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: "100%", paddingLeft: "34px", boxSizing: "border-box" }}
          autoFocus
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
        {loading && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", paddingTop: "40px", fontSize: "0.88rem" }}>
            Searching…
          </div>
        )}
        {!loading && results.length === 0 && query.length >= 2 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", paddingTop: "40px", fontSize: "0.88rem" }}>
            No cards found
          </div>
        )}
        {results.map(card => {
          const artUrl = card.image_uris?.art_crop
            ?? card.card_faces?.[0]?.image_uris?.art_crop;
          if (!artUrl) return null;
          return (
            <button
              key={card.id}
              onClick={() => onSelect(artUrl)}
              style={{
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px",
                overflow: "hidden", cursor: "pointer", background: "transparent",
                padding: 0, display: "flex", flexDirection: "column",
              }}
            >
              <img src={artUrl} alt={card.name} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />
              <div style={{ padding: "6px 8px", fontSize: "0.72rem", color: "var(--text-secondary)", textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                {card.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Stat pill ─────────────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px", padding: "12px 10px", flex: 1,
  }}>
    <span style={{ fontSize: "1.5rem", fontWeight: 900, color: color ?? "#fff" }}>{value}</span>
    <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center" }}>{label}</span>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

interface ProfileModalProps {
  isOpen: boolean;
  authUser: AuthUser | null;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

type TabId = "stats" | "decks" | "games";

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, authUser, onClose, onSignIn, onSignOut }) => {
  const isAnonymous = !authUser || authUser.isAnonymous;

  const [tab, setTab] = useState<TabId>("stats");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.PROFILE_AVATAR));
  const [displayName, setDisplayName] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEYS.PROFILE_NAME) ??
    localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) ??
    ""
  );
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [showArtPicker, setShowArtPicker] = useState(false);

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const savedDecks = readJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS) ?? [];
  const localGames = (readJson<(GameSlot | null)[]>(STORAGE_KEYS.SAVED_GAMES) ?? []).filter(Boolean) as GameSlot[];

  // Derive initials from display name or email
  const initials = (() => {
    if (displayName) return displayName.slice(0, 2).toUpperCase();
    if (authUser?.email) return authUser.email.slice(0, 2).toUpperCase();
    return "?";
  })();

  useEffect(() => {
    if (!isOpen || isAnonymous || !authUser?.id || !isSupabaseConfigured) return;
    getMyStats(authUser.id).then(s => { if (s) setStats(s); });
    getRecentGames(authUser.id).then(g => setRecentGames(g));
  }, [isOpen, isAnonymous, authUser?.id]);

  const saveName = () => {
    const trimmed = nameInput.trim();
    setDisplayName(trimmed);
    localStorage.setItem(STORAGE_KEYS.PROFILE_NAME, trimmed);
    setEditingName(false);
  };

  const handleAvatarSelect = (artUrl: string) => {
    setAvatarUrl(artUrl);
    localStorage.setItem(STORAGE_KEYS.PROFILE_AVATAR, artUrl);
    setShowArtPicker(false);
  };

  const handleSignOut = () => {
    onSignOut();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "var(--bg-deep)",
          display: "flex", flexDirection: "column",
          paddingTop: "max(20px, env(safe-area-inset-top))",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.32s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 16px" }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>Profile</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "8px", padding: "7px", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>

          {/* Avatar + identity */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: "20px" }}>
            {/* Avatar with edit tap */}
            <div style={{ position: "relative" }}>
              <Avatar src={avatarUrl} initials={initials} size={88} />
              <button
                onClick={() => setShowArtPicker(true)}
                style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: "26px", height: "26px", borderRadius: "50%",
                  background: "var(--accent-purple)", border: "2px solid var(--bg-deep)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <ImageIcon size={12} color="#fff" />
              </button>
            </div>

            {/* Display name */}
            {editingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  className="glass-input"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  autoFocus
                  style={{ fontSize: "1rem", fontWeight: 700, textAlign: "center", maxWidth: "200px" }}
                />
                <button onClick={saveName} style={{ background: "var(--accent-purple)", border: "none", borderRadius: "8px", padding: "8px", cursor: "pointer", display: "flex" }}>
                  <Check size={14} color="#fff" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(displayName); setEditingName(true); }}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer" }}
              >
                <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fff" }}>
                  {displayName || "Set a name"}
                </span>
                <Edit2 size={14} color="var(--text-muted)" />
              </button>
            )}

            {/* Email / anonymous state */}
            {isAnonymous ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Not signed in — your data is local only</span>
                <button
                  onClick={() => { onClose(); onSignIn(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "linear-gradient(135deg, var(--accent-purple) 0%, color-mix(in srgb, var(--accent-purple) 80%, transparent) 100%)",
                    border: "none", borderRadius: "10px", padding: "10px 18px",
                    color: "#fff", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  <LogIn size={15} />
                  Sign In / Create Account
                </button>
              </div>
            ) : (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{authUser?.email}</span>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "20px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "4px" }}>
            {(["stats", "decks", "games"] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: "9px", border: "none",
                  background: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
                  color: tab === t ? "#fff" : "var(--text-muted)",
                  fontSize: "0.82rem", fontWeight: tab === t ? 700 : 500,
                  cursor: "pointer", transition: "all 0.15s ease",
                  textTransform: "capitalize",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Stats tab */}
          {tab === "stats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {stats ? (
                <>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <StatPill label="Games" value={stats.totalGames} />
                    <StatPill label="Wins" value={stats.wins} color="var(--accent-emerald)" />
                    <StatPill label="Win %" value={`${Math.round(stats.winRate)}%`} color="var(--accent-gold)" />
                    <StatPill label="Losses" value={stats.totalGames - stats.wins} color="var(--accent-rose)" />
                  </div>
                  {stats.lastPlayedAt && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
                      <Clock size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Last played {relativeTime(stats.lastPlayedAt)}</span>
                    </div>
                  )}
                </>
              ) : (
                // Local games fallback
                localGames.length > 0 ? (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <StatPill label="Saved" value={localGames.length} />
                    <StatPill label="Players" value={localGames[localGames.length - 1].playerCount + "P"} />
                    <StatPill label="Life" value={localGames[localGames.length - 1].startingLife} color="var(--accent-rose)" />
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    <Trophy size={32} color="var(--text-muted)" style={{ marginBottom: "10px", opacity: 0.5 }} />
                    <div>No stats yet — finish a game to see your record</div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Decks tab */}
          {tab === "decks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {savedDecks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  <Wand2 size={32} color="var(--text-muted)" style={{ marginBottom: "10px", opacity: 0.5 }} />
                  <div>No decks saved yet — build one in Deck Builder</div>
                </div>
              ) : savedDecks.map((deck, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" }}
                >
                  <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "rgba(6,182,212,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Wand2 size={16} color="var(--accent-cyan)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.name || "Untitled Deck"}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1px" }}>
                      {Array.isArray(deck.cards) ? `${deck.cards.length} cards` : ""}
                      {deck.commanderName ? ` · ${deck.commanderName}` : ""}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          )}

          {/* Games tab */}
          {tab === "games" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recentGames.length === 0 && localGames.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                  <Heart size={32} color="var(--text-muted)" style={{ marginBottom: "10px", opacity: 0.5 }} />
                  <div>No games recorded yet — complete a game to see history</div>
                </div>
              ) : recentGames.length > 0 ? (
                recentGames.map(g => (
                  <div
                    key={g.id}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" }}
                  >
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "9px", flexShrink: 0,
                      background: g.isWinner ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Trophy size={16} color={g.isWinner ? "var(--accent-emerald)" : "var(--accent-rose)"} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: g.isWinner ? "var(--accent-emerald)" : "var(--accent-rose)" }}>
                        {g.isWinner ? "Win" : "Loss"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {g.playerCount}P · {g.startingLife} life · {formatDuration(g.durationSecs)} · {relativeTime(g.completedAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                localGames.slice().reverse().map((g, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px" }}
                  >
                    <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "rgba(244,63,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Heart size={16} color="var(--accent-rose)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#fff" }}>Saved Game</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {g.playerCount}P · {g.startingLife} life · {new Date(g.savedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Extra spacing at bottom */}
          <div style={{ height: "24px" }} />
        </div>

        {/* Sign out / in footer */}
        <div style={{ padding: "12px 20px 0" }}>
          {isAnonymous ? null : (
            <button
              onClick={handleSignOut}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                width: "100%", padding: "13px",
                background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)",
                borderRadius: "12px", color: "var(--accent-rose)",
                fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          )}
        </div>
      </div>

      {showArtPicker && (
        <ArtPicker onSelect={handleAvatarSelect} onClose={() => setShowArtPicker(false)} />
      )}
    </>
  );
};
