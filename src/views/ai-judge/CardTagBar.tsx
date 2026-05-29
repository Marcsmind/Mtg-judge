import React, { useState, useEffect, useRef } from "react";
import { Search, X, Trash2, Loader2 } from "lucide-react";
import { getCardImage, autocompleteCard } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";

interface CardTagBarProps {
  taggedCards: ScryfallCard[];
  cardLoading: boolean;
  onTagCard: (name: string) => void;
  onRemoveTag: (id: string) => void;
  onClearAll: () => void;
}

export const CardTagBar: React.FC<CardTagBarProps> = ({
  taggedCards,
  cardLoading,
  onTagCard,
  onRemoveTag,
  onClearAll,
}) => {
  const [query, setQuery] = useState("");
  const [autocompleteNames, setAutocompleteNames] = useState<string[]>([]);
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced Scryfall search — text names first, then image cards
  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutocompleteNames([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setSearching(true);
    setAutocompleteNames([]);
    setResults([]);

    const timer = setTimeout(async () => {
      try {
        const names = await autocompleteCard(query, signal);
        if (signal.aborted) return;
        setAutocompleteNames(names);

        if (!names || names.length === 0) {
          setSearching(false);
          return;
        }

        const topNames = names.slice(0, 10);
        const exactQuery = topNames.map((n) => `!"${n}"`).join(" or ");
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(exactQuery)}`,
          { signal }
        );

        if (!res.ok) {
          if (!signal.aborted) setSearching(false);
          return;
        }

        const data = await res.json();
        const cards: ScryfallCard[] = data.data || [];
        const sorted = cards.sort(
          (a, b) => topNames.indexOf(a.name) - topNames.indexOf(b.name)
        );

        if (!signal.aborted) {
          setResults(sorted);
          setSearching(false);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!signal.aborted) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown when tapping outside the container
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  const handleSelect = (name: string) => {
    onTagCard(name);
    setQuery("");
    setAutocompleteNames([]);
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Search input — real, focusable, inline */}
      <div ref={containerRef} style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          className="glass-input"
          placeholder="Search card to tag… (e.g. Sol Ring)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ width: "100%", paddingLeft: "36px", paddingRight: "36px", fontSize: "16px" }}
        />
        <Search
          size={14}
          color="var(--text-muted)"
          style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
        {/* Right icon: spinner while loading, clear button when there's text */}
        {cardLoading || (searching && query.length >= 2) ? (
          <Loader2
            size={14}
            className="spinner"
            color="var(--accent-purple)"
            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
        ) : query.length > 0 ? (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // keep input focused
              setQuery("");
              setAutocompleteNames([]);
              setResults([]);
            }}
            style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
          >
            <X size={14} />
          </button>
        ) : null}

        {/* Inline dropdown */}
        {showDropdown && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "rgba(10, 8, 20, 0.97)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              zIndex: 200,
              maxHeight: "256px",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              padding: "4px",
            }}
          >
            {/* Spinner while autocomplete names haven't arrived yet */}
            {searching && autocompleteNames.length === 0 && (
              <div style={{ display: "flex", justifyContent: "center", padding: "18px" }}>
                <Loader2 className="spinner" size={20} color="var(--accent-purple)" />
              </div>
            )}

            {/* No results message */}
            {!searching && autocompleteNames.length === 0 && results.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "16px", fontSize: "0.85rem" }}>
                No cards found.
              </div>
            )}

            {/* Text-only names — shown immediately while image cards load in the background */}
            {results.length === 0 &&
              autocompleteNames.map((name, i) => (
                <button
                  key={`t-${i}`}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 12px",
                    background: "none",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--text-primary)",
                    fontSize: "0.9rem",
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {name}
                  {searching && i === 0 && (
                    <Loader2 size={12} className="spinner" color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  )}
                </button>
              ))}

            {/* Image cards once background fetch resolves */}
            {results.length > 0 &&
              results.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(card.name); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "8px 10px",
                    background: "none",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "Outfit, sans-serif",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <img
                    src={getCardImage(card)}
                    alt={card.name}
                    style={{ width: "40px", height: "56px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {card.name}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {card.type_line}
                    </div>
                  </div>
                  {card.mana_cost && (
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", flexShrink: 0 }}>
                      {card.mana_cost}
                    </span>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Tagged card badges */}
      {taggedCards.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500, marginRight: "4px" }}>
            Tagged Cards ({taggedCards.length}/5):
          </span>

          {taggedCards.map((card) => (
            <div
              key={card.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(139, 92, 246, 0.1)",
                border: "1px solid rgba(139, 92, 246, 0.25)",
                padding: "4px 10px",
                borderRadius: "20px",
                fontSize: "0.8rem",
                color: "#ffffff",
              }}
            >
              <img
                src={getCardImage(card)}
                alt=""
                style={{ width: "16px", height: "16px", borderRadius: "50%", objectFit: "cover" }}
              />
              <span>{card.name}</span>
              <button
                onClick={() => onRemoveTag(card.id)}
                aria-label={`Remove ${card.name} tag`}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-rose)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={onClearAll}
            style={{
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              color: "var(--accent-rose)",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginLeft: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(244, 63, 94, 0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)")}
          >
            <Trash2 size={12} /> Clear All
          </button>
        </div>
      )}
    </div>
  );
};
