import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { searchCardsWithImages, getCardImage } from "../services/scryfall";
import type { ScryfallCard } from "../services/scryfall";

interface CardSearchSheetProps {
  onClose: () => void;
  onTagCard: (name: string) => void;
}

export const CardSearchSheet: React.FC<CardSearchSheetProps> = ({ onClose, onTagCard }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-focus input when opened
  useEffect(() => {
    // Slight delay to allow BottomSheet animation to start before grabbing focus
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);

    // Debounce the search to prevent hitting rate limits
    const timer = setTimeout(async () => {
      const cards = await searchCardsWithImages(query, signal);
      if (!signal.aborted) {
        setResults(cards);
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (cardName: string) => {
    onTagCard(cardName);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} zIndex={400} maxWidth="500px">
      <div style={{ padding: "0 20px 20px 20px", display: "flex", flexDirection: "column", height: "60vh" }}>
        
        {/* Search Input Header */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <input
            ref={inputRef}
            type="text"
            className="glass-input"
            placeholder="Search card name... (e.g. Sol Ring)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: "40px", fontSize: "16px", height: "48px" }}
          />
          <Search
            size={18}
            color="var(--text-muted)"
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          />
        </div>

        {/* Results List */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
              <Loader2 className="spinner" size={24} color="var(--accent-purple)" />
            </div>
          )}

          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
              No cards found.
            </div>
          )}

          {!loading && results.map((card) => (
            <div
              key={card.id}
              onClick={() => handleSelect(card.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: "8px",
                cursor: "pointer",
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <img
                src={getCardImage(card)}
                alt={card.name}
                style={{
                  width: "48px",
                  height: "68px",
                  borderRadius: "4px",
                  objectFit: "cover",
                }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {card.name}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {card.type_line}
                </span>
              </div>
              {card.mana_cost && (
                <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                  {card.mana_cost}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
};
