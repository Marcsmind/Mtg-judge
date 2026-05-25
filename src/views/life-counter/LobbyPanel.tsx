/**
 * LobbyPanel — Pre-game setup screen shown inside LifeCounter when a
 * multiplayer room is in "lobby" phase.
 *
 * Each player sees their own "Your Setup" section (name, color, commander)
 * and a read-only list of everyone else who has joined. The host sees the
 * "All in → Start" button once all players are ready.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, Users, Crown, LogOut, ChevronRight, Loader2, X } from "lucide-react";
import type { LobbyPlayer } from "../../types/game";
import {
  autocompleteCard,
  searchCardFuzzy,
  getCardImage,
} from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import { loadDecks } from "../../services/decks";
import type { SavedDeck } from "../../types/deck";

// ── Color palette (matches LifeCounter / TurnOrder) ───────────────────────────
const COLOR_OPTIONS: { key: LobbyPlayer["colorName"]; label: string; accent: string }[] = [
  { key: "purple", label: "Purple", accent: "#ec4899" },
  { key: "blue",   label: "Blue",   accent: "#38bdf8" },
  { key: "red",    label: "Red",    accent: "#ef4444" },
  { key: "green",  label: "Green",  accent: "#10b981" },
  { key: "white",  label: "White",  accent: "#d6ad60" },
  { key: "black",  label: "Black",  accent: "#a855f7" },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface LobbyPanelProps {
  roomCode: string;
  isHost: boolean;
  selfPlayer: LobbyPlayer;
  allPlayers: LobbyPlayer[];
  onUpdateSelf: (updates: Partial<LobbyPlayer>) => void;
  onStart: () => void;    // host only — advances to turn-select
  onLeave: () => void;
}

// ── Commander autocomplete (uses the shared Scryfall service with AbortController) ──
function useCommanderSuggestions(query: string) {
  const [suggestions, setSuggestions]         = useState<string[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [suggestionCards, setSuggestionCards] = useState<Map<string, ScryfallCard>>(new Map());
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const imgAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.length < 2) { setSuggestions([]); setSuggestionCards(new Map()); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      abortRef.current = new AbortController();
      const results = await autocompleteCard(query, abortRef.current.signal);
      const names = results.slice(0, 8);
      setSuggestions(names);
      setLoading(false);

      // Background: batch-fetch card images for all suggestions in one request
      imgAbortRef.current?.abort();
      imgAbortRef.current = new AbortController();
      if (names.length > 0) {
        const q = names.map(n => `!"${n}"`).join(" or ");
        try {
          const res = await fetch(
            `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`,
            { signal: imgAbortRef.current.signal }
          );
          if (!res.ok) return;
          const data = await res.json();
          const map = new Map<string, ScryfallCard>();
          for (const card of (data.data as ScryfallCard[])) map.set(card.name, card);
          setSuggestionCards(map);
        } catch { /* ignore abort/network errors */ }
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      imgAbortRef.current?.abort();
    };
  }, [query]);

  return { suggestions, loading, suggestionCards };
}

