/**
 * PlayerProfileModal — combined player name editor + commander picker + art position/zoom.
 *
 * Always rendered at LifeCounter root level so it appears unrotated (portrait)
 * regardless of the PlayerCard's CSS rotation.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, Check, ZoomIn, ZoomOut, Move } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import { autocompleteCard, searchCardFuzzy, getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import type { Player } from "../../types/game";
import type { SavedDeck } from "../../types/deck";

// ── Commander autocomplete hook ───────────────────────────────────────────────

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
    if (query.length < 2) { setSuggestions([]); setSuggestionCards(new Map()); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      abortRef.current = new AbortController();
      const results = await autocompleteCard(query, abortRef.current.signal);
      const names = results.slice(0, 8);
      setSuggestions(names);
      setLoading(false);

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
        } catch { /* ignore */ }
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

interface PlayerProfileModalProps {
  player:           Player;
  savedDecks:       SavedDeck[];
  onRename:         (name: string) => void;
  onConfirm:        (commanderName: string, deckId?: string) => void;
  onClear:          () => void;
  onUpdateArt:      (x: number, y: number, zoom: number | undefined) => void;
  onClose:          () => void;
  onTogglePartner?: () => void;
  onSetPartner?:    (name: string) => void;
  onClearPartner?:  () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player, savedDecks, onRename, onConfirm, onClear, onUpdateArt, onClose,
  onTogglePartner, onSetPartner, onClearPartner,
}) => {
  // ── Player name ──────────────────────────────────────────────────────────
  const [localName, setLocalName] = useState(player.name);

  // ── Commander search ─────────────────────────────────────────────────────
  const [cmdInput, setCmdInput]               = useState(player.commanderName ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmedCard, setConfirmedCard]     = useState<ScryfallCard | null>(null);
  const [previewCard, setPreviewCard]         = useState<ScryfallCard | null>(null);
  const inputRef   = useRef<HTMLDivElement>(null);
  const hoverAbort = useRef<AbortController | null>(null);

  const { suggestions, loading: cmdLoading, suggestionCards } = useCommanderSuggestions(cmdInput);

  // ── Art adjustment ───────────────────────────────────────────────────────
  const [artUrl, setArtUrl]       = useState<string | null>(null);
  const [artX, setArtX]           = useState(player.artOffsetX ?? 50);
  const [artY, setArtY]           = useState(player.artOffsetY ?? 35);
  const [artZoom, setArtZoom]     = useState(player.artZoom ?? 100);
  const [artTouched, setArtTouched] = useState(
    player.artOffsetX != null || player.artOffsetY != null || player.artZoom != null
  );
  const previewRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart  = useRef({ cx: 0, cy: 0, sx: 0, sy: 0 });

  // Partner commander search
  const [partnerInput, setPartnerInput]             = useState(player.partnerCommanderName ?? "");
  const [partnerSuggestions, setPartnerSuggestions] = useState<string[]>([]);
  const [showPartnerSug, setShowPartnerSug]         = useState(false);
  const partnerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPartnerInputChange = (val: string) => {
    setPartnerInput(val);
    if (partnerDebounce.current) clearTimeout(partnerDebounce.current);
    if (val.length < 2) { setPartnerSuggestions([]); setShowPartnerSug(false); return; }
    partnerDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}&include_extras=false`);
        const json = await res.json();
        setPartnerSuggestions((json.data ?? []).slice(0, 6));
        setShowPartnerSug(true);
      } catch { /* ignore */ }
    }, 280);
  };

  const confirmPartner = (name: string) => {
    onSetPartner?.(name);
    setPartnerInput(name);
    setShowPartnerSug(false);
  };

  // Pre-load confirmed card if commander already set
  useEffect(() => {
    if (player.commanderName) {
      searchCardFuzzy(player.commanderName).then(card => {
        if (card) {
          setConfirmedCard(card);
          if (card.image_uris?.art_crop) setArtUrl(card.image_uris.art_crop);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When confirmedCard changes, update art URL
  useEffect(() => {
    if (confirmedCard?.image_uris?.art_crop) {
      setArtUrl(confirmedCard.image_uris.art_crop);
    } else {
      setArtUrl(null);
    }
  }, [confirmedCard]);

  // Close suggestions on outside click
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

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Art drag to reposition ───────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStart.current = { cx: e.clientX, cy: e.clientY, sx: artX, sy: artY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = -(e.clientX - dragStart.current.cx) / rect.width  * 100;
    const dy = -(e.clientY - dragStart.current.cy) / rect.height * 100;
    const newX = Math.max(0, Math.min(100, dragStart.current.sx + dx));
    const newY = Math.max(0, Math.min(100, dragStart.current.sy + dy));
    setArtX(newX);
    setArtY(newY);
    setArtTouched(true);
    onUpdateArt(newX, newY, artTouched ? artZoom : player.artZoom);
  }, [artX, artY, artZoom, artTouched, onUpdateArt, player.artZoom]);

  const handlePointerUp = () => { isDragging.current = false; };

  const handleZoom = (delta: number) => {
    const next = Math.max(50, Math.min(300, artZoom + delta));
    setArtZoom(next);
    setArtTouched(true);
    onUpdateArt(artX, artY, next);
  };

  const resetArt = () => {
    setArtX(50); setArtY(35); setArtZoom(100); setArtTouched(false);
    onUpdateArt(50, 35, undefined);
  };

  // ── Commander handlers ───────────────────────────────────────────────────
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
    // Save name + commander together
    if (localName !== player.name) onRename(localName);
    onConfirm(deck.commanderName, deck.id);
  }, [localName, player.name, onRename, onConfirm]);

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

  const handleClearCommander = () => {
    setCmdInput(""); setConfirmedCard(null); setPreviewCard(null);
    setArtUrl(null); setArtX(50); setArtY(35); setArtZoom(100); setArtTouched(false);
    onClear();
  };

  const handleConfirm = () => {
    const name = cmdInput.trim();
    if (localName !== player.name) onRename(localName);
    if (!name && !confirmedCard) { handleClearCommander(); onClose(); return; }
    if (!name) { onClose(); return; }
    if (artTouched) onUpdateArt(artX, artY, artZoom);
    onConfirm(name, undefined);
  };

  const handleClose = () => {
    if (localName !== player.name) onRename(localName);
    if (artTouched) onUpdateArt(artX, artY, artZoom);
    onClose();
  };

  // ── Art preview CSS ──────────────────────────────────────────────────────
  const artBgStyle: React.CSSProperties = artUrl ? {
    backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.82)), url(${artUrl})`,
    backgroundSize:  `auto, ${artZoom}% auto`,
    backgroundPosition: `center, ${artX}% ${artY}%`,
    backgroundRepeat: "no-repeat",
  } : {
    background: "rgba(255,255,255,0.04)",
  };

  return (
    <BottomSheet alwaysCentered={true} onClose={handleClose} zIndex={1000} maxWidth="420px" padding="20px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>Edit Player</p>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Player Name ── */}
        <div>
          <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Player Name
          </label>
          <input
            type="text"
            value={localName}
            autoFocus
            onChange={e => { setLocalName(e.target.value); onRename(e.target.value); }}
            placeholder="Player name"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: "9px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 700,
              outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--accent-purple)"}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"}
          />
        </div>

        {/* ── Commander ── */}
        <div ref={inputRef} style={{ position: "relative" }}>
          <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Commander
          </label>

          {confirmedCard && !showSuggestions ? (
            /* Confirmed card chip */
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "10px",
              background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 25%, transparent)",
            }}>
              <img
                src={getCardImage(confirmedCard)}
                alt={confirmedCard.name}
                style={{ width: "52px", height: "37px", borderRadius: "5px", objectFit: "cover", objectPosition: "center 15%", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
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
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            /* Search input */
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={cmdInput}
                onChange={e => { setCmdInput(e.target.value); setShowSuggestions(true); if (!e.target.value) setConfirmedCard(null); }}
                onFocus={e => { if (cmdInput.length >= 2) setShowSuggestions(true); (e.target as HTMLInputElement).style.borderColor = "var(--accent-purple)"; }}
                onBlur={e => { handleBlur(); (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
                placeholder="e.g. Atraxa, Praetors' Voice"
                aria-label="Commander name"
                style={{
                  width: "100%", padding: "9px 32px 9px 12px", borderRadius: "9px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--text-primary)", fontSize: "0.9rem", outline: "none", boxSizing: "border-box",
                }}
              />
              {cmdLoading && (
                <Loader2 size={14} color="var(--text-muted)"
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div
                  onMouseLeave={() => setPreviewCard(null)}
                  style={{
                    position: "relative", marginTop: "4px", zIndex: 40,
                    background: "var(--bg-dark)", border: "1px solid var(--border-color)",
                    borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {suggestions.map((name, i) => {
                    const thumb = suggestionCards.get(name);
                    return (
                      <button
                        key={i}
                        onMouseDown={() => handleSelectSuggestion(name)}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; handleSuggestionHover(name); }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          width: "100%", padding: thumb ? "6px 12px" : "8px 12px",
                          background: "transparent", border: "none",
                          color: "var(--text-primary)", fontSize: "0.88rem", textAlign: "left",
                          cursor: "pointer", transition: "background 0.1s",
                          borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}
                      >
                        {thumb && (
                          <img src={getCardImage(thumb)} alt={name} style={{ width: "32px", height: "44px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <span>{name}</span>
                      </button>
                    );
                  })}

                  {previewCard && (
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px", background: "color-mix(in srgb, var(--accent-purple) 6%, transparent)", borderTop: "1px solid color-mix(in srgb, var(--accent-purple) 20%, transparent)" }}>
                      <img src={getCardImage(previewCard)} alt={previewCard.name} style={{ width: "68px", borderRadius: "7px", flexShrink: 0, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", marginBottom: "2px" }}>{previewCard.name}</p>
                        {previewCard.mana_cost && <p style={{ fontSize: "0.72rem", color: "var(--accent-gold)", marginBottom: "2px" }}>{previewCard.mana_cost}</p>}
                        {previewCard.type_line && <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "4px" }}>{previewCard.type_line}</p>}
                        {(previewCard.oracle_text ?? previewCard.card_faces?.[0]?.oracle_text) && (
                          <p style={{ fontSize: "0.68rem", color: "var(--text-secondary)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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

        {/* ── Partner Commander (only once main commander is confirmed) ── */}
        {confirmedCard && onTogglePartner && (
          <div>
            <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Partner Commander
            </label>
            {!player.partnerMode ? (
              <button
                onClick={onTogglePartner}
                style={{
                  width: "100%", padding: "10px 12px",
                  background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", border: "1px dashed color-mix(in srgb, var(--accent-purple) 35%, transparent)",
                  borderRadius: "9px", color: "color-mix(in srgb, var(--accent-purple) 80%, white)", fontWeight: 600,
                  fontSize: "0.85rem", cursor: "pointer", textAlign: "left",
                }}
              >
                + Enable Partner Commander
              </button>
            ) : player.partnerCommanderName ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: "9px",
                background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
              }}>
                <div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "2px" }}>Partner</div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>{player.partnerCommanderName}</div>
                </div>
                <button onClick={() => { onClearPartner?.(); setPartnerInput(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  value={partnerInput}
                  onChange={e => onPartnerInputChange(e.target.value)}
                  onFocus={() => partnerInput.length >= 2 && setShowPartnerSug(true)}
                  onBlur={() => setTimeout(() => setShowPartnerSug(false), 150)}
                  placeholder="Search partner commander…"
                  style={{
                    width: "100%", padding: "9px 12px", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
                    borderRadius: "9px", color: "#fff", fontSize: "0.88rem", outline: "none",
                  }}
                />
                {showPartnerSug && partnerSuggestions.length > 0 && (
                  <div style={{
                    position: "relative", marginTop: "4px", zIndex: 40,
                    background: "var(--bg-dark)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
                    borderRadius: "10px", overflow: "hidden",
                  }}>
                    {partnerSuggestions.map(name => (
                      <button key={name} onMouseDown={() => confirmPartner(name)}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "10px 14px", background: "none", border: "none",
                          color: "var(--text-primary)", fontSize: "0.85rem", cursor: "pointer",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={onTogglePartner}
                  style={{ marginTop: "6px", background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer", padding: 0 }}>
                  Disable partner
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── From My Decks ── */}
        {savedDecks.length > 0 && (
          <div>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>
              From My Decks
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {savedDecks.map(deck => (
                <button key={deck.id} onClick={() => handleSelectDeck(deck)}
                  style={{ padding: "5px 11px", borderRadius: "8px", background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 25%, transparent)", color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--accent-purple) 18%, transparent)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--accent-purple) 8%, transparent)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  {deck.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Art Adjustment (only when art is loaded) ── */}
        {artUrl && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Card Art Position
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Move size={11} color="var(--text-muted)" />
                <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Drag to reposition</span>
                {artTouched && (
                  <button onClick={resetArt} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-purple)", fontSize: "0.62rem", fontWeight: 700, padding: "0 2px" }}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Draggable preview */}
            <div
              ref={previewRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                ...artBgStyle,
                width: "100%", height: "110px", borderRadius: "10px",
                border: "1.5px solid color-mix(in srgb, var(--accent-purple) 35%, transparent)",
                cursor: "grab", overflow: "hidden", position: "relative",
                userSelect: "none", WebkitUserSelect: "none",
              }}
            >
              {/* Player name overlay as preview of how card will look */}
              <div style={{
                position: "absolute", bottom: "10px", left: "12px",
                color: "#fff", fontSize: "0.85rem", fontWeight: 700,
                textShadow: "0 1px 6px rgba(0,0,0,0.9)", pointerEvents: "none",
              }}>
                {localName}
              </div>
            </div>

            {/* Zoom controls */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "8px" }}>
              <button
                onClick={() => handleZoom(-10)}
                disabled={artZoom <= 50}
                aria-label="Zoom out"
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px", padding: "7px 14px", cursor: artZoom <= 50 ? "default" : "pointer",
                  color: artZoom <= 50 ? "var(--text-muted)" : "#fff", display: "flex", alignItems: "center", gap: "4px",
                  fontSize: "0.78rem",
                }}
              >
                <ZoomOut size={14} /> −
              </button>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", minWidth: "40px", textAlign: "center" }}>
                {artZoom}%
              </span>
              <button
                onClick={() => handleZoom(10)}
                disabled={artZoom >= 300}
                aria-label="Zoom in"
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px", padding: "7px 14px", cursor: artZoom >= 300 ? "default" : "pointer",
                  color: artZoom >= 300 ? "var(--text-muted)" : "#fff", display: "flex", alignItems: "center", gap: "4px",
                  fontSize: "0.78rem",
                }}
              >
                <ZoomIn size={14} /> +
              </button>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "4px" }}>
          {(player.commanderName || cmdInput.trim()) && (
            <button
              onClick={handleClearCommander}
              style={{ padding: "8px 14px", borderRadius: "9px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.16)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
            >
              Clear Commander
            </button>
          )}
          <button
            onClick={handleConfirm}
            style={{
              padding: "8px 16px", borderRadius: "9px",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 30%, transparent), rgba(6,182,212,0.2))",
              border: "1px solid color-mix(in srgb, var(--accent-purple) 50%, transparent)",
              color: "#fff", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <Check size={14} /> Done
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
