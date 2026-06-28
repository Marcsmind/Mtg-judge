import React, { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Copy, Check, Bookmark, BookmarkCheck, RotateCcw, X, Flag } from "lucide-react";
import { MTG_KEYWORDS } from "../../constants/mtgKeywords";
import { searchCardFuzzy } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";

interface Message {
  role: "user" | "model";
  content: string;
  taggedCards?: ScryfallCard[];
}

interface ChatMessageProps {
  message: Message;
  onOpenCodex: (term: string) => void;
  onGoToSettings?: () => void;
  onBookmark?: () => void;
  isBookmarked?: boolean;
  onReprompt?: (content: string, taggedCards?: ScryfallCard[]) => void;
  onFlag?: (responseText: string, reason: string) => void;
}

// ── Confidence badge colours ──────────────────────────────────────────────────
const CONFIDENCE_STYLES = {
  High:   { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.35)", text: "#10b981", dot: "🟢" },
  Medium: { bg: "rgba(234,179,8,0.1)",   border: "rgba(234,179,8,0.35)",  text: "#eab308", dot: "🟡" },
  Low:    { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.35)",  text: "#ef4444", dot: "🔴" },
} as const;

/** Split out the trailing `**Judge Confidence: ...` line if present */
function parseConfidence(content: string): {
  body: string;
  level: keyof typeof CONFIDENCE_STYLES | null;
  note: string;
} {
  const re = /\*\*Judge Confidence:\s*(High|Medium|Low)\*\*\s*[—–-]\s*(.+)$/im;
  const m = content.match(re);
  if (!m) return { body: content, level: null, note: "" };
  return {
    body: content.slice(0, m.index).trimEnd(),
    level: m[1] as keyof typeof CONFIDENCE_STYLES,
    note:  m[2].trim(),
  };
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onOpenCodex,
  onGoToSettings,
  onBookmark,
  isBookmarked = false,
  onReprompt,
  onFlag,
}) => {
  const isUser = message.role === "user";

  // Pre-parse confidence once per message
  const { body: messageBody, level: confidenceLevel, note: confidenceNote } =
    React.useMemo(() => parseConfidence(message.content), [message.content]);

  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState("Inaccurate ruling");

  const handleBookmarkClick = useCallback(() => {
    if (isBookmarked || !onBookmark) return;
    onBookmark();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }, [isBookmarked, onBookmark]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message.content]);

  // ── Keyword tooltip state — local to each message bubble ──
  const [tooltip, setTooltip] = useState<{
    term: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // ── Card preview state ──
  const [cardPreview, setCardPreview] = useState<{
    name: string;
    cardObj: ScryfallCard | null;
    loading: boolean;
    x: number;
    y: number;
  } | null>(null);

  const fetchCardPreview = useCallback(async (name: string, x: number, y: number) => {
    setCardPreview({ name, cardObj: null, loading: true, x, y });
    try {
      const card = await searchCardFuzzy(name);
      setCardPreview(prev => (prev?.name === name ? { ...prev, cardObj: card, loading: false } : prev));
    } catch {
      setCardPreview(prev => (prev?.name === name ? { ...prev, loading: false } : prev));
    }
  }, []);

  // ── react-markdown component overrides ─────────────────────────────────────
  // IMPORTANT: wrapped in useMemo so the `strong` function reference is stable
  // across renders.  Without this, react-markdown sees a new component type on
  // every render of AIJudge (e.g. on autocomplete keystrokes), unmounts and
  // remounts every <strong> element, and click events fired during that window
  // are swallowed — the card-name-to-Codex click regression.
  const markdownComponents = useMemo((): Components => ({
    // Override <strong> (produced by **text**) to handle four cases:
    //   1. "settings"      → link that opens the Settings panel
    //   2. brand/UI terms  → styled bold, no interaction
    //   3. MTG keyword     → tap/hover tooltip with a definition
    //   4. anything else   → treated as a card name; opens Card Codex
    strong: ({ children }) => {
      const extractText = (node: React.ReactNode): string => {
        if (typeof node === "string") return node;
        if (typeof node === "number") return String(node);
        if (Array.isArray(node)) return node.map(extractText).join("");
        if (React.isValidElement(node)) {
          const el = node as React.ReactElement<{ children?: React.ReactNode }>;
          return extractText(el.props.children);
        }
        return "";
      };
      const text = extractText(children);
      const lower = text.toLowerCase();

      // 1. Settings link
      if (lower === "settings" && onGoToSettings) {
        return (
          <strong
            onClick={onGoToSettings}
            style={{
              color: "var(--accent-purple)",
              cursor: "pointer",
              textDecoration: "underline",
              fontWeight: 700,
            }}
            title="Open Settings"
          >
            {text}
          </strong>
        );
      }

      // 2. Brand/UI terms — styled but not interactive (not real card names)
      if (lower === "arbiter") {
        return (
          <strong style={{ color: "var(--accent-purple)", fontWeight: 700, cursor: "default" }}>
            {text}
          </strong>
        );
      }

      // 3. MTG keyword → tap-or-hover tooltip with definition
      const keywordDef = MTG_KEYWORDS[lower];
      if (keywordDef) {
        const showTooltip = (e: React.MouseEvent) => {
          const rect = e.currentTarget.getBoundingClientRect();
          // Prefer above the tapped text to avoid overlapping the bottom search/input UI
          const y = rect.top >= 150 ? rect.top - 150 : rect.bottom + 8;
          setTooltip({ term: text, text: keywordDef, x: rect.left, y });
        };
        return (
          <strong
            style={{
              color: "#a78bfa",
              cursor: "help",
              borderBottom: "1px dashed rgba(167,139,250,0.5)",
              fontWeight: 700,
            }}
            title={keywordDef}
            onClick={(e) => {
              if (tooltip?.term === lower) {
                setTooltip(null);
              } else {
                showTooltip(e);
              }
            }}
            onMouseEnter={showTooltip}
            onMouseLeave={() => setTooltip(null)}
          >
            {text}
          </strong>
        );
      }

      // 4. Card name → click to open floating preview
      return (
        <strong
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            fetchCardPreview(text, rect.left, rect.top - 10);
          }}
          style={{
            color: "var(--accent-cyan)",
            cursor: "pointer",
            borderBottom: "1px solid rgba(6,182,212,0.4)",
            fontWeight: 700,
            transition: "color 0.15s ease",
          }}
          title={`Click to preview "${text}"`}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#67e8f9")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--accent-cyan)")
          }
        >
          {text}
        </strong>
      );
    },
  }), [onOpenCodex, onGoToSettings, fetchCardPreview, tooltip]);

  return (
    <>
      {/* Keyword tooltip portal (fixed-positioned, stays within the viewport) */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(Math.max(8, tooltip.x), window.innerWidth - 320),
            top: Math.max(8, tooltip.y),
            zIndex: 9999,
            maxWidth: "300px",
            background: "rgba(16, 12, 28, 0.98)",
            border: "1px solid rgba(167,139,250,0.35)",
            borderRadius: "10px",
            padding: "10px 14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "#a78bfa",
              marginBottom: "5px",
              textTransform: "capitalize",
            }}
          >
            {tooltip.term}
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {tooltip.text}
          </div>
        </div>
      )}

      {/* Card Preview tooltip portal */}
      {cardPreview && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={() => setCardPreview(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              background: "rgba(16, 12, 28, 0.95)",
              border: "1px solid var(--border-color)",
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              maxWidth: "320px",
              width: "90%",
              animation: "popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            <style>{`
              @keyframes popIn {
                from { opacity: 0; transform: scale(0.95) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-primary)" }}>{cardPreview.name}</h3>
              <button
                onClick={() => setCardPreview(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "center", minHeight: "200px", alignItems: "center" }}>
              {cardPreview.loading ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "8px" }}>
                  <RotateCcw size={14} style={{ animation: "spin 1s linear infinite" }} /> Fetching card...
                </div>
              ) : cardPreview.cardObj ? (
                <img
                  src={cardPreview.cardObj.image_uris?.normal || cardPreview.cardObj.card_faces?.[0]?.image_uris?.normal}
                  alt={cardPreview.name}
                  style={{ width: "100%", maxWidth: "240px", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
                />
              ) : (
                <div style={{ color: "var(--accent-rose)", fontSize: "0.85rem" }}>Card not found.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                onClick={() => {
                  onOpenCodex(cardPreview.cardObj?.name || cardPreview.name);
                  setCardPreview(null);
                }}
                className="glass-button"
                style={{ flex: 1, padding: "10px", background: "var(--accent-cyan)", color: "#000", fontWeight: 700, border: "none" }}
              >
                Open in Codex
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Message bubble */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
          width: "100%",
        }}
      >
        <div
          style={{
            maxWidth: "85%",
            padding: "16px 20px",
            borderRadius: "14px",
            borderTopRightRadius: isUser ? "2px" : "14px",
            borderTopLeftRadius: isUser ? "14px" : "2px",
            background: isUser
              ? "rgba(139, 92, 246, 0.12)"
              : "rgba(255, 255, 255, 0.02)",
            border: isUser
              ? "1px solid rgba(139, 92, 246, 0.2)"
              : "1px solid rgba(255, 255, 255, 0.05)",
            color: "var(--text-primary)",
            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.15)",
            lineHeight: 1.6,
            fontSize: "0.95rem",
          }}
        >
          {/* Action buttons — only on AI responses */}
          {!isUser && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginBottom: "6px" }}>
              {/* Bookmark / Save ruling */}
              {onBookmark && (
                <button
                  onClick={handleBookmarkClick}
                  aria-label={isBookmarked ? "Ruling saved" : justSaved ? "Saved!" : "Save ruling"}
                  title={isBookmarked ? "Already saved to favorites" : "Save ruling to favorites"}
                  style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    background: (isBookmarked || justSaved) ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${(isBookmarked || justSaved) ? "rgba(234,179,8,0.35)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: "7px", padding: "4px 10px",
                    color: (isBookmarked || justSaved) ? "var(--accent-gold)" : "var(--text-muted)",
                    cursor: isBookmarked ? "default" : "pointer",
                    fontSize: "0.72rem", fontWeight: 500,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    if (!isBookmarked && !justSaved) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isBookmarked && !justSaved) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }
                  }}
                >
                  {(isBookmarked || justSaved) ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
                  {justSaved ? "Saved!" : isBookmarked ? "Saved" : "Save"}
                </button>
              )}
              {/* Copy */}
              <button
                onClick={handleCopy}
                aria-label={copied ? "Copied!" : "Copy ruling"}
                title={copied ? "Copied!" : "Copy ruling to clipboard"}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  background: copied ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "7px", padding: "4px 10px",
                  color: copied ? "var(--accent-emerald)" : "var(--text-muted)",
                  cursor: "pointer", fontSize: "0.72rem", fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => {
                  if (!copied) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
                onMouseLeave={e => {
                  if (!copied) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied!" : "Copy"}
              </button>
              {/* Flag inaccurate / problematic response — required by App Store UGC/AI policy */}
              {flagged ? (
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", color: "var(--accent-rose)", padding: "4px 10px" }}>
                  <Flag size={11} /> Flagged
                </span>
              ) : flagging ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <select
                    value={flagReason}
                    onChange={e => setFlagReason(e.target.value)}
                    style={{
                      background: "rgba(10,8,20,0.9)", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "6px", color: "var(--text-secondary)", fontSize: "0.72rem",
                      padding: "3px 6px", cursor: "pointer",
                    }}
                  >
                    <option>Inaccurate ruling</option>
                    <option>Inappropriate content</option>
                    <option>Other</option>
                  </select>
                  <button
                    onClick={() => { setFlagged(true); setFlagging(false); onFlag?.(message.content, flagReason); }}
                    style={{ background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.35)", borderRadius: "6px", padding: "3px 8px", color: "var(--accent-rose)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setFlagging(false)}
                    style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "3px 8px", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setFlagging(true)}
                  aria-label="Flag this response"
                  title="Flag as inaccurate or problematic"
                  style={{
                    display: "flex", alignItems: "center", gap: "5px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "7px", padding: "4px 10px",
                    color: "var(--text-muted)", cursor: "pointer",
                    fontSize: "0.72rem", fontWeight: 500, transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  <Flag size={11} /> Flag
                </button>
              )}
            </div>
          )}

          <div className="chat-markdown">
            <ReactMarkdown components={markdownComponents}>
              {isUser ? message.content : messageBody}
            </ReactMarkdown>
          </div>

          {/* Re-use button — only on user messages */}
          {isUser && onReprompt && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
              <button
                onClick={() => onReprompt(message.content, message.taggedCards)}
                title="Re-use this prompt"
                aria-label="Re-use this prompt"
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", fontSize: "0.7rem", padding: "3px 6px",
                  borderRadius: "6px", opacity: 0.6, transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.background = "none"; }}
              >
                <RotateCcw size={11} />
                <span>Re-use</span>
              </button>
            </div>
          )}

          {/* Confidence badge — only on AI messages that include the indicator */}
          {!isUser && confidenceLevel && (
            <div style={{
              marginTop: "12px",
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: CONFIDENCE_STYLES[confidenceLevel].bg,
              border: `1px solid ${CONFIDENCE_STYLES[confidenceLevel].border}`,
              borderRadius: "8px", padding: "6px 12px",
            }}>
              <span style={{ fontSize: "0.72rem" }}>{CONFIDENCE_STYLES[confidenceLevel].dot}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: CONFIDENCE_STYLES[confidenceLevel].text }}>
                {confidenceLevel} Confidence
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", borderLeft: `1px solid ${CONFIDENCE_STYLES[confidenceLevel].border}`, paddingLeft: "8px" }}>
                {confidenceNote}
              </span>
            </div>
          )}

          {/* Tagged card snapshot shown on historical user messages */}
          {message.taggedCards && message.taggedCards.length > 0 && (
            <div
              style={{
                marginTop: "12px",
                paddingTop: "10px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                🔍 Card context referenced:
              </span>
              {message.taggedCards.map((card) => (
                <span
                  key={card.id}
                  style={{
                    fontSize: "0.75rem",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    color: "var(--text-secondary)",
                  }}
                >
                  🎴 {card.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
