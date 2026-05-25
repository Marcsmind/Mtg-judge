/**
 * TableView — multiplayer split layout.
 *
 * "My card" is shown full-size at the bottom. All opponents are shown as compact
 * tappable tiles that open a detail BottomSheet with full stats and life controls.
 *
 * Only rendered when roomConnected && myPlayerIndex !== null.
 * Local solo sessions use the standard symmetric grid.
 */

import React, { useState, useEffect } from "react";
import { Crown, Skull, ShieldAlert, Coins } from "lucide-react";
import type { Player, ActiveCounters } from "../../types/game";
import type { SavedDeck } from "../../types/deck";
import { PlayerCard } from "./PlayerCard";
import { TOKEN_TYPES } from "./TokenModal";
import { BottomSheet } from "../../components/BottomSheet";
import { searchCardFuzzy } from "../../services/scryfall";
import { useMobile } from "../../hooks/useMobile";

interface ColorTheme { bg: string; accent: string; border: string; }

// ── Props ────────────────────────────────────────────────────────────────────

export interface TableViewProps {
  players:                Player[];
  myIndex:                number;
  colors:                 Record<string, ColorTheme>;
  activeCounters:         ActiveCounters;
  heartbeatTimes:         Map<number, number>;
  adjustLife:             (id: number, delta: number) => void;
  adjustPoison:           (id: number, delta: number) => void;
  renamePlayer:           (id: number, name: string) => void;
  setAvatar?:             (id: number, emoji: string) => void;
  toggleCityBlessing:     (id: number) => void;
  togglePlayerTokensPanel:(id: number) => void;
  togglePlayerTaxPanel?:  (id: number) => void;
  setActiveDamageEditor:  (id: number) => void;
  revivePlayer:           (id: number) => void;
  firstPlayerName:        string | null;
  showFirstFlash:         boolean;
  activePlayerIndex:      number;
  savedDecks:             SavedDeck[];
  onSetCommander?:        (id: number, name: string, deckId?: string) => void;
  onClearCommander?:      (id: number) => void;
}

// ── Opponent detail sheet ─────────────────────────────────────────────────────

interface DetailSheetProps {
  player:         Player;
  allPlayers:     Player[];
  theme:          ColorTheme;
  lastHeartbeat:  number | undefined;
  adjustLife:     (id: number, delta: number) => void;
  adjustPoison:   (id: number, delta: number) => void;
  onClose:        () => void;
}

const adjBtn: React.CSSProperties = {
  width: "52px", height: "52px", borderRadius: "50%",
  border: "none", fontSize: "1.8rem", fontWeight: 300,
  background: "rgba(255,255,255,0.08)", color: "#fff",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  touchAction: "none",
};

