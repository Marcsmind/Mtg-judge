/**
 * PlayerCard — renders a single player tile in the Life Counter grid.
 *
 * Extracted from LifeCounter.tsx so that file stays manageable.
 * All state lives in LifeCounter; PlayerCard is purely presentational and
 * communicates back via callback props.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldAlert, Skull,
  Star, Coins, Shield, Wand2, Crown
} from "lucide-react";
import type { Player, ActiveCounters } from "../../types/game";
import type { SavedDeck } from "../../types/deck";
import { SetCommanderModal } from "./SetCommanderModal";
import { CommanderPreviewModal } from "./CommanderPreviewModal";
import { searchCardFuzzy } from "../../services/scryfall";
import { TOKEN_TYPES } from "./TokenModal";

// ── Color theme shape (matches LifeCounter's `colors` map) ───────────────────
interface ColorTheme { bg: string; accent: string; border: string; }

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
  renamePlayer:         (id: number, name: string) => void;
  setAvatar?:            (id: number, emoji: string) => void;
  toggleCityBlessing:   (id: number) => void;
  togglePlayerTokensPanel:(id: number) => void;
  togglePlayerTaxPanel?: (id: number) => void;
  setActiveDamageEditor:(id: number) => void;
  revivePlayer:         (id: number) => void;
  isFirst?:             boolean;   // "Goes First" star — auto-dismisses after 10 s
  commanderName?:       string;   // commander name — wand button always visible
  onSetCommander?:      (id: number, name: string, deckId?: string) => void;
  onClearCommander?:    (id: number) => void;
  savedDecks?:          SavedDeck[];
  isActiveTurn?:        boolean;  // turn tracker — highlights the active player
  isLocalPlayer?:       boolean;  // true = this seat belongs to the device; default true (open edit)
  lastHeartbeat?:       number;   // Date.now() of last received heartbeat; undefined = not in a room
}

const PlayerCardBase: React.FC<PlayerCardProps> = ({
  p,
  players,
  playerTheme,
  activeCounters,
  colors,
  adjustLife,
  adjustPoison,
  renamePlayer,
  // setAvatar intentionally omitted — avatar picker removed
  toggleCityBlessing,
  togglePlayerTokensPanel,
  togglePlayerTaxPanel,
  setActiveDamageEditor,
  revivePlayer,
  isFirst = false,
  commanderName,
  onSetCommander,
  onClearCommander,
  savedDecks = [],
  isActiveTurn = false,
  isLocalPlayer = true,
  lastHeartbeat,
}) => {

  const [commanderArt, setCommanderArt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (commanderName) {
      searchCardFuzzy(commanderName).then(card => {
        if (active && card?.image_uris?.art_crop) {
          setCommanderArt(card.image_uris.art_crop);
        }
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommanderArt(null);
    }
    return () => { active = false; };
  }, [commanderName]);

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
  const holdTimerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable refs so interval closure never goes stale across re-renders
  const adjustLifeRef   = useRef(adjustLife);
  const playerIdRef     = useRef(p.id);
  useEffect(() => { adjustLifeRef.current = adjustLife; }, [adjustLife]);

  const minusBtnRef = useRef<HTMLDivElement>(null);
  const plusBtnRef  = useRef<HTMLDivElement>(null);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current)    { clearTimeout(holdTimerRef.current);   holdTimerRef.current   = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []); // stable — no deps

  const startHold = useCallback((delta: number) => {
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        adjustLifeRef.current(playerIdRef.current, delta);
        navigator.vibrate?.([10]);
      }, 120);
    }, 350);
  }, []); // stable — no deps, uses refs

  // Native touch listeners with passive:false so preventDefault() works on iOS.
  // This prevents the browser from treating a slow hold as a scroll or text-select
  // gesture and firing pointercancel before the 350ms timer fires.
  useEffect(() => {
    const minus = minusBtnRef.current;
    const plus  = plusBtnRef.current;
    if (!minus || !plus) return;

    const onMinusStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      adjustLifeRef.current(playerIdRef.current, -1);
      startHold(-1);
    };
    const onPlusStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      adjustLifeRef.current(playerIdRef.current, 1);
      startHold(1);
    };
    const onEnd = () => stopHold();

    minus.addEventListener('touchstart', onMinusStart, { passive: false });
    minus.addEventListener('touchend',   onEnd);
    minus.addEventListener('touchcancel', onEnd);
    plus.addEventListener('touchstart',  onPlusStart,  { passive: false });
    plus.addEventListener('touchend',    onEnd);
    plus.addEventListener('touchcancel', onEnd);

    return () => {
      minus.removeEventListener('touchstart', onMinusStart);
      minus.removeEventListener('touchend',   onEnd);
      minus.removeEventListener('touchcancel', onEnd);
      plus.removeEventListener('touchstart',  onPlusStart);
      plus.removeEventListener('touchend',    onEnd);
      plus.removeEventListener('touchcancel', onEnd);
    };
  }, [startHold, stopHold]);

  // ── Active Life Delta Tracker ───────────────────────────────────────────────
  const [lifeDelta, setLifeDelta] = useState(0);
  const prevLifeRef = useRef(p.life);
  const deltaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const diff = p.life - prevLifeRef.current;
    if (diff !== 0) {
      setLifeDelta(prev => prev + diff);
      prevLifeRef.current = p.life;
      
      if (deltaTimeoutRef.current) clearTimeout(deltaTimeoutRef.current);
      deltaTimeoutRef.current = setTimeout(() => {
        setLifeDelta(0);
      }, 2500); // Wait 2.5s before clearing
    }
  }, [p.life]);

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

  // ── Presence dot ──────────────────────────────────────────────────────────
  // Tick every 12 s so color stays fresh as heartbeats age — store `now` in
  // state to avoid calling Date.now() during render (react-hooks/purity rule).
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastHeartbeat === undefined) return;
    const t = setInterval(() => setPresenceNow(Date.now()), 12_000);
    return () => clearInterval(t);
  }, [lastHeartbeat !== undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotColor = lastHeartbeat === undefined ? null
    : (presenceNow - lastHeartbeat < 10_000)  ? "#22c55e"  // green  — live
    : (presenceNow - lastHeartbeat < 30_000)  ? "#eab308"  // yellow — lagging
    : "#6b7280";                                             // gray   — offline/locked

  return (
    <div
      style={{
        background: commanderArt
          ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.85)), url(${commanderArt}) center/cover no-repeat`
          : playerTheme.bg,
        borderRadius: "14px",
        border: `1.5px solid ${p.isMonarch ? "#eab308" : isDefeated ? "rgba(239,68,68,0.6)" : isActiveTurn ? "var(--accent-purple)" : playerTheme.border}`,
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px",
        height: "100%",
        boxShadow: p.isMonarch
          ? "0 0 24px rgba(234,179,8,0.18), 0 4px 20px rgba(0,0,0,0.3)"
          : isDefeated
            ? "0 0 20px rgba(239,68,68,0.2) inset, 0 4px 20px rgba(0,0,0,0.3)"
            : isActiveTurn
              ? "0 0 0 2px var(--accent-purple-glow), 0 0 18px rgba(139,92,246,0.25), 0 4px 20px rgba(0,0,0,0.3)"
              : "0 4px 20px rgba(0,0,0,0.3)",
        position: "relative", overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
        filter: (!isDefeated && dotColor === "#6b7280") ? "grayscale(0.8) brightness(0.6)" : "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({"WebkitTouchCallout": "none"} as any),
      }}
    >
      {/* ── Presence dot — only shown during a multiplayer session ── */}
      {dotColor && (
        <div
          aria-hidden
          style={{
            position: "absolute", top: "8px", right: "8px",
            width: "8px", height: "8px", borderRadius: "50%",
            background: dotColor, opacity: 0.55,
            boxShadow: `0 0 5px ${dotColor}`,
            pointerEvents: "none", zIndex: 20,
            transition: "background 1s ease, box-shadow 1s ease",
          }}
        />
      )}

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

      {/* ── Header Row: Name ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: (activeCounters.monarch || activeCounters.initiative) ? "44px" : "0", gap: "6px" }}>
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
          ref={minusBtnRef}
          role="button"
          aria-label={`Subtract 1 life from ${p.name} (hold to keep subtracting)`}
          onPointerDown={e => { if (e.pointerType === 'touch') return; if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, -1); startHold(-1); } }}
          onPointerUp={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerCancel={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerLeave={e => { const el = e.currentTarget.querySelector(".lc-adj-icon") as HTMLElement | null; if (el) el.style.opacity = "0.40"; }}
          onPointerEnter={e => { const el = e.currentTarget.querySelector(".lc-adj-icon") as HTMLElement | null; if (el) el.style.opacity = "0.8"; }}
          onContextMenu={e => e.preventDefault()}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: "pointer", userSelect: "none", touchAction: "none",
          }}
        >
          <span className="lc-adj-icon" style={{
            fontSize: "1.6rem", fontWeight: 300, color: "#fff",
            opacity: 0.40, lineHeight: 1, userSelect: "none",
            transition: "opacity 0.12s ease",
          }}>−</span>
        </div>

        {/* Center: life number */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minWidth: "80px", pointerEvents: "none", position: "relative",
        }}>
          {lifeDelta !== 0 && (
            <div
              key={lifeDelta} // force re-render/animation restart on change
              style={{
                position: "absolute",
                top: "-20px",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "1.8rem",
                fontWeight: 900,
                color: lifeDelta > 0 ? "#10b981" : "#ef4444",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                zIndex: 10,
                pointerEvents: "none",
                animation: "delta-fade-up 2.5s ease-out forwards",
              }}
            >
              {lifeDelta > 0 ? `+${lifeDelta}` : lifeDelta}
            </div>
          )}
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
              opacity: (dotColor === "#6b7280" || dotColor === "#eab308") ? 0.3 : 1,
              userSelect: "none",
              WebkitUserSelect: "none",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...({"WebkitTouchCallout": "none"} as any),
              pointerEvents: "none",
            }}
          >
            {p.life}
          </span>

          {/* Offline/Lagging Overlay */}
          {!isDefeated && dotColor === "#6b7280" && (
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px", padding: "6px 12px",
              fontSize: "1.2rem", fontWeight: 800, letterSpacing: "1px", color: "var(--text-muted)",
              pointerEvents: "none", zIndex: 10,
            }}>
              OFFLINE
            </div>
          )}
          {!isDefeated && dotColor === "#eab308" && (
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)",
              borderRadius: "8px", padding: "6px 12px",
              fontSize: "1.2rem", fontWeight: 800, letterSpacing: "1px", color: "var(--accent-gold)",
              pointerEvents: "none", zIndex: 10,
            }}>
              LAGGING
            </div>
          )}
        </div>

        {/* Right zone: add life */}
        <div
          ref={plusBtnRef}
          role="button"
          aria-label={`Add 1 life to ${p.name} (hold to keep adding)`}
          onPointerDown={e => { if (e.pointerType === 'touch') return; if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, 1); startHold(1); } }}
          onPointerUp={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerCancel={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
          onPointerLeave={e => { const el = e.currentTarget.querySelector(".lc-adj-icon") as HTMLElement | null; if (el) el.style.opacity = "0.40"; }}
          onPointerEnter={e => { const el = e.currentTarget.querySelector(".lc-adj-icon") as HTMLElement | null; if (el) el.style.opacity = "0.8"; }}
          onContextMenu={e => e.preventDefault()}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: "pointer", userSelect: "none", touchAction: "none",
          }}
        >
          <span className="lc-adj-icon" style={{
            fontSize: "1.6rem", fontWeight: 300, color: "#fff",
            opacity: 0.40, lineHeight: 1, userSelect: "none",
            transition: "opacity 0.12s ease",
          }}>+</span>
        </div>
      </div>


      {/* ── Poison + Rad Counters ── */}
      {activeCounters.poison && (
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


        </div>
      )}

      {/* ── Active Token Badges ── */}
      {TOKEN_TYPES.some(t => (p.tokens?.[t.key] ?? 0) > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
          {TOKEN_TYPES.filter(t => (p.tokens?.[t.key] ?? 0) > 0).map(({ key, emoji, color }) => (
            <div key={key} style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${color}70`,
              borderRadius: "8px", padding: "4px 8px", fontSize: "0.85rem",
              color: color, display: "flex", gap: "5px", alignItems: "center",
              justifyContent: "center"
            }}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>{emoji}</span>
              <span style={{ fontWeight: 800, color: "#fff", fontSize: "0.85rem", lineHeight: 1 }}>{p.tokens[key]}</span>
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


      {/* Commander Tax Badges */}
      {(p.tax > 0 || (p.partnerMode && p.taxPartner > 0)) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
          {p.tax > 0 && (
            <div style={{
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(168,85,247,0.5)",
              borderRadius: "6px", padding: "2px 8px", fontSize: "0.7rem",
              color: "var(--accent-purple)", display: "flex", gap: "5px", alignItems: "center",
            }}>
              <span>Tax</span>
              <span style={{ fontWeight: 800, color: "#fff" }}>{p.tax}</span>
            </div>
          )}
          {p.partnerMode && p.taxPartner > 0 && (
            <div style={{
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(168,85,247,0.5)",
              borderRadius: "6px", padding: "2px 8px", fontSize: "0.7rem",
              color: "var(--accent-purple)", display: "flex", gap: "5px", alignItems: "center",
            }}>
              <span>Partner Tax</span>
              <span style={{ fontWeight: 800, color: "#fff" }}>{p.taxPartner}</span>
            </div>
          )}
        </div>
      )}



      {/* Bottom Row: Tax | Tokens | Cmd Dmg */}
      <div className="lc-bottom-row" style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "9px", gap: "12px" }}>
        
        <button
          onClick={() => togglePlayerTaxPanel?.(p.id)}
          aria-label="Commander Tax"
          style={{
            background: p.tax > 0 || p.taxPartner > 0 ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${p.tax > 0 || p.taxPartner > 0 ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: "8px", padding: "8px", color: p.tax > 0 || p.taxPartner > 0 ? "var(--accent-purple)" : "var(--text-muted)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s ease", flexShrink: 0,
          }}
        >
          <Crown size={18} color={p.tax > 0 || p.taxPartner > 0 ? "var(--accent-purple)" : "var(--text-muted)"} />
        </button>

        <button
          onClick={() => togglePlayerTokensPanel(p.id)}
          aria-label="Tokens"
          style={{
            background: Object.values(p.tokens ?? {}).some(v => v > 0) ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${Object.values(p.tokens ?? {}).some(v => v > 0) ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: "8px", padding: "8px", cursor: "pointer",
            color: Object.values(p.tokens ?? {}).some(v => v > 0) ? "#eab308" : "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s ease", flexShrink: 0,
          }}
        >
          <Coins size={18} color={Object.values(p.tokens ?? {}).some(v => v > 0) ? "#eab308" : "var(--text-muted)"} />
        </button>

        <button
          onClick={() => setActiveDamageEditor(p.id)}
          aria-label="Commander Damage"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px", padding: "8px", color: "var(--text-primary)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s", flexShrink: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          <Shield size={18} color="var(--accent-cyan)" />
        </button>
      </div>


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

export const PlayerCard = React.memo(PlayerCardBase);
