/**
 * PlayerCard — renders a single player tile in the Life Counter grid.
 *
 * Extracted from LifeCounter.tsx so that file stays manageable.
 * All state lives in LifeCounter; PlayerCard is purely presentational and
 * communicates back via callback props.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Minus, ShieldAlert, Crown, Skull, Radiation,
  Swords, Star, Coins, Shield, Wand2,
} from "lucide-react";
import type { Player, ActiveCounters, TokenKey } from "../../types/game";
import type { SavedDeck } from "../../types/deck";
import { SetCommanderModal } from "./SetCommanderModal";
import { CommanderPreviewModal } from "./CommanderPreviewModal";

// ── MTG-themed emoji avatar presets ──────────────────────────────────────────
const AVATAR_PRESETS = ["🐉", "🧙", "🏰", "⚔️", "💀", "🌿", "🔥", "💧"];

// ── Color theme shape (matches LifeCounter's `colors` map) ───────────────────
interface ColorTheme { bg: string; accent: string; border: string; }

const TOKEN_TYPES: { key: TokenKey; label: string; emoji: string; color: string }[] = [
  { key: "treasure", label: "Treasure", emoji: "🪙", color: "#eab308" },
  { key: "food",     label: "Food",     emoji: "🍎", color: "#10b981" },
  { key: "clue",     label: "Clue",     emoji: "🔍", color: "#06b6d4" },
  { key: "blood",    label: "Blood",    emoji: "🩸", color: "#f43f5e" },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface PlayerCardProps {
  p: Player;
  players: Player[];             // All players — needed for commander-damage source names
  playerTheme: ColorTheme;
  activeCounters: ActiveCounters;
  colors: Record<string, ColorTheme>;

  // Callbacks
  adjustLife:           (id: number, delta: number) => void;
  adjustPoison:         (id: number, delta: number) => void;
  adjustRad:            (id: number, delta: number) => void;
  adjustToken:          (id: number, key: TokenKey, delta: number) => void;
  adjustTax:            (id: number, isPartner: boolean, delta: number) => void;
  togglePartner:        (id: number) => void;
  renamePlayer:         (id: number, name: string) => void;
  cycleColor:           (id: number) => void;
  setAvatar:            (id: number, emoji: string) => void;
  assignMonarch:        (id: number) => void;
  releaseMonarch:       () => void;
  assignInitiative:     (id: number) => void;
  releaseInitiative:    () => void;
  toggleCityBlessing:   (id: number) => void;
  togglePlayerTokenType:(id: number, key: TokenKey) => void;
  togglePlayerTokensPanel:(id: number) => void;
  setActiveDamageEditor:(id: number) => void;
  revivePlayer:         (id: number) => void;
  isFirst?:             boolean;   // "Goes First" star — auto-dismisses after 10 s
  commanderName?:       string;   // commander name — wand button always visible
  onSetCommander?:      (id: number, name: string, deckId?: string) => void;
  onClearCommander?:    (id: number) => void;
  savedDecks?:          SavedDeck[];
  isActiveTurn?:        boolean;  // turn tracker — highlights the active player
  isLocalPlayer?:       boolean;  // true = this seat belongs to the device; default true (open edit)
  claimSeat?:           () => void; // tap "Me" to claim / unclaim this seat
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  p,
  players,
  playerTheme,
  activeCounters,
  colors,
  adjustLife,
  adjustPoison,
  adjustRad,
  adjustToken,
  adjustTax,
  togglePartner,
  renamePlayer,
  cycleColor,
  setAvatar,
  assignMonarch,
  releaseMonarch,
  assignInitiative,
  releaseInitiative,
  toggleCityBlessing,
  togglePlayerTokenType,
  togglePlayerTokensPanel,
  setActiveDamageEditor,
  revivePlayer,
  isFirst = false,
  commanderName,
  onSetCommander,
  onClearCommander,
  savedDecks = [],
  isActiveTurn = false,
  isLocalPlayer = true,
  claimSeat,
}) => {
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  // ── "Goes First" badge — shows briefly then auto-dismisses ───────────────
  const [showFirstBadge, setShowFirstBadge] = useState(isFirst);
  const firstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirst) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowFirstBadge(true);
      if (firstTimerRef.current) clearTimeout(firstTimerRef.current);
      firstTimerRef.current = setTimeout(() => setShowFirstBadge(false), 10_000);
    } else {
      setShowFirstBadge(false);
    }
    return () => { if (firstTimerRef.current) clearTimeout(firstTimerRef.current); };
  }, [isFirst]);

  // ── Long-press life adjustment ────────────────────────────────────────────
  const holdTimerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHold = useCallback((delta: number) => {
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        adjustLife(p.id, delta);
      }, 120);
    }, 400);
  }, [adjustLife, p.id]);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current)   { clearTimeout(holdTimerRef.current);   holdTimerRef.current   = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);

  // ── Commander modals ──────────────────────────────────────────────────────
  const [setCmdOpen, setSetCmdOpen]       = useState(false);
  const [previewOpen, setPreviewOpen]     = useState(false);

  // ── Defeat conditions ─────────────────────────────────────────────────────
  const isDeadGeneral = p.life <= 0;
  const isPoisonDead  = (p.poison ?? 0) >= 10;

  const getCmdDeathReason = (): string | null => {
    for (const [key, dmg] of Object.entries(p.commanderDamage)) {
      if (dmg >= 21) {
        const srcId = parseInt(key.split("_")[0]);
        const isPartner = key.includes("_B");
        const src = players.find(s => s.id === srcId);
        return `${src?.name ?? `P${srcId}`}'s ${isPartner ? "Partner" : "Commander"} (${dmg}/21)`;
      }
    }
    return null;
  };

  const cmdDeath   = getCmdDeathReason();
  const isDefeated = isDeadGeneral || !!cmdDeath || isPoisonDead;

  return (
    <div
      style={{
        background: playerTheme.bg, borderRadius: "14px",
        border: `1.5px solid ${p.isMonarch ? "#eab308" : isDefeated ? "rgba(239,68,68,0.6)" : isActiveTurn ? "var(--accent-purple)" : playerTheme.border}`,
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px",
        boxShadow: p.isMonarch
          ? "0 0 24px rgba(234,179,8,0.18), 0 4px 20px rgba(0,0,0,0.3)"
          : isDefeated
            ? "0 0 20px rgba(239,68,68,0.2) inset, 0 4px 20px rgba(0,0,0,0.3)"
            : isActiveTurn
              ? "0 0 0 2px var(--accent-purple-glow), 0 0 18px rgba(139,92,246,0.25), 0 4px 20px rgba(0,0,0,0.3)"
              : "0 4px 20px rgba(0,0,0,0.3)",
        position: "relative", overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* ── "Goes First" Star Badge — auto-dismisses after 10 s ── */}
      {showFirstBadge && (
        <div
          aria-label="This player goes first"
          style={{
            position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
            background: "rgba(234,179,8,0.18)", border: "1px solid rgba(234,179,8,0.45)",
            borderRadius: "20px", padding: "3px 10px",
            display: "flex", alignItems: "center", gap: "5px",
            fontSize: "0.68rem", fontWeight: 700, color: "#eab308",
            zIndex: 20, whiteSpace: "nowrap",
            boxShadow: "0 0 14px rgba(234,179,8,0.35)",
            animation: "pulse-glow 2s infinite",
            pointerEvents: "none",
          }}
        >
          <Star size={10} fill="#eab308" color="#eab308" /> Goes First
        </div>
      )}

      {/* ── Monarch Badge ── */}
      {activeCounters.monarch && (
        <button
          onClick={() => p.isMonarch ? releaseMonarch() : assignMonarch(p.id)}
          aria-label={p.isMonarch ? "Release Monarch crown" : `Crown ${p.name} as Monarch`}
          title={p.isMonarch ? "Click to release the crown" : "Click to crown this player"}
          style={{
            position: "absolute", top: "40px", right: activeCounters.initiative ? "52px" : "10px",
            zIndex: 10, width: "36px", height: "36px", borderRadius: "50%",
            background: p.isMonarch ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.05)",
            border: `1.5px solid ${p.isMonarch ? "#eab308" : "rgba(255,255,255,0.1)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: p.isMonarch ? "0 0 14px rgba(234,179,8,0.55)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          <Crown size={18} color={p.isMonarch ? "#eab308" : "rgba(255,255,255,0.2)"} />
        </button>
      )}

      {/* ── Initiative Badge ── */}
      {activeCounters.initiative && (
        <button
          onClick={() => p.hasInitiative ? releaseInitiative() : assignInitiative(p.id)}
          aria-label={p.hasInitiative ? "Release the Initiative" : `Assign the Initiative to ${p.name}`}
          title={p.hasInitiative ? "Click to release the Initiative" : "Click to assign the Initiative"}
          style={{
            position: "absolute", top: "40px", right: "10px",
            zIndex: 10, width: "36px", height: "36px", borderRadius: "50%",
            background: p.hasInitiative ? "rgba(6,182,212,0.25)" : "rgba(255,255,255,0.05)",
            border: `1.5px solid ${p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.1)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: p.hasInitiative ? "0 0 14px rgba(6,182,212,0.55)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          <Swords size={17} color={p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.2)"} />
        </button>
      )}

      {/* ── Defeated Overlay ── */}
      {isDefeated && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(8,7,11,0.88)", backdropFilter: "blur(5px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "10px", zIndex: 5, padding: "20px", textAlign: "center",
        }}>
          <ShieldAlert size={34} color="var(--accent-rose)" />
          <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "0.5px" }}>DEFEATED</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "80%" }}>
            {isPoisonDead ? "10 Poison Counters" : cmdDeath ? `Cmd Dmg from ${cmdDeath}` : `Life → ${p.life}`}
          </span>
          <button
            onClick={() => revivePlayer(p.id)}
            className="glass-button"
            style={{ padding: "5px 14px", fontSize: "0.72rem", marginTop: "4px" }}
          >
            Revive
          </button>
        </div>
      )}

      {/* ── Header Row: Avatar + Name + Color Dot ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: (activeCounters.monarch || activeCounters.initiative) ? "44px" : "0", gap: "6px" }}>
        {/* Avatar button / picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setAvatarPickerOpen(o => !o)}
            aria-label={`Avatar for ${p.name}`}
            title="Choose avatar emoji"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: p.avatar ? "1.3rem" : "0.85rem",
              lineHeight: 1, padding: "2px",
              color: p.avatar ? "inherit" : "var(--text-muted)",
              opacity: p.avatar ? 1 : 0.45,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "1"}
            onMouseLeave={e => e.currentTarget.style.opacity = p.avatar ? "1" : "0.45"}
          >
            {p.avatar || "🎭"}
          </button>
          {/* Avatar picker dropdown */}
          {avatarPickerOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0,
              background: "var(--bg-dark)", border: "1px solid var(--border-color)",
              borderRadius: "10px", padding: "6px 8px",
              display: "flex", flexWrap: "wrap", gap: "4px",
              zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              maxWidth: "160px",
            }}>
              {AVATAR_PRESETS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { setAvatar(p.id, p.avatar === emoji ? "" : emoji); setAvatarPickerOpen(false); }}
                  style={{
                    background: p.avatar === emoji ? "rgba(139,92,246,0.2)" : "transparent",
                    border: `1px solid ${p.avatar === emoji ? "rgba(139,92,246,0.5)" : "transparent"}`,
                    borderRadius: "6px", padding: "4px 6px", cursor: "pointer", fontSize: "1.2rem",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = p.avatar === emoji ? "rgba(139,92,246,0.2)" : "transparent"}
                >
                  {emoji}
                </button>
              ))}
              {p.avatar && (
                <button
                  onClick={() => { setAvatar(p.id, ""); setAvatarPickerOpen(false); }}
                  style={{
                    background: "transparent", border: "1px solid transparent",
                    borderRadius: "6px", padding: "4px 6px", cursor: "pointer",
                    fontSize: "0.6rem", color: "var(--text-muted)", fontWeight: 600,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <input
          type="text"
          value={p.name}
          onChange={e => renamePlayer(p.id, e.target.value)}
          aria-label={`Player name: ${p.name}`}
          style={{
            background: "none", border: "none", color: "#fff",
            fontSize: "0.95rem", fontWeight: 700, fontFamily: "'Outfit', sans-serif",
            flex: 1, outline: "none", borderBottom: "1px dashed transparent",
            transition: "border-color 0.15s ease",
          }}
          onFocus={e => e.target.style.borderBottomColor = playerTheme.accent}
          onBlur={e => e.target.style.borderBottomColor = "transparent"}
        />
        {/* "Me" pill — tap to claim / unclaim this seat */}
        {claimSeat && (
          <button
            onClick={claimSeat}
            aria-label={isLocalPlayer ? "This is your seat (tap to unclaim)" : "Claim this seat as yours"}
            title={isLocalPlayer ? "Your seat — tap to unclaim" : "Claim this seat"}
            className="touch-icon-btn"
            style={{
              background: isLocalPlayer ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isLocalPlayer ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: "12px", padding: "2px 7px", cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", gap: "3px",
              fontSize: "0.6rem", fontWeight: 700,
              color: isLocalPlayer ? "var(--accent-purple)" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            👤 {isLocalPlayer ? "Me" : "Me?"}
          </button>
        )}
        <button
          onClick={() => cycleColor(p.id)}
          aria-label={`Cycle color for ${p.name}`}
          className="touch-icon-btn"
          style={{
            width: "18px", height: "18px", borderRadius: "50%", background: playerTheme.accent,
            border: "2px solid #fff", cursor: "pointer", flexShrink: 0,
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
          title="Cycle Color"
        />
      </div>

      {/* ── Commander Strip — dedicated row below header, clear of monarch/initiative badge ── */}
      {(commanderName || isLocalPlayer) && (
        <div style={{
          paddingRight: (activeCounters.monarch || activeCounters.initiative) ? "44px" : "0",
          paddingTop: "2px",
          paddingBottom: "2px",
          minHeight: "22px",
        }}>
          {commanderName ? (
            <button
              onClick={() => setPreviewOpen(true)}
              aria-label={`View ${p.name}'s commander: ${commanderName}`}
              title={`Commander: ${commanderName}`}
              className="touch-icon-btn"
              style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                background: "rgba(139,92,246,0.10)",
                border: "1px solid rgba(139,92,246,0.28)",
                borderRadius: "6px", padding: "2px 8px 2px 5px",
                cursor: "pointer", maxWidth: "100%",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,0.10)"; }}
            >
              <Wand2 size={11} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: "0.7rem", fontWeight: 600,
                color: "var(--accent-purple)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "120px",
              }}>
                {commanderName}
              </span>
            </button>
          ) : isLocalPlayer ? (
            <button
              onClick={() => onSetCommander && setSetCmdOpen(true)}
              aria-label={`Set commander for ${p.name}`}
              title="Set commander"
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "0.68rem", padding: "2px 0",
                opacity: 0.6, transition: "opacity 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "1"}
              onMouseLeave={e => e.currentTarget.style.opacity = "0.6"}
            >
              <Wand2 size={10} />
              <span>+ Set commander</span>
            </button>
          ) : null}
        </div>
      )}

      {/* ── Commander Preview Modal (read-only by default; edit button when isLocalPlayer) ── */}
      {previewOpen && commanderName && (
        <CommanderPreviewModal
          commanderName={commanderName}
          playerName={p.name}
          canEdit={isLocalPlayer}
          onEdit={() => { setPreviewOpen(false); setSetCmdOpen(true); }}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* ── Set Commander Modal ── */}
      {setCmdOpen && onSetCommander && (
        <SetCommanderModal
          playerId={p.id}
          playerName={p.name}
          currentCommanderName={commanderName}
          savedDecks={savedDecks}
          onConfirm={(name, deckId) => { onSetCommander(p.id, name, deckId); setSetCmdOpen(false); }}
          onClear={() => { onClearCommander?.(p.id); setSetCmdOpen(false); }}
          onClose={() => setSetCmdOpen(false)}
        />
      )}

      {/* City's Blessing label */}
      {activeCounters.cityBlessing && p.cityBlessing && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "-2px" }}>
          <Star size={10} color="#eab308" fill="#eab308" />
          <span style={{ fontSize: "0.65rem", color: "#eab308", fontWeight: 600 }}>City's Blessing</span>
        </div>
      )}

      {/* ── LIFE TOTAL — split left/right zones ── */}
      <div
        className="lc-life-section"
        style={{ display: "flex", flex: 1, alignItems: "stretch", minHeight: "80px", position: "relative" }}
      >
        {/* Left zone: subtract life */}
        <div
          role="button"
          aria-label={`Subtract 1 life from ${p.name} (hold to keep subtracting)`}
          onPointerDown={e => { if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, -1); startHold(-1); } }}
          onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerLeave={e => { e.currentTarget.style.background = "rgba(244,63,94,0.04)"; stopHold(); }}
          onPointerEnter={e => { e.currentTarget.style.background = "rgba(244,63,94,0.10)"; }}
          onContextMenu={e => e.preventDefault()}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "6px",
            cursor: "pointer", userSelect: "none", touchAction: "none",
            borderRadius: "8px 0 0 8px",
            background: "rgba(244,63,94,0.04)",
            transition: "background 0.12s ease",
          }}
        >
          <Minus size={18} color="var(--accent-rose)" style={{ opacity: 0.7, pointerEvents: "none" }} />
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); adjustLife(p.id, -5); }}
            aria-label={`Subtract 5 life from ${p.name}`}
            style={{
              fontSize: "0.62rem", padding: "2px 6px",
              background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.25)",
              borderRadius: "4px", color: "var(--accent-rose)",
              cursor: "pointer", fontWeight: 700,
            }}
          >−5</button>
        </div>

        {/* Center: life number */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minWidth: "80px", pointerEvents: "none",
        }}>
          <span
            className="lc-life-number"
            style={{
              fontSize: "clamp(3.8rem, 5.5vw, 7rem)",
              fontWeight: 900, fontFamily: "'Outfit', sans-serif",
              textAlign: "center",
              textShadow: `0 0 40px ${playerTheme.accent}50, 0 4px 16px rgba(0,0,0,0.6)`,
              lineHeight: 1, letterSpacing: "-3px",
              filter: p.life < 10 ? "drop-shadow(0 0 8px rgba(239,68,68,0.7))" : "none",
              color: p.life <= 0 ? "#ef4444" : p.life < 10 ? "#fca5a5" : "#fff",
            }}
          >
            {p.life}
          </span>
        </div>

        {/* Right zone: add life */}
        <div
          role="button"
          aria-label={`Add 1 life to ${p.name} (hold to keep adding)`}
          onPointerDown={e => { if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, 1); startHold(1); } }}
          onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerLeave={e => { e.currentTarget.style.background = "rgba(52,211,153,0.04)"; stopHold(); }}
          onPointerEnter={e => { e.currentTarget.style.background = "rgba(52,211,153,0.12)"; }}
          onContextMenu={e => e.preventDefault()}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "6px",
            cursor: "pointer", userSelect: "none", touchAction: "none",
            borderRadius: "0 8px 8px 0",
            background: "rgba(52,211,153,0.04)",
            transition: "background 0.12s ease",
          }}
        >
          <Plus size={18} color="var(--accent-emerald)" style={{ opacity: 0.7, pointerEvents: "none" }} />
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); adjustLife(p.id, 5); }}
            aria-label={`Add 5 life to ${p.name}`}
            style={{
              fontSize: "0.62rem", padding: "2px 6px",
              background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.25)",
              borderRadius: "4px", color: "var(--accent-emerald)",
              cursor: "pointer", fontWeight: 700,
            }}
          >+5</button>
        </div>
      </div>

      {/* ── Poison + Rad Counters ── */}
      {(activeCounters.poison || activeCounters.rad) && (
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          {activeCounters.poison && (
            <div style={{
              display: "flex", alignItems: "center",
              background: (p.poison ?? 0) >= 10 ? "rgba(239,68,68,0.2)" : "rgba(0,0,0,0.38)",
              border: `1.5px solid ${(p.poison ?? 0) >= 10 ? "rgba(239,68,68,0.6)" : "rgba(16,185,129,0.4)"}`,
              borderRadius: "12px", padding: "5px 4px",
              boxShadow: (p.poison ?? 0) >= 10 ? "0 0 12px rgba(239,68,68,0.3)" : "none",
            }}>
              <button onClick={() => adjustPoison(p.id, -1)} aria-label={`Remove 1 poison from ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>−</button>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: "58px", justifyContent: "center" }}>
                <Skull size={18} color={(p.poison ?? 0) >= 10 ? "#ef4444" : "#10b981"} />
                <span style={{ fontSize: "1.5rem", fontWeight: 900, color: (p.poison ?? 0) >= 10 ? "#ef4444" : "#fff", minWidth: "26px", textAlign: "center", lineHeight: 1 }}>
                  {p.poison ?? 0}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", lineHeight: 1 }}>/10</span>
              </div>
              <button onClick={() => adjustPoison(p.id, 1)} aria-label={`Add 1 poison to ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>+</button>
            </div>
          )}

          {activeCounters.rad && (
            <div style={{
              display: "flex", alignItems: "center",
              background: "rgba(0,0,0,0.38)",
              border: "1.5px solid rgba(249,115,22,0.4)",
              borderRadius: "12px", padding: "5px 4px",
            }}>
              <button onClick={() => adjustRad(p.id, -1)} aria-label={`Remove 1 rad from ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>−</button>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: "48px", justifyContent: "center" }}>
                <Radiation size={18} color="#f97316" />
                <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fff", minWidth: "26px", textAlign: "center", lineHeight: 1 }}>
                  {p.rad ?? 0}
                </span>
              </div>
              <button onClick={() => adjustRad(p.id, 1)} aria-label={`Add 1 rad to ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>+</button>
            </div>
          )}
        </div>
      )}

      {/* ── Enabled Token Counters ── */}
      {p.enabledTokens.length > 0 && (
        <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
          {TOKEN_TYPES.filter(t => p.enabledTokens.includes(t.key)).map(({ key, emoji, color }) => (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: "1px",
              background: "rgba(0,0,0,0.35)", border: `1px solid ${color}38`,
              borderRadius: "9px", padding: "2px 3px",
            }}>
              <button onClick={() => adjustToken(p.id, key, -1)} aria-label={`Remove ${key} token from ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "1px 5px", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1 }}>−</button>
              <span style={{ fontSize: "0.9rem" }}>{emoji}</span>
              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#fff", minWidth: "16px", textAlign: "center" }}>{p.tokens?.[key] ?? 0}</span>
              <button onClick={() => adjustToken(p.id, key, 1)} aria-label={`Add ${key} token to ${p.name}`} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "1px 5px", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1 }}>+</button>
            </div>
          ))}
        </div>
      )}

      {/* City's Blessing Toggle */}
      {activeCounters.cityBlessing && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => toggleCityBlessing(p.id)}
            style={{
              background: p.cityBlessing ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${p.cityBlessing ? "rgba(234,179,8,0.35)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px", padding: "3px 12px", cursor: "pointer",
              color: p.cityBlessing ? "#eab308" : "var(--text-muted)",
              fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <Star size={10} fill={p.cityBlessing ? "#eab308" : "none"} color={p.cityBlessing ? "#eab308" : "var(--text-muted)"} />
            {p.cityBlessing ? "City's Blessing ✓" : "Gain City's Blessing"}
          </button>
        </div>
      )}

      {/* Commander Damage Badges */}
      {Object.keys(p.commanderDamage).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
          {Object.entries(p.commanderDamage).map(([key, dmg]) => {
            if (!dmg) return null;
            const srcId = parseInt(key.split("_")[0], 10);
            const isPartner = key.includes("_B");
            const src = players.find(s => s.id === srcId);
            const srcColor = src ? (colors[src.colorName]?.accent || "#ef4444") : "#ef4444";
            return (
              <div key={key} style={{
                background: "rgba(0,0,0,0.4)", border: `1px solid ${srcColor}70`,
                borderRadius: "6px", padding: "2px 8px", fontSize: "0.7rem",
                color: srcColor, display: "flex", gap: "5px", alignItems: "center",
              }}>
                <span>{src?.name ?? `P${srcId}`}{isPartner ? " (P)" : ""}</span>
                <span style={{ fontWeight: 800, color: dmg >= 21 ? "#ef4444" : "#fff" }}>{dmg}/21</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Token Type Picker */}
      {p.tokensOpen && (
        <div style={{
          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "8px", padding: "6px 8px",
          display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "center",
          position: "relative", zIndex: 16,
        }}>
          {TOKEN_TYPES.map(({ key, label, emoji, color }) => {
            const isEnabled = p.enabledTokens.includes(key);
            return (
              <button
                key={key}
                onClick={() => togglePlayerTokenType(p.id, key)}
                style={{
                  background: isEnabled ? `${color}18` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${isEnabled ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "7px", padding: "3px 8px", cursor: "pointer",
                  color: isEnabled ? color : "var(--text-muted)",
                  fontSize: "0.68rem", fontWeight: isEnabled ? 700 : 500,
                  display: "flex", alignItems: "center", gap: "4px",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>{emoji}</span>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Row: Tax | Tokens + Cmd Dmg */}
      <div className="lc-bottom-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "9px", gap: "4px" }}>

        {/* Tax (left) */}
        <div className="lc-tax-section" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.5px" }}>TAX:</span>
            <button
              onClick={() => togglePartner(p.id)}
              style={{
                fontSize: "0.68rem", border: "none",
                background: p.partnerMode ? "var(--accent-purple)" : "rgba(255,255,255,0.05)",
                color: p.partnerMode ? "#fff" : "var(--text-muted)",
                padding: "2px 8px", borderRadius: "10px", cursor: "pointer", fontWeight: 700,
              }}
            >Partner</button>
          </div>
          <div style={{ display: "flex", gap: p.partnerMode ? "8px" : "0", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "3px 7px" }}>
              <button onClick={() => adjustTax(p.id, false, -2)} aria-label="Decrease commander tax" style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Minus size={12} /></button>
              <span style={{ fontSize: "1.05rem", fontWeight: 700, minWidth: "22px", textAlign: "center", color: "#fff" }}>{p.tax}</span>
              <button onClick={() => adjustTax(p.id, false, 2)} aria-label="Increase commander tax" style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Plus size={12} /></button>
            </div>
            {p.partnerMode && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "3px 7px" }}>
                <button onClick={() => adjustTax(p.id, true, -2)} aria-label="Decrease partner tax" style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Minus size={12} /></button>
                <span style={{ fontSize: "1.05rem", fontWeight: 700, minWidth: "22px", textAlign: "center", color: "#fff" }}>{p.taxPartner}</span>
                <button onClick={() => adjustTax(p.id, true, 2)} aria-label="Increase partner tax" style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Plus size={12} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Tokens + Cmd Dmg grouped */}
        <div className="lc-bottom-secondary" style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            onClick={() => togglePlayerTokensPanel(p.id)}
            style={{
              background: p.tokensOpen ? "rgba(234,179,8,0.12)" : p.enabledTokens.length > 0 ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${p.tokensOpen ? "rgba(234,179,8,0.4)" : p.enabledTokens.length > 0 ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px", padding: "7px 10px", cursor: "pointer",
              color: p.tokensOpen || p.enabledTokens.length > 0 ? "#eab308" : "var(--text-muted)",
              fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "5px",
              transition: "all 0.15s ease", flexShrink: 0,
            }}
          >
            <Coins size={12} color={p.tokensOpen || p.enabledTokens.length > 0 ? "#eab308" : "var(--text-muted)"} />
            <span className="lc-btn-label">Tokens{p.enabledTokens.length > 0 ? ` (${p.enabledTokens.length})` : ""}</span>
          </button>

          <button
            onClick={() => setActiveDamageEditor(p.id)}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px", padding: "7px 10px", color: "var(--text-primary)",
              fontSize: "0.72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
              transition: "background 0.15s", flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
          >
            <Shield size={13} color="var(--accent-cyan)" />
            <span className="lc-btn-label">Cmd Dmg</span>
          </button>
        </div>
      </div>

      {/* Close avatar picker on outside click */}
      {avatarPickerOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 19 }}
          onClick={() => setAvatarPickerOpen(false)}
        />
      )}

      {/* Close token picker on outside click / tap */}
      {p.tokensOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 15 }}
          onClick={() => togglePlayerTokensPanel(p.id)}
        />
      )}
    </div>
  );
};