const OpponentDetailSheet: React.FC<DetailSheetProps> = ({
  player: p, allPlayers, theme, lastHeartbeat, adjustLife, adjustPoison, onClose,
}) => {
  const [cmdArt, setCmdArt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!p.commanderName) { setCmdArt(null); return; }
    let active = true;
    searchCardFuzzy(p.commanderName).then(card => {
      if (!active) return;
      const url = card?.image_uris?.art_crop
        ?? card?.card_faces?.[0]?.image_uris?.art_crop;
      if (url) setCmdArt(url);
    });
    return () => { active = false; };
  }, [p.commanderName]);

  const dotColor = lastHeartbeat === undefined ? null
    : (now - lastHeartbeat < 10_000) ? "#22c55e"
    : (now - lastHeartbeat < 30_000) ? "#eab308"
    : "#6b7280";

  const presenceLabel = lastHeartbeat === undefined ? "Not in room"
    : (now - lastHeartbeat < 10_000) ? "Online"
    : (now - lastHeartbeat < 30_000) ? "Lagging"
    : "Offline / screen locked";

  const cmdDamageEntries = Object.entries(p.commanderDamage)
    .filter(([, dmg]) => dmg > 0)
    .map(([key, dmg]) => {
      const srcId = parseInt(key.split("_")[0], 10);
      const isPartner = key.includes("_B");
      const src = allPlayers.find(s => s.id === srcId);
      return { label: `${src?.name ?? `Player ${srcId}`}${isPartner ? " (Partner)" : ""}`, dmg };
    });

  const activeTokens = TOKEN_TYPES.filter(t => (p.tokens?.[t.key] ?? 0) > 0);
  const isDefeated = p.life <= 0 || (p.poison ?? 0) >= 10
    || Object.values(p.commanderDamage).some(d => d >= 21);

  return (
    <BottomSheet onClose={onClose} zIndex={300} maxWidth="440px" padding="20px">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{
          width: "14px", height: "40px", borderRadius: "4px",
          background: theme.accent, flexShrink: 0,
        }} />
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
            {p.name}
          </h2>
          {dotColor && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: dotColor, flexShrink: 0,
              }} />
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{presenceLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* Life total with +/− controls */}
      <div style={{
        textAlign: "center", padding: "16px 0 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: "14px",
      }}>
        <span style={{
          fontSize: "4.5rem", fontWeight: 900, lineHeight: 1,
          color: isDefeated ? "#ef4444" : theme.accent,
        }}>
          {p.life}
        </span>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>life</div>
        {isDefeated && (
          <div style={{ color: "#ef4444", fontSize: "0.78rem", fontWeight: 700, marginTop: "4px" }}>
            DEFEATED
          </div>
        )}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "12px" }}>
          <button
            onPointerDown={() => adjustLife(p.id, -1)}
            style={adjBtn}
            aria-label={`Subtract 1 life from ${p.name}`}
          >−</button>
          <button
            onPointerDown={() => adjustLife(p.id, +1)}
            style={adjBtn}
            aria-label={`Add 1 life to ${p.name}`}
          >+</button>
        </div>
      </div>

      {/* Commander */}
      {p.commanderName && (
        <div style={{
          background: "rgba(255,255,255,0.04)", borderRadius: "10px",
          padding: "10px 12px", marginBottom: "12px", overflow: "hidden",
        }}>
          {cmdArt && (
            <img src={cmdArt} alt={p.commanderName}
              style={{
                width: "100%", height: "80px",
                objectFit: "cover", borderRadius: "6px",
                marginBottom: "8px", display: "block",
              }} />
          )}
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Commander</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>{p.commanderName}</div>
        </div>
      )}

      {/* Poison counter with +/− */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <Skull size={14} color="#a3e635" />
        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", flex: 1 }}>Poison</span>
        <button
          onPointerDown={() => adjustPoison(p.id, -1)}
          style={{ ...adjBtn, width: "36px", height: "36px", fontSize: "1.2rem" }}
          aria-label={`Remove poison from ${p.name}`}
        >−</button>
        <span style={{ fontSize: "1.1rem", fontWeight: 700, minWidth: "24px", textAlign: "center",
          color: (p.poison ?? 0) >= 10 ? "#ef4444" : "#a3e635" }}>
          {p.poison ?? 0}
        </span>
        <button
          onPointerDown={() => adjustPoison(p.id, +1)}
          style={{ ...adjBtn, width: "36px", height: "36px", fontSize: "1.2rem" }}
          aria-label={`Add poison to ${p.name}`}
        >+</button>
      </div>

      {/* Status row — rad, monarch, initiative, city's blessing */}
      {((p.rad ?? 0) > 0 || p.isMonarch || p.hasInitiative || p.cityBlessing) && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          {(p.rad ?? 0) > 0 && (
            <div style={statusPill("#84cc16")}>
              ☢️ {p.rad} rad
            </div>
          )}
          {p.isMonarch && (
            <div style={statusPill("#eab308")}>
              <Crown size={12} /> Monarch
            </div>
          )}
          {p.hasInitiative && (
            <div style={statusPill("#8b5cf6")}>
              <ShieldAlert size={12} /> Initiative
            </div>
          )}
          {p.cityBlessing && (
            <div style={statusPill("#06b6d4")}>
              ✦ City's Blessing
            </div>
          )}
        </div>
      )}

      {/* Tokens */}
      {activeTokens.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <div style={sectionLabel}>Tokens</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {activeTokens.map(({ key, emoji, color, label }) => (
              <div key={key} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${color}50`,
                borderRadius: "8px", padding: "4px 10px",
                display: "flex", gap: "5px", alignItems: "center",
                fontSize: "0.8rem", color,
              }}>
                <span>{emoji}</span>
                <span style={{ fontWeight: 700 }}>{p.tokens?.[key] ?? 0}</span>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commander damage */}
      {cmdDamageEntries.length > 0 && (
        <div>
          <div style={sectionLabel}>Commander Damage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {cmdDamageEntries.map(({ label, dmg }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "rgba(0,0,0,0.25)", borderRadius: "8px", padding: "6px 10px",
              }}>
                <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Coins size={12} color="#ef4444" /> {label}
                </span>
                <span style={{ fontWeight: 800, color: dmg >= 21 ? "#ef4444" : "var(--text-primary)", fontSize: "0.9rem" }}>
                  {dmg}<span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/21</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
};

// ── Compact opponent tile ─────────────────────────────────────────────────────

interface CompactCardProps {
  p:             Player;
  theme:         ColorTheme;
  lastHeartbeat: number | undefined;
  presenceNow:   number;
  onClick:       () => void;
}

const CompactOpponentCard: React.FC<CompactCardProps> = ({
  p, theme, lastHeartbeat, presenceNow, onClick,
}) => {
  const [cmdArt, setCmdArt] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!p.commanderName) { setCmdArt(null); return; }
    let active = true;
    searchCardFuzzy(p.commanderName).then(card => {
      if (!active) return;
      const url = card?.image_uris?.art_crop
        ?? card?.card_faces?.[0]?.image_uris?.art_crop;
      if (url) setCmdArt(url);
    });
    return () => { active = false; };
  }, [p.commanderName]);

  const dotColor = lastHeartbeat === undefined ? null
    : (presenceNow - lastHeartbeat < 10_000) ? "#22c55e"
    : (presenceNow - lastHeartbeat < 30_000) ? "#eab308"
    : "#6b7280";

  const isDefeated = p.life <= 0 || (p.poison ?? 0) >= 10
    || Object.values(p.commanderDamage).some(d => d >= 21);

  return (
    <button
      onClick={onClick}
      style={{
        background: cmdArt
          ? undefined
          : theme.bg,
        backgroundImage: cmdArt
          ? `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.75)), url(${cmdArt})`
          : undefined,
        backgroundSize: cmdArt ? "cover" : undefined,
        backgroundPosition: cmdArt ? "center" : undefined,
        border: `1.5px solid ${isDefeated ? "rgba(239,68,68,0.5)" : theme.border}`,
        borderRadius: "12px", padding: "10px 8px",
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: "3px",
        cursor: "pointer", position: "relative",
        width: "100%", height: "100%",
        transition: "filter 0.15s ease",
        boxShadow: isDefeated ? "0 0 12px rgba(239,68,68,0.15) inset" : undefined,
      }}
      onPointerDown={e => (e.currentTarget.style.filter = "brightness(1.15)")}
      onPointerUp={e => (e.currentTarget.style.filter = "")}
      onPointerLeave={e => (e.currentTarget.style.filter = "")}
    >
      {/* Presence dot */}
      {dotColor && (
        <div aria-hidden style={{
          position: "absolute", top: "6px", right: "6px",
          width: "7px", height: "7px", borderRadius: "50%",
          background: dotColor, opacity: 0.55,
          boxShadow: `0 0 4px ${dotColor}`,
        }} />
      )}

      {/* Name */}
      <span style={{
        fontSize: "0.68rem", color: "var(--text-muted)",
        maxWidth: "100%", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingLeft: "4px", paddingRight: "14px",
      }}>
        {p.name}
      </span>

      {/* Life */}
      <span style={{
        fontSize: "2.4rem", fontWeight: 900, lineHeight: 1,
        color: isDefeated ? "#ef4444" : theme.accent,
      }}>
        {p.life}
      </span>

      {/* Status icons */}
      <div style={{ display: "flex", gap: "5px", alignItems: "center", minHeight: "14px" }}>
        {p.isMonarch && <Crown size={11} color="#eab308" />}
        {p.hasInitiative && <ShieldAlert size={11} color="#8b5cf6" />}
        {(p.poison ?? 0) > 0 && (
          <span style={{ fontSize: "0.6rem", color: "#a3e635", fontWeight: 700 }}>
            ☠{p.poison}
          </span>
        )}
        {TOKEN_TYPES.some(t => (p.tokens?.[t.key] ?? 0) > 0) && (
          <Coins size={11} color="#eab308" />
        )}
      </div>
    </button>
  );
};

// ── Small style helpers ───────────────────────────────────────────────────────

const statusPill = (color: string): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "5px",
  background: `${color}18`, border: `1px solid ${color}50`,
  borderRadius: "20px", padding: "3px 9px",
  fontSize: "0.72rem", color, fontWeight: 600,
});

const sectionLabel: React.CSSProperties = {
  fontSize: "0.65rem", color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: "0.8px",
  marginBottom: "6px", fontWeight: 600,
};

// ── TableView ─────────────────────────────────────────────────────────────────

export const TableView: React.FC<TableViewProps> = ({
  players, myIndex, colors, activeCounters, heartbeatTimes,
  adjustLife, adjustPoison, renamePlayer, setAvatar,
  toggleCityBlessing, togglePlayerTokensPanel, togglePlayerTaxPanel,
  setActiveDamageEditor, revivePlayer, firstPlayerName,
  showFirstFlash, activePlayerIndex, savedDecks,
  onSetCommander, onClearCommander,
}) => {
  const isMobile = useMobile(768);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Single shared tick for all compact cards so they all update together
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (!heartbeatTimes.size) return;
    const t = setInterval(() => setPresenceNow(Date.now()), 12_000);
    return () => clearInterval(t);
  }, [heartbeatTimes.size]);

  const me = players[myIndex];
  const myTheme = colors[me?.colorName] || colors.purple;
  const opponents = players
    .map((p, idx) => ({ p, idx }))
    .filter(({ idx }) => idx !== myIndex);

  const opponentCols = opponents.length === 1 ? 1 : opponents.length <= 4 ? 2 : 3;

  const selectedPlayer = selectedIdx !== null ? players[selectedIdx] : null;
  const selectedTheme  = selectedPlayer ? (colors[selectedPlayer.colorName] || colors.purple) : colors.purple;

  return (
    <div style={{
      display: "flex",
      // column-reverse puts my card at the bottom on mobile without changing DOM order
      flexDirection: isMobile ? "column-reverse" : "row",
      gap: "12px",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    }}>
      {/* ── My card (bottom on mobile, left on desktop) ── */}
      <div style={{
        flexShrink: 0,
        ...(isMobile
          ? { flex: "0 0 40%" }
          : { width: "32%", minWidth: "220px", order: 2 }
        ),
      }}>
        {me && (
          <PlayerCard
            key={me.id}
            p={me}
            players={players}
            playerTheme={myTheme}
            activeCounters={activeCounters}
            colors={colors}
            adjustLife={adjustLife}
            adjustPoison={adjustPoison}
            renamePlayer={renamePlayer}
            setAvatar={setAvatar}
            toggleCityBlessing={toggleCityBlessing}
            togglePlayerTokensPanel={togglePlayerTokensPanel}
            togglePlayerTaxPanel={togglePlayerTaxPanel}
            setActiveDamageEditor={setActiveDamageEditor}
            revivePlayer={revivePlayer}
            isFirst={firstPlayerName !== null && me.name === firstPlayerName}
            isActiveTurn={showFirstFlash && myIndex === activePlayerIndex}
            isLocalPlayer={true}
            commanderName={me.commanderName}
            onSetCommander={onSetCommander}
            onClearCommander={onClearCommander}
            savedDecks={savedDecks}
            lastHeartbeat={heartbeatTimes.get(myIndex)}
          />
        )}
      </div>

      {/* ── Opponent grid (top on mobile, left on desktop) ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${opponentCols}, 1fr)`,
        gridAutoRows: "1fr",
        gap: "10px",
        alignContent: "stretch",
        ...(isMobile ? {} : { order: 1 }),
      }}>
        {opponents.map(({ p, idx }) => (
          <CompactOpponentCard
            key={p.id}
            p={p}
            theme={colors[p.colorName] || colors.purple}
            lastHeartbeat={heartbeatTimes.get(idx)}
            presenceNow={presenceNow}
            onClick={() => setSelectedIdx(idx)}
          />
        ))}
      </div>

      {/* ── Opponent detail BottomSheet ── */}
      {selectedPlayer && (
        <OpponentDetailSheet
          player={selectedPlayer}
          allPlayers={players}
          theme={selectedTheme}
          lastHeartbeat={heartbeatTimes.get(selectedIdx!)}
          adjustLife={adjustLife}
          adjustPoison={adjustPoison}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
};