// ── Component ─────────────────────────────────────────────────────────────────
export const LobbyPanel: React.FC<LobbyPanelProps> = ({
  roomCode,
  isHost,
  selfPlayer,
  allPlayers,
  onUpdateSelf,
  onStart,
  onLeave,
}) => {
  const [nameInput, setNameInput]             = useState(selfPlayer.playerName);
  const [cmdInput, setCmdInput]               = useState(selfPlayer.commanderName);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savedDecks]                          = useState<SavedDeck[]>(() => loadDecks());
  // Card data for the currently confirmed commander (shows art thumbnail below input)
  const [confirmedCard, setConfirmedCard]     = useState<ScryfallCard | null>(null);
  // Card data shown while hovering a suggestion (preview image inside dropdown)
  const [previewCard, setPreviewCard]         = useState<ScryfallCard | null>(null);
  const cmdRef      = useRef<HTMLDivElement>(null);
  const hoverAbort  = useRef<AbortController | null>(null);

  const { suggestions, loading: cmdLoading, suggestionCards } = useCommanderSuggestions(cmdInput);

  // On mount, if a commander name is already set, preload its card data so the
  // confirmed thumbnail appears immediately without needing to re-select.
  useEffect(() => {
    if (selfPlayer.commanderName) {
      searchCardFuzzy(selfPlayer.commanderName).then(card => {
        if (card) setConfirmedCard(card);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync name back to parent after a short debounce
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNameChange = (val: string) => {
    setNameInput(val);
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(() => onUpdateSelf({ playerName: val.trim() || "Player" }), 400);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setPreviewCard(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /** Hover a suggestion → fetch card data and show preview image inside the dropdown. */
  const handleSuggestionHover = useCallback(async (name: string) => {
    hoverAbort.current?.abort();
    hoverAbort.current = new AbortController();
    const card = await searchCardFuzzy(name); // cached after first load
    if (card) setPreviewCard(card);
  }, []);

  /** Select a suggestion → commit name + fetch confirmed card art. */
  const handleSelectSuggestion = useCallback(async (name: string) => {
    setCmdInput(name);
    setShowSuggestions(false);
    setPreviewCard(null);
    onUpdateSelf({ commanderName: name });
    const card = await searchCardFuzzy(name);
    if (card) setConfirmedCard(card);
  }, [onUpdateSelf]);

  /** Clear the chosen commander. */
  const handleClearCommander = () => {
    setCmdInput("");
    setConfirmedCard(null);
    setPreviewCard(null);
    onUpdateSelf({ commanderName: "" });
  };

  const handleCmdBlur = () => {
    // Commit whatever is typed on blur (covers manual free-text entry)
    setTimeout(() => {
      const trimmed = cmdInput.trim();
      onUpdateSelf({ commanderName: trimmed });
      setShowSuggestions(false);
      setPreviewCard(null);
      // If they typed a name but didn't pick from the dropdown, try to load the card
      if (trimmed && !confirmedCard) {
        searchCardFuzzy(trimmed).then(card => { if (card) setConfirmedCard(card); });
      }
    }, 150); // slight delay so suggestion click fires first
  };

  const hasEnoughPlayers = allPlayers.length > 1;
  const allReady = hasEnoughPlayers && allPlayers.every(p => p.isReady);
  const readyCount = allPlayers.filter(p => p.isReady).length;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "16px",
      maxWidth: "560px", margin: "0 auto", padding: "8px 4px",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Users size={18} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>Game Lobby</span>
          <span style={{
            background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)",
            borderRadius: "20px", padding: "1px 9px", fontSize: "0.72rem",
            color: "var(--accent-cyan)", fontWeight: 700,
          }}>
            {allPlayers.length} {allPlayers.length === 1 ? "player" : "players"}
          </span>
        </div>
        {/* Room code pill */}
        <div style={{
          background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)",
          borderRadius: "8px", padding: "4px 12px", fontFamily: "monospace",
          fontSize: "1.1rem", fontWeight: 800, letterSpacing: "4px",
          color: "var(--accent-purple)",
        }}>
          {roomCode}
        </div>
      </div>

      {/* ── Your Setup ── */}
      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
          {isHost && <Crown size={13} color="#eab308" />}
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Your Setup {isHost && "· Host"}
          </span>
        </div>

        {/* Name */}
        <div>
          <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Display Name</label>
          <input
            type="text"
            value={nameInput}
            onChange={e => handleNameChange(e.target.value)}
            maxLength={20}
            placeholder="Your name"
            aria-label="Your display name in the lobby"
            style={{
              width: "100%", padding: "8px 10px", borderRadius: "8px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600,
              outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--accent-purple)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
        </div>

        {/* Color picker */}
        <div>
          <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Your Color</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {COLOR_OPTIONS.map(({ key, label, accent }) => {
              const isSelected = selfPlayer.colorName === key;
              const isTaken = allPlayers.some(p => p.deviceId !== selfPlayer.deviceId && p.colorName === key);
              return (
                <button
                  key={key}
                  onClick={() => !isTaken && onUpdateSelf({ colorName: key })}
                  aria-label={`Set your color to ${label}${isTaken ? " (taken)" : ""}`}
                  aria-pressed={isSelected}
                  disabled={isTaken && !isSelected}
                  title={isTaken && !isSelected ? `${label} is taken` : label}
                  style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: isSelected ? `${accent}30` : "rgba(255,255,255,0.04)",
                    border: `2.5px solid ${isSelected ? accent : isTaken ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.15)"}`,
                    cursor: isTaken && !isSelected ? "not-allowed" : "pointer",
                    opacity: isTaken && !isSelected ? 0.35 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isSelected ? `0 0 10px ${accent}60` : "none",
                    transition: "all 0.15s ease",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: accent }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Commander autocomplete */}
        <div ref={cmdRef} style={{ position: "relative" }}>
          <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
            Commander <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
          </label>

          {/* ── Confirmed selection — shows card art thumbnail ── */}
          {confirmedCard && !showSuggestions ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "10px",
              background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)",
            }}>
              {/* Card art thumbnail */}
              <img
                src={getCardImage(confirmedCard)}
                alt={confirmedCard.name}
                style={{
                  width: "48px", height: "34px", borderRadius: "5px",
                  objectFit: "cover", objectPosition: "center 15%",
                  flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              />
              {/* Name + type */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {confirmedCard.name}
                </p>
                {confirmedCard.type_line && (
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {confirmedCard.type_line}
                  </p>
                )}
              </div>
              {/* Clear button */}
              <button
                onClick={handleClearCommander}
                aria-label="Remove commander"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, display: "flex", padding: "2px" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            /* ── Text input + dropdown ── */
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={cmdInput}
                onChange={e => { setCmdInput(e.target.value); setShowSuggestions(true); if (!e.target.value) { setConfirmedCard(null); } }}
                onFocus={() => { if (cmdInput.length >= 2) setShowSuggestions(true); }}
                onBlur={handleCmdBlur}
                placeholder="e.g. Atraxa, Praetors' Voice"
                aria-label="Your commander's name"
                aria-autocomplete="list"
                style={{
                  width: "100%", padding: "8px 32px 8px 10px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--text-primary)", fontSize: "0.88rem",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = "var(--accent-purple)"}
                onBlurCapture={e => (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"}
              />
              {cmdLoading && (
                <Loader2 size={14} color="var(--text-muted)"
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />
              )}

              {/* ── Autocomplete dropdown with hover-preview ── */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  onMouseLeave={() => setPreviewCard(null)}
                  style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
                    background: "var(--bg-dark)", border: "1px solid var(--border-color)",
                    borderRadius: "10px", overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  }}
                >
                  {/* Suggestion list */}
                  {suggestions.map((name, i) => {
                    const thumb = suggestionCards.get(name);
                    return (
                      <button
                        key={i}
                        onMouseDown={() => handleSelectSuggestion(name)}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "rgba(139,92,246,0.12)";
                          handleSuggestionHover(name);
                        }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          width: "100%", padding: thumb ? "6px 12px" : "8px 12px",
                          background: "transparent", border: "none",
                          color: "var(--text-primary)", fontSize: "0.88rem", textAlign: "left",
                          cursor: "pointer", transition: "background 0.1s",
                          borderBottom: i < suggestions.length - 1 || previewCard
                            ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}
                      >
                        {thumb && (
                          <img
                            src={getCardImage(thumb)}
                            alt={name}
                            style={{ width: "32px", height: "44px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
                          />
                        )}
                        <span>{name}</span>
                      </button>
                    );
                  })}

                  {/* ── Card preview — appears when hovering a suggestion ── */}
                  {previewCard && (
                    <div style={{
                      display: "flex", gap: "10px", alignItems: "flex-start",
                      padding: "10px 12px",
                      background: "rgba(139,92,246,0.06)",
                      borderTop: "1px solid rgba(139,92,246,0.2)",
                    }}>
                      {/* Card image */}
                      <img
                        src={getCardImage(previewCard)}
                        alt={previewCard.name}
                        style={{
                          width: "68px", borderRadius: "7px",
                          flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                        }}
                      />
                      {/* Card text details */}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", marginBottom: "2px" }}>
                          {previewCard.name}
                        </p>
                        {previewCard.mana_cost && (
                          <p style={{ fontSize: "0.72rem", color: "var(--accent-gold)", marginBottom: "2px" }}>
                            {previewCard.mana_cost}
                          </p>
                        )}
                        {previewCard.type_line && (
                          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                            {previewCard.type_line}
                          </p>
                        )}
                        {(previewCard.oracle_text || previewCard.card_faces?.[0]?.oracle_text) && (
                          <p style={{
                            fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: 1.4,
                            display: "-webkit-box", WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical", overflow: "hidden",
                          }}>
                            {previewCard.oracle_text ?? previewCard.card_faces![0].oracle_text}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── From My Decks quick-picker ── */}
        {savedDecks.length > 0 && (
          <div>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>
              From My Decks
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {savedDecks.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => {
                    handleSelectSuggestion(deck.commanderName);
                    onUpdateSelf({ commanderName: deck.commanderName, deckId: deck.id });
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: "7px",
                    background: selfPlayer.deckId === deck.id ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.07)",
                    border: `1px solid ${selfPlayer.deckId === deck.id ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.2)"}`,
                    color: selfPlayer.deckId === deck.id ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(139,92,246,0.18)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = selfPlayer.deckId === deck.id ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.07)";
                    e.currentTarget.style.color = selfPlayer.deckId === deck.id ? "var(--text-primary)" : "var(--text-secondary)";
                  }}
                >
                  {deck.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ready toggle */}
        <button
          onClick={() => onUpdateSelf({ isReady: !selfPlayer.isReady })}
          aria-pressed={selfPlayer.isReady}
          aria-label={selfPlayer.isReady ? "Mark yourself as not ready" : "Mark yourself as ready"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "9px 16px", borderRadius: "10px", cursor: "pointer",
            background: selfPlayer.isReady ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${selfPlayer.isReady ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.1)"}`,
            color: selfPlayer.isReady ? "#10b981" : "var(--text-secondary)",
            fontSize: "0.88rem", fontWeight: 700,
            transition: "all 0.2s ease",
            boxShadow: selfPlayer.isReady ? "0 0 12px rgba(16,185,129,0.2)" : "none",
          }}
        >
          {selfPlayer.isReady
            ? <><Check size={16} /> Ready!</>
            : "Tap when ready"
          }
        </button>
      </div>

      {/* ── Players in Room ── */}
      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Players · {readyCount}/{allPlayers.length} Ready
        </span>
        {allPlayers.length === 0 && (
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0 }}>Waiting for players to join…</p>
        )}
        {/* Guide the host to share the room code when alone */}
        {isHost && allPlayers.length <= 1 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "8px",
            padding: "10px 12px", borderRadius: "8px",
            background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)",
            marginTop: "4px",
          }}>
            <span style={{ fontSize: "1rem", flexShrink: 0 }}>📋</span>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Share the code <strong style={{ color: "var(--accent-cyan)", letterSpacing: "2px" }}>{roomCode}</strong> with your players.
              They open the Life Counter tab, enter the code in the "Room code…" field, and tap <strong>Join</strong>.
            </p>
          </div>
        )}
        {allPlayers.map(p => {
          const colorAccent = COLOR_OPTIONS.find(c => c.key === p.colorName)?.accent ?? "#9ca3af";
          const isSelf = p.deviceId === selfPlayer.deviceId;
          return (
            <div key={p.deviceId} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "8px",
              background: isSelf ? "rgba(139,92,246,0.06)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${isSelf ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)"}`,
            }}>
              {/* Color dot */}
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: colorAccent, flexShrink: 0 }} />
              {/* Name + commander */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.playerName}
                  </span>
                  {p.isHost && <Crown size={12} color="#eab308" />}
                  {isSelf && <span style={{ fontSize: "0.65rem", color: "var(--accent-purple)", fontWeight: 700 }}>you</span>}
                </div>
                {p.commanderName && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ⚔️ {p.commanderName}
                  </div>
                )}
              </div>
              {/* Ready badge */}
              <div style={{
                width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                background: p.isReady ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${p.isReady ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.1)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {p.isReady && <Check size={12} color="#10b981" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Host: Start button ── */}
      {isHost && (
        <button
          onClick={onStart}
          disabled={!allReady}
          aria-label={allReady ? "Start the game — transition to turn order selection" : !hasEnoughPlayers ? "Waiting for other players to join" : `Waiting for ${allPlayers.length - readyCount} player${allPlayers.length - readyCount === 1 ? "" : "s"} to tap Ready`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "12px 20px", borderRadius: "12px", cursor: allReady ? "pointer" : "not-allowed",
            background: allReady
              ? "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(6,182,212,0.15))"
              : "rgba(255,255,255,0.04)",
            border: `1.5px solid ${allReady ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`,
            color: allReady ? "#fff" : "var(--text-muted)",
            fontSize: "0.95rem", fontWeight: 700,
            opacity: allReady ? 1 : 0.6,
            boxShadow: allReady ? "0 0 20px rgba(139,92,246,0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          {allReady
            ? <><ChevronRight size={18} /> All In — Start!</>
            : !hasEnoughPlayers
              ? "Waiting for players to join…"
              : `Waiting for ${allPlayers.length - readyCount} to tap Ready…`
          }
        </button>
      )}

      {/* ── Leave ── */}
      <button
        onClick={onLeave}
        aria-label="Leave the lobby and return to single-player mode"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", fontSize: "0.8rem",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
          padding: "4px 8px",
          transition: "color 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--accent-rose)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
      >
        <LogOut size={13} /> Leave Room
      </button>
    </div>
  );
};
