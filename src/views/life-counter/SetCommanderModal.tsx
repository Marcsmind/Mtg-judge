/**
 * SetCommanderModal — modal for setting (or changing) a player's commander
 * during a live game, with Scryfall autocomplete and "From My Decks" shortcut.
 *
 * Replaces the old read-only art popup in PlayerCard; card art is shown via
 * the confirmed-card thumbnail inside this modal.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, Check } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import {
  autocompleteCard,
  searchCardFuzzy,
  getCardImage,
} from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import type { SavedDeck } from "../../types/deck";

// ── Commander autocomplete hook (same pattern as LobbyPanel) ─────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface SetCommanderModalProps {
  playerId: number;
  playerName: string;
  currentCommanderName?: string;
  savedDecks: SavedDeck[];
  onConfirm: (commanderName: string, deckId?: string) => void;
  onClear: () => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SetCommanderModal: React.FC<SetCommanderModalProps> = ({
  playerName,
  currentCommanderName,
  savedDecks,
  onConfirm,
  onClear,
  onClose,
}) => {
  const [cmdInput, setCmdInput]               = useState(currentCommanderName ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmedCard, setConfirmedCard]     = useState<ScryfallCard | null>(null);
  const [previewCard, setPreviewCard]         = useState<ScryfallCard | null>(null);
  const inputRef  = useRef<HTMLDivElement>(null);
  const hoverAbort = useRef<AbortController | null>(null);

  const { suggestions, loading: cmdLoading, suggestionCards } = useCommanderSuggestions(cmdInput);

  // Pre-load card data if a commander is already set
  useEffect(() => {
    if (currentCommanderName) {
      searchCardFuzzy(currentCommanderName).then(card => {
        if (card) setConfirmedCard(card);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setPreviewCard(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSuggestionHover = useCallback(async (name: string) => {
    hoverAbort.current?.abort();
    hoverAbort.current = new AbortController();
    const card = await searchCardFuzzy(name);
    if (card) setPreviewCard(card);
  }, []);

  const handleSelectSuggestion = useCallback(async (name: string) => {
    setCmdInput(name);
    setShowSuggestions(false);
    setPreviewCard(null);
    const card = await searchCardFuzzy(name);
    if (card) setConfirmedCard(card);
  }, []);

  const handleSelectDeck = useCallback(async (deck: SavedDeck) => {
    setCmdInput(deck.commanderName);
    setShowSuggestions(false);
    setPreviewCard(null);
    const card = await searchCardFuzzy(deck.commanderName);
    if (card) setConfirmedCard(card);
    onConfirm(deck.commanderName, deck.id);
  }, [onConfirm]);

  const handleClear = () => {
    setCmdInput("");
    setConfirmedCard(null);
    setPreviewCard(null);
    onClear();
  };

  const handleConfirm = () => {
    const name = cmdInput.trim();
    if (!name) { handleClear(); return; }
    onConfirm(name, undefined);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setPreviewCard(null);
      const trimmed = cmdInput.trim();
      if (trimmed && !confirmedCard) {
        searchCardFuzzy(trimmed).then(card => { if (card) setConfirmedCard(card); });
      }
    }, 150);
  };

  return (
    <BottomSheet alwaysCentered={true} onClose={onClose} zIndex={1000} maxWidth="420px" padding="20px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700 }}>
              Set Commander
            </p>
            <p style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {playerName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: "4px" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Commander autocomplete ── */}
        <div ref={inputRef} style={{ position: "relative" }}>
          <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 700 }}>
            Commander Name
          </label>

          {/* Confirmed card thumbnail */}
          {confirmedCard && !showSuggestions ? (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "10px",
              background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)",
            }}>
              <img
                src={getCardImage(confirmedCard)}
                alt={confirmedCard.name}
                style={{
                  width: "52px", height: "37px", borderRadius: "5px",
                  objectFit: "cover", objectPosition: "center 15%",
                  flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              />
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
              <button
                onClick={() => { setConfirmedCard(null); setCmdInput(""); setShowSuggestions(true); }}
                aria-label="Change commander"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            /* Text input */
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={cmdInput}
                autoFocus
                onChange={e => {
                  setCmdInput(e.target.value);
                  setShowSuggestions(true);
                  if (!e.target.value) setConfirmedCard(null);
                }}
                onFocus={() => { if (cmdInput.length >= 2) setShowSuggestions(true); }}
                onBlur={handleBlur}
                placeholder="e.g. Atraxa, Praetors' Voice"
                aria-label="Commander name"
                aria-autocomplete="list"
                style={{
                  width: "100%", padding: "9px 32px 9px 12px", borderRadius: "9px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--text-primary)", fontSize: "0.9rem",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = "var(--accent-purple)"}
                onBlurCapture={e => (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"}
              />
              {cmdLoading && (
                <Loader2 size={14} color="var(--text-muted)"
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />
              )}

              {/* Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  onMouseLeave={() => setPreviewCard(null)}
                  style={{
                    position: "relative", marginTop: "4px", zIndex: 40,
                    background: "var(--bg-dark)", border: "1px solid var(--border-color)",
                    borderRadius: "10px", overflow: "hidden",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
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

                  {/* Hover preview */}
                  {previewCard && (
                    <div style={{
                      display: "flex", gap: "10px", alignItems: "flex-start",
                      padding: "10px 12px",
                      background: "rgba(139,92,246,0.06)",
                      borderTop: "1px solid rgba(139,92,246,0.2)",
                    }}>
                      <img
                        src={getCardImage(previewCard)}
                        alt={previewCard.name}
                        style={{ width: "68px", borderRadius: "7px", flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", marginBottom: "2px" }}>
                          {previewCard.name}
                        </p>
                        {previewCard.mana_cost && (
                          <p style={{ fontSize: "0.72rem", color: "var(--accent-gold)", marginBottom: "2px" }}>{previewCard.mana_cost}</p>
                        )}
                        {previewCard.type_line && (
                          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>{previewCard.type_line}</p>
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

        {/* ── From My Decks ── */}
        {savedDecks.length > 0 && (
          <div>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>
              From My Decks
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {savedDecks.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => handleSelectDeck(deck)}
                  style={{
                    padding: "5px 11px", borderRadius: "8px",
                    background: "rgba(139,92,246,0.08)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(139,92,246,0.18)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(139,92,246,0.08)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {deck.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "4px" }}>
          {(currentCommanderName || cmdInput.trim()) && (
            <button
              onClick={handleClear}
              style={{
                padding: "8px 14px", borderRadius: "9px",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                color: "#ef4444", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.16)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: "9px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-secondary)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!cmdInput.trim() && !confirmedCard}
            style={{
              padding: "8px 16px", borderRadius: "9px",
              background: cmdInput.trim() || confirmedCard
                ? "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(6,182,212,0.2))"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${cmdInput.trim() || confirmedCard ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`,
              color: cmdInput.trim() || confirmedCard ? "#fff" : "var(--text-muted)",
              fontSize: "0.82rem", fontWeight: 700, cursor: cmdInput.trim() || confirmedCard ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: "5px",
              transition: "all 0.15s ease",
            }}
          >
            <Check size={14} /> Confirm
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
