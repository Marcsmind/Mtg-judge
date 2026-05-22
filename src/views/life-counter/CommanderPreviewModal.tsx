/**
 * CommanderPreviewModal — Read-only commander card preview.
 *
 * When `canEdit` is true (i.e. the viewing player owns this seat) an
 * "Edit Commander" button is shown so they can open the full editor.
 * When `canEdit` is false, only the Close button is rendered.
 */
import { useEffect, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { searchCardFuzzy, getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";

interface CommanderPreviewModalProps {
  commanderName: string;
  playerName:    string;
  canEdit:       boolean;
  onEdit:        () => void;
  onClose:       () => void;
}

export function CommanderPreviewModal({
  commanderName,
  playerName,
  canEdit,
  onEdit,
  onClose,
}: CommanderPreviewModalProps) {
  const [card, setCard]       = useState<ScryfallCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    searchCardFuzzy(commanderName).then((result) => {
      if (cancelled) return;
      setCard(result);
      setLoading(false);
      if (!result) setError(true);
    });
    return () => { cancelled = true; };
  }, [commanderName]);

  const imgSrc = card ? getCardImage(card) : null;

  return (
    <BottomSheet
      onClose={onClose}
      zIndex={150}
      maxWidth="380px"
      aria-label={`${playerName}'s commander: ${commanderName}`}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
          {playerName}'s Commander
        </div>
        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
          {commanderName}
        </div>
      </div>

      {/* Card art */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: "16px",
        minHeight: "200px",
        alignItems: "center",
      }}>
        {loading && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading card…</div>
        )}
        {!loading && error && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
            Card art not found.
          </div>
        )}
        {!loading && imgSrc && (
          <img
            src={imgSrc}
            alt={commanderName}
            style={{
              borderRadius: "10px",
              maxWidth: "240px",
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          />
        )}
      </div>

      {/* Type line + mana cost */}
      {card && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          padding: "8px 12px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "8px",
          gap: "8px",
        }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {card.type_line || "—"}
          </span>
          {card.mana_cost && (
            <span style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}>
              {card.mana_cost}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px", flexDirection: canEdit ? "column" : "row" }}>
        {canEdit && (
          <button
            onClick={() => { onClose(); setTimeout(onEdit, 50); }}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--accent-purple)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            ✏️ Edit Commander
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "12px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            color: "var(--text-secondary)",
            fontWeight: 500,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </BottomSheet>
  );
}
