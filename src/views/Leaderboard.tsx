/**
 * Leaderboard — shows your personal stats, recent games, and the global top-10.
 *
 * Requires Supabase to be configured + anonymous auth (initAuth in App.tsx).
 * Shows a friendly "not configured" state when Supabase is absent.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  Trophy, RefreshCw, Link2, User2, ChevronRight,
  Loader2, Crown, Skull, Clock, Users, Heart,
} from "lucide-react";
import type { AuthUser } from "../services/auth";
import {
  getMyStats, getRecentGames, getLeaderboard,
  type PlayerStats, type RecentGame, type LeaderboardEntry,
} from "../services/leaderboard";
import { isSupabaseConfigured } from "../services/supabase";

// ── Props ─────────────────────────────────────────────────────────────────────

interface LeaderboardProps {
  authUser: AuthUser | null;
  onLinkGoogle: () => void;
  onGoToSettings: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(secs: number): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "10px 16px", minWidth: "64px",
  }}>
    <span style={{ fontSize: "1.5rem", fontWeight: 900, color: color ?? "#fff", fontFamily: "'Outfit', sans-serif" }}>{value}</span>
    <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export const Leaderboard: React.FC<LeaderboardProps> = ({ authUser, onLinkGoogle, onGoToSettings }) => {
  const [myStats,       setMyStats]       = useState<PlayerStats | null>(null);
  const [recentGames,   setRecentGames]   = useState<RecentGame[]>([]);
  const [globalBoard,   setGlobalBoard]   = useState<LeaderboardEntry[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isSupabaseConfigured || !authUser?.id) return;
    setLoading(true);
    try {
      const [stats, recent, board] = await Promise.all([
        getMyStats(authUser.id),
        getRecentGames(authUser.id),
        getLeaderboard(),
      ]);
      setMyStats(stats);
      setRecentGames(recent);
      setGlobalBoard(board);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [authUser?.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Not configured ──
  if (!isSupabaseConfigured) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 48px)", gap: "16px", textAlign: "center", padding: "32px" }}>
        <Trophy size={48} color="var(--accent-gold)" style={{ opacity: 0.4 }} />
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Leaderboard</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "360px", lineHeight: 1.6 }}>
          The leaderboard requires Supabase. Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file to get started.
        </p>
        <button onClick={onGoToSettings} className="glass-button" style={{ marginTop: "8px" }}>
          <ChevronRight size={16} />
          <span>Go to Settings</span>
        </button>
      </div>
    );
  }

  // ── Not signed in ──
  if (!authUser) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 48px)", gap: "16px", textAlign: "center", padding: "32px" }}>
        <Loader2 size={32} color="var(--accent-purple)" style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-muted)" }}>Signing in…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px", margin: "0 auto", width: "100%", padding: "12px", height: "calc(100vh - 48px)", overflowY: "auto" }}>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Trophy size={28} color="var(--accent-gold)" />
          <div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Leaderboard</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              Commander game history &amp; rankings
              {lastRefreshed && <span style={{ marginLeft: "8px", color: "var(--text-muted)" }}>· refreshed {relativeTime(lastRefreshed.toISOString())}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="glass-button"
          aria-label="Refresh leaderboard"
          style={{ padding: "8px 12px", fontSize: "0.8rem" }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          <span>{loading ? "Loading…" : "Refresh"}</span>
        </button>
      </div>

      {/* ── Your Stats ── */}
      <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Account status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <User2 size={16} color="var(--accent-purple)" />
            <span style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              {myStats?.displayName ?? "Your Stats"}
            </span>
            {authUser.isAnonymous ? (
              <span style={{ fontSize: "0.65rem", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)", borderRadius: "20px", padding: "2px 8px", color: "var(--accent-gold)", fontWeight: 700 }}>
                Anonymous
              </span>
            ) : (
              <span style={{ fontSize: "0.65rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "20px", padding: "2px 8px", color: "var(--accent-emerald)", fontWeight: 700 }}>
                ✓ Linked
              </span>
            )}
          </div>

          {authUser.isAnonymous && (
            <button
              onClick={onLinkGoogle}
              className="glass-button"
              style={{ padding: "6px 12px", fontSize: "0.78rem", background: "rgba(66,133,244,0.1)", borderColor: "rgba(66,133,244,0.3)", color: "#4285F4" }}
            >
              <Link2 size={13} />
              <span>Link Google →</span>
            </button>
          )}
        </div>

        {authUser.isAnonymous && (
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.12)", borderRadius: "8px", padding: "8px 12px", lineHeight: 1.5 }}>
            📱 Anonymous stats are saved to this browser only. Link a Google account to access your history from any device.
          </p>
        )}

        {/* Stat pills */}
        {loading && !myStats ? (
          <div style={{ display: "flex", gap: "8px" }}>
            {["Games", "Wins", "Win Rate"].map(l => (
              <div key={l} style={{ flex: 1, height: "60px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", animation: "pulse-glow 1.5s infinite" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatPill label="Games"    value={myStats?.totalGames ?? 0} />
            <StatPill label="Wins"     value={myStats?.wins ?? 0}       color="var(--accent-emerald)" />
            <StatPill label="Win Rate" value={pct(myStats?.winRate ?? 0)} color={
              (myStats?.winRate ?? 0) >= 50 ? "var(--accent-emerald)" :
              (myStats?.winRate ?? 0) >= 30 ? "#f59e0b" : "var(--accent-rose)"
            } />
            {myStats?.totalGames === 0 && (
              <div style={{ display: "flex", alignItems: "center", marginLeft: "4px" }}>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No games recorded yet. Click <strong style={{ color: "var(--accent-purple)" }}>End &amp; Record</strong> in the Life Counter after your next game.
                </p>
              </div>
            )}
          </div>
        )}

        {myStats?.lastPlayedAt && (
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Last played: {relativeTime(myStats.lastPlayedAt)}
          </p>
        )}
      </div>

      {/* ── Recent Games ── */}
      {(recentGames.length > 0 || loading) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Recent Games
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {recentGames.map(game => (
              <div
                key={game.id}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  padding: "10px 14px", borderRadius: "10px",
                  background: game.isWinner ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${game.isWinner ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.04)"}`,
                }}
              >
                {/* Outcome icon */}
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: game.isWinner ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)" }}>
                  {game.isWinner
                    ? <Crown size={14} color="var(--accent-emerald)" />
                    : <Skull size={14} color="var(--accent-rose)" />
                  }
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 700, color: game.isWinner ? "var(--accent-emerald)" : "var(--text-primary)" }}>
                      {game.isWinner ? "Victory" : "Defeat"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Users size={11} color="var(--text-muted)" />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{game.playerCount}P</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Heart size={11} color="var(--text-muted)" />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Start {game.startingLife}</span>
                    </div>
                    {game.durationSecs > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={11} color="var(--text-muted)" />
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{formatDuration(game.durationSecs)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Final life + time */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: 800, color: game.finalLife > 0 ? "#fff" : "var(--accent-rose)" }}>
                    {game.finalLife}♥
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                    {relativeTime(game.completedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Global Leaderboard ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Global Leaderboard <span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.7rem" }}>(min 3 games)</span>
        </h3>

        {loading && globalBoard.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: "48px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", animation: "pulse-glow 1.5s infinite" }} />
            ))}
          </div>
        ) : globalBoard.length === 0 ? (
          <div className="glass-panel" style={{ padding: "24px", textAlign: "center" }}>
            <Trophy size={32} style={{ opacity: 0.2, marginBottom: "10px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
              No one has 3+ recorded games yet. Play some games and click <strong style={{ color: "var(--accent-purple)" }}>End &amp; Record</strong> to appear here!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {globalBoard.map((entry, rank) => {
              const isMine = entry.userId === authUser.id;
              const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`;
              return (
                <div
                  key={entry.userId}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 14px", borderRadius: "10px",
                    background: isMine ? "rgba(139,92,246,0.08)" : rank === 0 ? "rgba(234,179,8,0.05)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isMine ? "rgba(139,92,246,0.3)" : rank === 0 ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.04)"}`,
                  }}
                >
                  <span style={{ fontSize: rank < 3 ? "1.1rem" : "0.78rem", width: "28px", textAlign: "center", flexShrink: 0, fontWeight: 700, color: "var(--text-muted)" }}>
                    {medal}
                  </span>

                  <span style={{ fontSize: "0.9rem", fontWeight: 700, flex: 1, color: isMine ? "var(--accent-purple)" : "#fff" }}>
                    {entry.avatarEmoji && <span style={{ marginRight: "6px" }}>{entry.avatarEmoji}</span>}
                    {entry.displayName}
                    {isMine && <span style={{ fontSize: "0.65rem", color: "var(--accent-purple)", marginLeft: "6px", fontWeight: 600 }}>you</span>}
                  </span>

                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{entry.wins}W / {entry.totalGames}G</span>
                    </div>
                    <div style={{
                      background: entry.winRate >= 50 ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${entry.winRate >= 50 ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: "6px", padding: "3px 9px", minWidth: "48px", textAlign: "center",
                    }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 800, color: entry.winRate >= 50 ? "var(--accent-emerald)" : "var(--text-primary)" }}>
                        {pct(entry.winRate)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* bottom padding */}
      <div style={{ height: "24px" }} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
