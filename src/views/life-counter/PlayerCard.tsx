/**
 * PlayerCard — renders a single player tile in the Life Counter grid.
 *
 * All game state and action callbacks come from GameContext (see GameContext.tsx).
 * Props are limited to per-seat display data that can't come from shared context.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { ShieldAlert, Star, Crown, Swords } from "lucide-react";
import type { Player } from "../../types/game";
import { searchCardFuzzy } from "../../services/scryfall";
import { useGameState, useGameActions } from "./GameContext";
import { getLayoutGrid } from "./layoutGrid";

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  p:              Player;
  isFirst?:       boolean;   // "Goes First" star — auto-dismisses after 10 s
  isActiveTurn?:  boolean;   // highlights the active player
  isLocalPlayer?: boolean;   // true = this seat belongs to the device; default true
  lastHeartbeat?: number;    // Date.now() of last received heartbeat; undefined = not in a room
  rotate?:        boolean;   // true = rotate 180° (across-table seat, 2P layout only)
  gridRotation?:  number;    // degrees the card is rotated; damage grid counter-rotates by this amount
}

const PlayerCardBase: React.FC<PlayerCardProps> = ({
  p,
  isFirst       = false,
  isActiveTurn  = false,
  isLocalPlayer: _isLocalPlayer = true,
  lastHeartbeat,
  rotate        = false,
  gridRotation  = 0,
}) => {
  const { players, activeCounters, colors, playerCount, layoutMode } = useGameState();
  const {
    adjustLife,
    openCommanderHub, openPlayerSetup,
    setActiveDamageEditor, revivePlayer,
  } = useGameActions();

  const playerTheme = colors[p.colorName] || colors.purple;

  const [commanderArtUrl, setCommanderArtUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const artName = p.artUsePartner ? p.partnerCommanderName : p.commanderName;
    if (artName) {
      searchCardFuzzy(artName).then(card => {
        if (active && card?.image_uris?.art_crop) setCommanderArtUrl(card.image_uris.art_crop);
        else if (active) setCommanderArtUrl(null);
      });
    } else {
      setCommanderArtUrl(null);
    }
    return () => { active = false; };
  }, [p.commanderName, p.partnerCommanderName, p.artUsePartner]);

  // ── "Goes First" badge — shows briefly then auto-dismisses ───────────────
  const [showFirstBadge, setShowFirstBadge] = useState(isFirst);
  const firstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirst) {
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
  const adjustLifeRef = useRef(adjustLife);
  const playerIdRef   = useRef(p.id);
  useEffect(() => { adjustLifeRef.current = adjustLife; }, [adjustLife]);
  useEffect(() => { playerIdRef.current = p.id; }, [p.id]);

  const minusBtnRef = useRef<HTMLDivElement>(null);
  const plusBtnRef  = useRef<HTMLDivElement>(null);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current)    { clearTimeout(holdTimerRef.current);    holdTimerRef.current   = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);

  const startHold = useCallback((delta: number) => {
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        adjustLifeRef.current(playerIdRef.current, delta);
        navigator.vibrate?.([10]);
      }, 120);
    }, 350);
  }, []);

  // Native touch listeners with passive:false so preventDefault() works on iOS.
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

  // ── Active Life Delta Tracker ─────────────────────────────────────────────
  const [lifeDelta, setLifeDelta] = useState(0);
  const prevLifeRef     = useRef(p.life);
  const deltaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const diff = p.life - prevLifeRef.current;
    if (diff !== 0) {
      setLifeDelta(prev => prev + diff);
      prevLifeRef.current = p.life;
      if (deltaTimeoutRef.current) clearTimeout(deltaTimeoutRef.current);
      deltaTimeoutRef.current = setTimeout(() => setLifeDelta(0), 2500);
    }
  }, [p.life]);

  // ── Defeat conditions ─────────────────────────────────────────────────────
  const isDeadGeneral = p.life <= 0;
  const isPoisonDead  = (p.poison ?? 0) >= 10;

  const getCmdDeathReason = (): string | null => {
    for (const [key, dmg] of Object.entries(p.commanderDamage)) {
      if (dmg >= 21) {
        const srcId    = parseInt(key.split("_")[0]);
        const isPartner = key.includes("_B");
        const src      = players.find(s => s.id === srcId);
        return `${src?.name ?? `P${srcId}`}'s ${isPartner ? "Partner" : "Commander"} (${dmg}/21)`;
      }
    }
    return null;
  };

  const cmdDeath   = getCmdDeathReason();
  const isDefeated = isDeadGeneral || !!cmdDeath || isPoisonDead;

  // ── Presence dot ─────────────────────────────────────────────────────────
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastHeartbeat === undefined) return;
    const t = setInterval(() => setPresenceNow(Date.now()), 12_000);
    return () => clearInterval(t);
  }, [lastHeartbeat !== undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotColor = lastHeartbeat === undefined ? null
    : (presenceNow - lastHeartbeat < 10_000) ? "#22c55e"
    : (presenceNow - lastHeartbeat < 30_000) ? "#eab308"
    : "#6b7280";

  return (
    <div
      style={{
        background: commanderArtUrl
          ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.85)), url(${commanderArtUrl}) ${p.artOffsetX ?? 50}% ${p.artOffsetY ?? 35}% / ${p.artZoom != null ? p.artZoom + '% auto' : 'cover'} no-repeat`
          : playerTheme.bg,
        borderRadius: "14px",
        border: `1.5px solid ${p.isMonarch ? "#eab308" : isDefeated ? "rgba(239,68,68,0.6)" : isActiveTurn ? "var(--accent-purple)" : playerTheme.border}`,
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px",
        height: "100%",
        transform: rotate ? "rotate(180deg)" : undefined,
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
      {/* Full-card touch zones — left half subtracts, right half adds.
          z-index 2 so they sit above normal-flow content but below header/grid (z:3) and crown (z:5). */}
      <div
        ref={minusBtnRef}
        role="button"
        aria-label={`Subtract life from ${p.name}`}
        onPointerDown={e => { if (e.pointerType === 'touch') return; if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, -1); startHold(-1); } }}
        onPointerUp={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
        onPointerCancel={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
        onContextMenu={e => e.preventDefault()}
        style={{ position: "absolute", inset: "0 50% 0 0", zIndex: 2, touchAction: "none", cursor: "pointer" }}
      />
      <div
        ref={plusBtnRef}
        role="button"
        aria-label={`Add life to ${p.name}`}
        onPointerDown={e => { if (e.pointerType === 'touch') return; if (e.isPrimary) { e.currentTarget.setPointerCapture(e.pointerId); adjustLife(p.id, 1); startHold(1); } }}
        onPointerUp={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
        onPointerCancel={e => { if (e.pointerType === 'touch') return; e.currentTarget.releasePointerCapture(e.pointerId); stopHold(); }}
        onContextMenu={e => e.preventDefault()}
        style={{ position: "absolute", inset: "0 0 0 50%", zIndex: 2, touchAction: "none", cursor: "pointer" }}
      />

      {/* Presence dot */}
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

      {/* Crown: opens Commander Hub — absolute bottom-right */}
      <button
        onClick={() => openCommanderHub(p.id)}
        aria-label="Commander Hub"
        style={{
          position: "absolute", bottom: "8px", right: "10px",
          background: (p.tax > 0 || p.taxPartner > 0) ? "rgba(168,85,247,0.14)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${(p.tax > 0 || p.taxPartner > 0) ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: "7px", padding: "5px 9px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 5,
        }}
      >
        <Crown size={14} color={(p.tax > 0 || p.taxPartner > 0) ? "var(--accent-purple)" : "var(--text-muted)"} />
      </button>

      {/* "Goes First" Star Badge */}
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

      {/* Defeated Overlay */}
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

      {/* Header: Name row, then commander row */}
      <button
        onClick={() => p.commanderName ? openCommanderHub(p.id) : openPlayerSetup(p.id)}
        aria-label={p.commanderName ? `Open Commander Hub for ${p.name}` : `Edit ${p.name}`}
        style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1px",
          paddingRight: (activeCounters.monarch || activeCounters.initiative) ? "44px" : "0",
          padding: "0", width: "100%", textAlign: "left",
          minHeight: "24px", flexShrink: 0,
          position: "relative", zIndex: 3,
        }}
      >
        {/* Player name */}
        <span style={{
          fontSize: "0.95rem", fontWeight: 700, fontFamily: "'Outfit', sans-serif",
          color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: "100%",
        }}>
          {p.name.slice(0, 12)}
        </span>

        {/* Commander line */}
        {p.commanderName ? (
          <span style={{
            fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-purple)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: "100%",
          }}>
            {p.commanderName}{p.partnerCommanderName ? ` / ${p.partnerCommanderName}` : ""}
          </span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "rgba(255,255,255,0.28)", whiteSpace: "nowrap" }}>
            <Swords size={9} color="rgba(255,255,255,0.28)" strokeWidth={2} />
            <span style={{ fontSize: "0.65rem" }}>Set commander</span>
          </span>
        )}
      </button>

      {/* City's Blessing label */}
      {activeCounters.cityBlessing && p.cityBlessing && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "-2px" }}>
          <Star size={10} color="#eab308" fill="#eab308" />
          <span style={{ fontSize: "0.65rem", color: "#eab308", fontWeight: 600 }}>City's Blessing</span>
        </div>
      )}

      {/* Life total — left/center/right zones */}
      <div
        className="lc-life-section"
        style={{ display: "flex", flex: 1, alignItems: "stretch", minHeight: playerCount === 2 ? "80px" : "65px", position: "relative" }}
      >
        {/* Delta overlay — above the button, left for negative / right for positive */}
        {lifeDelta !== 0 && (
          <div
            key={lifeDelta}
            style={{
              position: "absolute",
              ...(playerCount === 2
                ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
                : {
                    ...(lifeDelta > 0 ? { right: "10px" } : { left: "10px" }),
                    top: "6px",
                  }
              ),
              pointerEvents: "none", zIndex: 10,
            }}
          >
            <div style={{
              fontSize: "clamp(1.5rem, 4vw, 2.6rem)", fontWeight: 900,
              color: lifeDelta > 0 ? "#10b981" : "#ef4444",
              textShadow: "0 2px 10px rgba(0,0,0,0.9)",
              whiteSpace: "nowrap",
              animation: "delta-side-fade 2.5s ease-out forwards",
            }}>
              {lifeDelta > 0 ? `+${lifeDelta}` : lifeDelta}
            </div>
          </div>
        )}

        {/* Left zone: subtract (visual only — touch handled by absolute zone) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span className="lc-adj-icon" style={{ fontSize: "1.6rem", fontWeight: 300, color: "#fff", opacity: 0.40, lineHeight: 1, userSelect: "none" }}>−</span>
        </div>

        {/* Center: life number */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "80px", pointerEvents: "none" }}>
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

        {/* Right zone: add (visual only — touch handled by absolute zone) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span className="lc-adj-icon" style={{ fontSize: "1.6rem", fontWeight: 300, color: "#fff", opacity: 0.40, lineHeight: 1, userSelect: "none" }}>+</span>
        </div>
      </div>

      {/* Bottom Row: Commander Damage Grid — centered, consistent 56×56 */}
      {(() => {
        const { rows, cols, cells } = getLayoutGrid(playerCount, layoutMode);
        const selfIdx = players.findIndex(pl => pl.id === p.id);
        const gridCols = cols === 1 ? "1fr" : "1fr 1fr";
        const gridRowsTemplate = Array(rows).fill("1fr").join(" ");
        const counterRotate = gridRotation !== 0 ? `rotate(${-gridRotation}deg)` : undefined;
        const cellTextRotate = gridRotation !== 0 ? `rotate(${gridRotation}deg)` : undefined;

        return (
          <div className="lc-bottom-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "5px", position: "relative", zIndex: 3 }}>
            {/* Commander Damage Grid — tap anywhere to open damage modal */}
            <div
              onClick={() => setActiveDamageEditor(p.id)}
              title="Commander Damage"
              style={{
                cursor: "pointer",
                display: "grid",
                gridTemplateColumns: gridCols,
                gridTemplateRows: gridRowsTemplate,
                gap: "2px",
                width: playerCount === 2 ? "72px" : "56px", height: playerCount === 2 ? "72px" : "56px", flexShrink: 0, overflow: "hidden",
                transform: counterRotate,
                transformOrigin: "center",
              }}
            >
              {cells.map(cell => {
                const isSelf = cell.playerIdx === selfIdx;
                const srcPlayer = players[cell.playerIdx];
                const dmg = (!isSelf && srcPlayer)
                  ? Object.entries(p.commanderDamage)
                      .filter(([key]) => key.startsWith(String(srcPlayer.id)))
                      .reduce((sum, [, val]) => sum + val, 0)
                  : 0;
                const danger = !isSelf && dmg >= 15;
                const srcColor = srcPlayer ? (colors[srcPlayer.colorName]?.accent || "#999") : "#999";

                return (
                  <div
                    key={cell.playerIdx}
                    style={{
                      gridRow: `${cell.rowStart} / ${cell.rowEnd}`,
                      gridColumn: `${cell.colStart} / ${cell.colEnd}`,
                      background: isSelf
                        ? `${playerTheme.accent}22`
                        : danger ? "rgba(239,68,68,0.14)"
                        : dmg > 0 ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isSelf
                        ? `${playerTheme.accent}45`
                        : danger ? "rgba(239,68,68,0.28)"
                        : "rgba(255,255,255,0.05)"}`,
                      borderRadius: "3px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "2px", transform: cellTextRotate }}>
                      {isSelf ? (
                        <Crown size={8} color={playerTheme.accent} strokeWidth={2.5} />
                      ) : srcPlayer && (
                        <>
                          <span style={{ fontSize: "0.52rem", fontWeight: 600, color: dmg > 0 ? srcColor : "rgba(255,255,255,0.18)", lineHeight: 1 }}>
                            {srcPlayer.name.slice(0, 1)}
                          </span>
                          {dmg > 0 && (
                            <span style={{ fontSize: "0.6rem", fontWeight: 900, color: dmg >= 21 ? "#ef4444" : dmg >= 15 ? "#fca5a5" : "#fff", lineHeight: 1 }}>
                              {dmg}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        );
      })()}

    </div>
  );
};

export const PlayerCard = React.memo(PlayerCardBase);
