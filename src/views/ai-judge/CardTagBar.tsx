import React, { useState } from "react";
import { Search, X, Trash2 } from "lucide-react";
import { getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import { CardSearchSheet } from "../../components/CardSearchSheet";

interface CardTagBarProps {
  taggedCards: ScryfallCard[];
  cardSearch: string; // Deprecated by CardSearchSheet but kept for compat
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
  onTagCard,
  onRemoveTag,
  onClearAll,
}) => {
  const [showSearchSheet, setShowSearchSheet] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Search Input trigger - opens the Bottom Sheet */}
      <div 
        onClick={() => setShowSearchSheet(true)}
        style={{ cursor: "text", position: "relative" }}
      >
        <input
          type="text"
          className="glass-input"
          placeholder="Search card name to tag context... (e.g. Sol Ring)"
          readOnly
          style={{ width: "100%", paddingLeft: "36px", fontSize: "16px", pointerEvents: "none" }}
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

      {showSearchSheet && (
        <CardSearchSheet
          onClose={() => setShowSearchSheet(false)}
          onTagCard={onTagCard}
        />
      )}

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
