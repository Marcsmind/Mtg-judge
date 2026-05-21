import React, { useState, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Copy, Check, Bookmark, BookmarkCheck } from "lucide-react";
import { MTG_KEYWORDS } from "../../constants/mtgKeywords";
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
}) => {
  const isUser = message.role === "user";

  // Pre-parse confidence once per message
  const { body: messageBody, level: confidenceLevel, note: confidenceNote } =
    React.useMemo(() => parseConfidence(message.content), [message.content]);

  // ── Copy-ruling state ──
  const [copied, setCopied] = useState(false);
  // ── Bookmark feedback state ──
  const [justSaved, setJustSaved] = useState(false);

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

  // ── react-markdown component overrides ─────────────────────────────────────
  // IMPORTANT: wrapped in useMemo so the `strong` function reference is stable
  // across renders.  Without this, react-markdown sees a new component type on
  // every render of AIJudge (e.g. on autocomplete keystrokes), unmounts and
  // remounts every <strong> element, and click events fired during that window
  // are swallowed — the card-name-to-Codex click regression.
  const markdownComponents = useMemo((): Components => ({
    // Override <strong> (produced by **text**) to handle three cases:
    //   1. "settings"   → link that opens the Settings panel
    //   2. MTG keyword  → shows a hover tooltip with a definition
    //   3. anything else → treated as a card name; opens Card Codex
    strong: ({ children }) => {
      // Safely flatten children to a plain string.
      // react-markdown v10 passes simple text as a bare string; fall back to
      // recursive extraction for any nested React nodes (e.g. emphasis inside bold).
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

      // 2. MTG keyword → tooltip on hover
      const keywordDef = MTG_KEYWORDS[lower];
      if (keywordDef) {
        return (
          <strong
            style={{
              color: "#a78bfa",
              cursor: "help",
              borderBottom: "1px dashed rgba(167,139,250,0.5)",
              fontWeight: 700,
            }}
            title={keywordDef}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                term: text,
                text: keywordDef,
                x: rect.left,
                y: rect.bottom + 6,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {text}
          </strong>
        );
      }

      // 3. Card name → click to open Card Codex
      return (
        <strong
          onClick={() => onOpenCodex(text)}
          style={{
            color: "var(--accent-cyan)",
            cursor: "pointer",
            borderBottom: "1px solid rgba(6,182,212,0.4)",
            fontWeight: 700,
            transition: "color 0.15s ease",
          }}
          title={`Click to look up "${text}" in the Card Codex`}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#67e8f9")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--accent-cyan)")
          }
        >
          {text}
        </strong>
      );
    },
  }), [onOpenCodex, onGoToSettings]);

  return (
    <>
      {/* Keyword tooltip portal (fixed-positioned, stays within the viewport) */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tooltip.x, window.innerWidth - 320),
            top: tooltip.y,
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
            </div>
          )}

          <div className="chat-markdown">
            <ReactMarkdown components={markdownComponents}>
              {isUser ? message.content : messageBody}
            </ReactMarkdown>
          </div>

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
