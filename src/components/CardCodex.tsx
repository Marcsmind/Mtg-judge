import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Search, BookOpen, Layers, Clock, Tag, Library } from "lucide-react";
import {
  autocompleteCard,
  searchCardFuzzy,
  fetchCardRulings,
  getCardOracleText,
  getCardImage,
} from "../services/scryfall";
import type { ScryfallCard, ScryfallRuling } from "../services/scryfall";
import { useAppStore } from "../store/useAppStore";
import { useToast } from "./Toast";

interface CardCodexProps {
  isOpen: boolean;
  onClose: () => void;
  initialSearch?: string; // If set, auto-search this term on open
}

type TabId = "search" | "history";

export const CardCodex: React.FC<CardCodexProps> = ({
  isOpen,
  onClose,
  initialSearch,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [error, setError] = useState("");
  const [imageZoomed, setImageZoomed] = useState(false);

  const dropdownRef = useRef<HTMLFormElement>(null);
  // AbortController ref — cancels the previous autocomplete fetch when a new keystroke arrives
  const autocompleteAbortRef = useRef<AbortController | null>(null);

  // ── Zustand card history ──
  const cardHistory = useAppStore((s) => s.cardHistory);
  const addToCardHistory = useAppStore((s) => s.addToCardHistory);
  const setPendingTagCard = useAppStore((s) => s.setPendingTagCard);
  const setPendingAddToCollectionCard = useAppStore((s) => s.setPendingAddToCollectionCard);
  const { showToast } = useToast();

  // Track cards that were recently tagged — shows a brief "✓ Tagged" confirmation
  // without closing the panel so users can tag multiple cards in one session.
  const [recentlyTagged, setRecentlyTagged] = useState<Set<string>>(new Set());
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  // ── Handle card selection (search or history click) ──
  const handleSelectCard = useCallback(
    async (cardName: string) => {
      setQuery("");
      setSuggestions([]);
      setLoading(true);
      setError("");
      setSelectedCard(null);
      setRulings([]);
      setActiveTab("search"); // always show detail on search tab

      const card = await searchCardFuzzy(cardName);
      if (card) {
        // Show the card immediately — don't wait for rulings to arrive
        setSelectedCard(card);
        setLoading(false);
        addToCardHistory(card);
        // Rulings load in the background; card is already visible to the user.
        // fetchCardRulings now caches results in localStorage so repeat
        // lookups are instant.
        fetchCardRulings(card.id).then(list => setRulings(list));
      } else {
        setError("Card details not found. Please try another name.");
        setLoading(false);
      }
    },
    [addToCardHistory]
  );

  // Auto-search when opened from an external click (e.g. bold card name in AI chat)
  useEffect(() => {
    if (isOpen && initialSearch && initialSearch.trim().length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleSelectCard(initialSearch.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSearch]);

  // Reset zoom when the panel closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImageZoomed(false);
    }
  }, [isOpen]);

  // Close on Escape key — dismisses lightbox first, then the panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // imageZoomed is read from the ref snapshot in the closure;
        // use functional setter to read current value
        setImageZoomed(prev => {
          if (prev) return false; // dismiss lightbox first
          onClose();
          return false;
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Autocomplete debounce — 300ms + AbortController to cancel stale in-flight requests
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (query.trim().length >= 2) {
        // Cancel any previous in-flight autocomplete fetch
        autocompleteAbortRef.current?.abort();
        autocompleteAbortRef.current = new AbortController();
        const list = await autocompleteCard(query, autocompleteAbortRef.current.signal);
        setSuggestions(list);
      } else {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSearchSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (query.trim()) {
      handleSelectCard(query);
    }
  };

  // "Tag in Judge" — push card to AIJudge via pendingTagCard signal.
  // Intentionally does NOT close the panel so users can tag multiple cards
  // in one pass without reopening each time.
  const handleTagInJudge = (card: ScryfallCard) => {
    setPendingTagCard(card);
    setRecentlyTagged(prev => new Set(prev).add(card.id));
    setTimeout(() => {
      setRecentlyTagged(prev => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }, 2000);
  };

  // "Add to Collection" — push card to Collection via pendingAddToCollectionCard
  // signal (mirrors handleTagInJudge). Adds 1x non-foil to the default group;
  // quantity/foil/group can be adjusted afterward from the Collection view.
  const handleAddToCollection = (card: ScryfallCard) => {
    setPendingAddToCollectionCard(card);
    showToast(`${card.name} added to collection`, "success");
    setRecentlyAdded(prev => new Set(prev).add(card.id));
    setTimeout(() => {
      setRecentlyAdded(prev => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="card-codex-panel desktop-split-panel"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "100%",
        maxWidth: "100vw",
        height: "100vh",
        background: "rgba(10, 8, 16, 0.92)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderLeft: "none",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        padding: "24px",
        paddingTop: "calc(24px + env(safe-area-inset-top))",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <BookOpen size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Card Codex</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Card Codex"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border-color)",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--text-secondary)")
          }
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Tab bar: Search / History ── */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "16px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "3px",
        }}
      >
        {(["search", "history"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: "5px",
              border: "none",
              background:
                activeTab === tab ? "var(--accent-purple)" : "transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: activeTab === tab ? 700 : 500,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            {tab === "search" ? (
              <>
                <Search size={13} />
                Search
              </>
            ) : (
              <>
                <Clock size={13} />
                History
                {cardHistory.length > 0 && (
                  <span
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      borderRadius: "10px",
                      padding: "1px 6px",
                      fontSize: "0.7rem",
                    }}
                  >
                    {cardHistory.length}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* ── Search Input (always visible) ── */}
      <form
        onSubmit={handleSearchSubmit}
        style={{ position: "relative", marginBottom: "20px" }}
        ref={dropdownRef}
      >
        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="glass-input"
            placeholder="Search any card..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            aria-label="Search for a Magic card"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-haspopup="listbox"
            role="combobox"
            style={{ width: "100%", paddingRight: query ? "72px" : "40px" }}
          />
          {/* Clear button — visible when there's a query or a selected card */}
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setSuggestions([]); setSelectedCard(null); setRulings([]); setError(""); }}
              style={{
                position: "absolute", right: "40px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
                display: "flex", padding: "4px",
              }}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <Search size={18} />
          </button>
        </div>

        {/* Autocomplete Suggestions */}
        {suggestions.length > 0 && (
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              width: "100%",
              background: "var(--bg-dark)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
              maxHeight: "220px",
              overflowY: "auto",
              zIndex: 110,
            }}
          >
            {suggestions.map((name, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelectCard(name); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 14px", cursor: "pointer",
                  fontSize: "0.9rem", color: "var(--text-secondary)",
                  background: "transparent", border: "none",
                  borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* ── Main Panel Content ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ──────────── HISTORY TAB ──────────── */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {cardHistory.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  color: "var(--text-muted)",
                  padding: "40px",
                  textAlign: "center",
                }}
              >
                <Clock
                  size={40}
                  style={{ opacity: 0.3, marginBottom: "16px" }}
                />
                <p
                  style={{
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  No History Yet
                </p>
                <p style={{ fontSize: "0.8rem" }}>
                  Cards you search or tag will appear here for quick
                  re-access.
                </p>
              </div>
            ) : (
              cardHistory.map((card) => (
                <div
                  key={card.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.05)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.02)")
                  }
                >
                  {/* Art crop thumbnail */}
                  <img
                    src={getCardImage(card)}
                    alt={card.name}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "6px",
                      objectFit: "cover",
                      flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onClick={() => handleSelectCard(card.name)}
                  />

                  {/* Name + type line */}
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={() => handleSelectCard(card.name)}
                  >
                    <div
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {card.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {card.type_line}
                    </div>
                  </div>

                  {/* Tag in Judge button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagInJudge(card);
                    }}
                    title={recentlyTagged.has(card.id) ? "Tagged! Tag more cards or close when done." : "Tag this card in AI Judge"}
                    style={{
                      background: recentlyTagged.has(card.id) ? "rgba(16,185,129,0.15)" : "rgba(6,182,212,0.08)",
                      border: `1px solid ${recentlyTagged.has(card.id) ? "rgba(16,185,129,0.35)" : "rgba(6,182,212,0.2)"}`,
                      borderRadius: "7px",
                      padding: "5px 8px",
                      color: recentlyTagged.has(card.id) ? "var(--accent-emerald)" : "var(--accent-cyan)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      flexShrink: 0,
                      transition: "all 0.2s ease",
                      minWidth: "52px",
                      justifyContent: "center",
                    }}
                  >
                    {recentlyTagged.has(card.id) ? "✓ Tagged" : <><Tag size={11} />Tag</>}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ──────────── SEARCH TAB ──────────── */}
        {activeTab === "search" && (
          <>
            {loading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "30px",
                    height: "30px",
                    border: "3px solid rgba(255,255,255,0.1)",
                    borderTopColor: "var(--accent-purple)",
                    borderRadius: "50%",
                    animation: "spinner 0.8s linear infinite",
                  }}
                />
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                  }}
                >
                  Consulting libraries...
                </p>
                <style>{`
                  @keyframes spinner { to { transform: rotate(360deg); } }
                `}</style>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "8px",
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.2)",
                  color: "var(--accent-rose)",
                  fontSize: "0.9rem",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            {!selectedCard && !loading && !error && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  color: "var(--text-muted)",
                  padding: "40px",
                  textAlign: "center",
                }}
              >
                <Layers
                  size={48}
                  style={{ opacity: 0.3, marginBottom: "16px" }}
                />
                <p
                  style={{
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  Library Open
                </p>
                <p style={{ fontSize: "0.8rem" }}>
                  Search any Magic card to view high-resolution art, exact
                  oracle rule text, and official Gatherer rulings.
                </p>
              </div>
            )}

            {selectedCard && !loading && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "20px" }}
              >
                {/* Card Graphics & Metadata Split */}
                <div className="card-details-grid" style={{ minHeight: "260px" }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <img
                      src={getCardImage(selectedCard)}
                      alt={selectedCard.name}
                      onClick={() => setImageZoomed(true)}
                      title="Tap to zoom"
                      style={{
                        width: "100%",
                        maxWidth: "200px",
                        borderRadius: "12px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        objectFit: "contain",
                        border: "1px solid rgba(255,255,255,0.05)",
                        cursor: "zoom-in",
                        transition: "transform 0.15s ease",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.03)")}
                      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                        {selectedCard.name}
                      </h3>
                      <p
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: "0.85rem",
                          fontStyle: "italic",
                          marginTop: "2px",
                        }}
                      >
                        {selectedCard.type_line}
                      </p>
                    </div>

                    {selectedCard.mana_cost && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.9rem",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 500,
                          }}
                        >
                          Cost:
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {selectedCard.mana_cost}
                        </span>
                      </div>
                    )}

                    {/* Price row */}
                    {selectedCard.prices && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.82rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>💰</span>
                        {selectedCard.prices.usd ? (
                          <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>
                            ${selectedCard.prices.usd}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>N/A</span>
                        )}
                        {selectedCard.prices.usd_foil && (
                          <>
                            <span style={{ color: "var(--text-muted)" }}>|</span>
                            <span style={{ color: "var(--accent-emerald)", fontWeight: 600, opacity: 0.8 }}>
                              Foil: ${selectedCard.prices.usd_foil}
                            </span>
                          </>
                        )}
                        {selectedCard.prices.eur && (
                          <>
                            <span style={{ color: "var(--text-muted)" }}>|</span>
                            <span style={{ color: "var(--accent-emerald)", fontWeight: 600, opacity: 0.7 }}>
                              €{selectedCard.prices.eur}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        marginTop: "4px",
                      }}
                    >
                      {selectedCard.color_identity &&
                        selectedCard.color_identity.map((c) => (
                          <span
                            key={c}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              background:
                                c === "W"
                                  ? "var(--mtg-white)"
                                  : c === "U"
                                  ? "var(--mtg-blue)"
                                  : c === "B"
                                  ? "var(--mtg-black)"
                                  : c === "R"
                                  ? "var(--mtg-red)"
                                  : "var(--mtg-green)",
                              color:
                                c === "W" ? "var(--mtg-white-text)" : "#ffffff",
                              border: "1px solid rgba(255,255,255,0.1)",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      {(!selectedCard.color_identity ||
                        selectedCard.color_identity.length === 0) && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "20px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--text-secondary)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          C (Colorless)
                        </span>
                      )}
                    </div>

                    {/* Tag in AI Judge / Add to Collection — stay open after tapping */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                      <button
                        onClick={() => handleTagInJudge(selectedCard)}
                        title={recentlyTagged.has(selectedCard.id) ? "Tagged! You can tag more cards or close when done." : "Tag this card in AI Judge"}
                        style={{
                          background: recentlyTagged.has(selectedCard.id) ? "rgba(16,185,129,0.15)" : "rgba(6,182,212,0.08)",
                          border: `1px solid ${recentlyTagged.has(selectedCard.id) ? "rgba(16,185,129,0.35)" : "rgba(6,182,212,0.2)"}`,
                          borderRadius: "8px",
                          padding: "6px 12px",
                          color: recentlyTagged.has(selectedCard.id) ? "var(--accent-emerald)" : "var(--accent-cyan)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {recentlyTagged.has(selectedCard.id) ? (
                          <><Tag size={12} />✓ Tagged in Judge</>
                        ) : (
                          <><Tag size={12} />Tag in AI Judge</>
                        )}
                      </button>

                      <button
                        onClick={() => handleAddToCollection(selectedCard)}
                        title={recentlyAdded.has(selectedCard.id) ? "Added! You can add more cards or close when done." : "Add this card to your Collection"}
                        style={{
                          background: recentlyAdded.has(selectedCard.id) ? "rgba(16,185,129,0.15)" : "color-mix(in srgb, var(--accent-purple) 8%, transparent)",
                          border: `1px solid ${recentlyAdded.has(selectedCard.id) ? "rgba(16,185,129,0.35)" : "color-mix(in srgb, var(--accent-purple) 25%, transparent)"}`,
                          borderRadius: "8px",
                          padding: "6px 12px",
                          color: recentlyAdded.has(selectedCard.id) ? "var(--accent-emerald)" : "var(--accent-purple)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          transition: "all 0.2s ease",
                        }}
                      >
                        {recentlyAdded.has(selectedCard.id) ? (
                          <><Library size={12} />✓ Added</>
                        ) : (
                          <><Library size={12} />Add to Collection</>
                        )}
                      </button>
                    </div>

                    <a
                      href={selectedCard.scryfall_uri}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "var(--accent-cyan)",
                        fontSize: "0.8rem",
                        textDecoration: "none",
                        marginTop: "2px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.textDecoration = "underline")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.textDecoration = "none")
                      }
                    >
                      View on Scryfall &rarr;
                    </a>
                  </div>
                </div>

                {/* Oracle Rule Text */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    padding: "16px",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "0.95rem",
                      color: "var(--accent-purple)",
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Oracle Rule Text
                  </h4>
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                    }}
                  >
                    {getCardOracleText(selectedCard)}
                  </p>
                </div>

                {/* Official Rulings */}
                <div>
                  <h4
                    style={{
                      fontSize: "0.95rem",
                      color: "var(--accent-cyan)",
                      marginBottom: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Official Rulings ({rulings.length})
                  </h4>
                  {rulings.length === 0 ? (
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      No official Gatherer rulings found for this card.
                      Standard MTG comprehensive rules apply.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {rulings.map((r, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            background: "rgba(255, 255, 255, 0.01)",
                            border: "1px solid rgba(255, 255, 255, 0.03)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                fontWeight: 500,
                              }}
                            >
                              Published: {r.published_at}
                            </span>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: "var(--accent-purple)",
                                fontWeight: 600,
                                textTransform: "uppercase",
                              }}
                            >
                              {r.source}
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: "0.85rem",
                              color: "var(--text-secondary)",
                              lineHeight: 1.4,
                            }}
                          >
                            {r.comment}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>



      {/* ── Card art lightbox overlay ── */}
      {imageZoomed && selectedCard && (
        <div
          onClick={() => setImageZoomed(false)}
          role="dialog"
          aria-label={`Full-size view of ${selectedCard.name}`}
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={getCardImage(selectedCard)}
            alt={selectedCard.name}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "94vw", maxHeight: "94vh",
              borderRadius: "16px", objectFit: "contain",
              boxShadow: "0 20px 80px rgba(0,0,0,0.8)",
              cursor: "default",
            }}
          />
        </div>
      )}
    </div>
  );
};
