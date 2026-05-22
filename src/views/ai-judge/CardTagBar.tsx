import React from "react";
import { Search, X, Trash2 } from "lucide-react";
import { getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";

interface CardTagBarProps {
  taggedCards: ScryfallCard[];
  cardSearch: string;
  setCardSearch: (s: string) => void;
  suggestions: string[];
  cardLoading: boolean;
  onTagCard: (name: string) => void;
  onRemoveTag: (id: string) => void;
  onClearAll: () => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

export const CardTagBar: React.FC<CardTagBarProps> = ({
  taggedCards,
  cardSearch,
  setCardSearch,
  suggestions,
  cardLoading,
  onTagCard,
  onRemoveTag,
  onClearAll,
  dropdownRef,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Card search input + autocomplete dropdown */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", width: "100%" }}>
        <div style={{ flex: 1, position: "relative" }} ref={dropdownRef}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Search card name to tag context... (e.g. Sol Ring)"
              value={cardSearch}
              onChange={(e) => setCardSearch(e.target.value)}
              disabled={cardLoading}
              aria-label="Search for a card to add as context"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-haspopup="listbox"
              role="combobox"
              style={{ width: "100%", paddingLeft: "36px", fontSize: "16px" }}
            />
            <Search
              size={14}
              color="var(--text-muted)"
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
          </div>

          {/* Autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 4px)",
                left: 0,
                width: "100%",
                background: "var(--bg-dark)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.5)",
                maxHeight: "180px",
                overflowY: "auto",
                zIndex: 90,
              }}
              role="listbox"
            >
              {suggestions.map((name, i) => (
                <div
                  key={i}
                  role="option"
                  aria-selected={false}
                  tabIndex={0}
                  onClick={() => onTagCard(name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onTagCard(name);
                  }}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    transition: "all 0.15s ease",
                    borderBottom:
                      i < suggestions.length - 1
                        ? "1px solid rgba(255,255,255,0.03)"
                        : "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tagged card badges */}
      {taggedCards.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginRight: "4px",
            }}
          >
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
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
              <span>{card.name}</span>
              <button
                onClick={() => onRemoveTag(card.id)}
                aria-label={`Remove ${card.name} tag`}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 0,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--accent-rose)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--text-muted)")
                }
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
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(244, 63, 94, 0.2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(244, 63, 94, 0.1)")
            }
          >
            <Trash2 size={12} /> Clear All
          </button>
        </div>
      )}
    </div>
  );
};
