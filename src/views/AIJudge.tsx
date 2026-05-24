import React, { useState, useEffect, useRef, useCallback } from "react";
import { Scale, Send, Trash2, AlertCircle, BookmarkCheck, X } from "lucide-react";
import { useMobile } from "../hooks/useMobile";
import {
  autocompleteCard,
  searchCardFuzzy,
  fetchCardRulings,
} from "../services/scryfall";
import type { ScryfallCard, ScryfallRuling } from "../services/scryfall";
import { askGeminiJudge } from "../services/gemini";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useAppStore } from "../store/useAppStore";
import { ChatMessage } from "./ai-judge/ChatMessage";
import { CardTagBar } from "./ai-judge/CardTagBar";
import { BottomSheet } from "../components/BottomSheet";

// ── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "model";
  content: string;
  taggedCards?: ScryfallCard[];
}

interface FavoriteRuling {
  id: string;
  savedAt: number;
  question: string;       // preceding user message (empty for the greeting)
  answer: string;         // model response text
  taggedCardNames: string[]; // card names snapshotted at save time
}

const INITIAL_MESSAGE: Message = {
  role: "model",
  content: `Greetings, Commander! 🛡️ I am your **Nexus Judge**. \n\nI have encyclopedic knowledge of the Magic Comprehensive Rules (CR) and Magic Tournament Rules (MTR). I am optimized specifically for the **Commander (EDH) format**.\n\n**How to get the most accurate rulings:**\n1. Use the search bar below to search and **tag cards** relevant to your question. This pulls their exact printing details and WotC rulings, injecting them as context so I never hallucinate.\n2. Ask your question in the box below (e.g. *"If my commander is phased out, does it still deal commander damage?"*).\n\nHow can I assist your pod today?`,
};

/** Compact greeting for mobile — includes scenario topics inline since the chip row is hidden. */
const MOBILE_INITIAL_MESSAGE: Message = {
  role: "model",
  content: `Greetings, Commander! 🛡️ I'm your **Nexus Judge** — an AI rules advisor for Magic: The Gathering Commander.\n\nTag cards using the search bar, then ask me anything. Common starting points:\n\n• **Commander Tax** — recasting from the command zone\n• **Commander Damage** — tracking the 21-damage threshold\n• **Phased Out** — attachments and combat with phasing\n\nWhat ruling can I help you with?`,
};

// ── Props ────────────────────────────────────────────────────────────────────

interface AIJudgeProps {
  apiKey: string;
  geminiModel: string;
  openCodex: () => void;
  openCodexWith?: (term: string) => void;
  goToSettings?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export const AIJudge: React.FC<AIJudgeProps> = ({
  apiKey,
  geminiModel,
  openCodex,
  openCodexWith,
  goToSettings,
  onClose,
  isModal,
}) => {
  const isMobile = useMobile(768);
  const [query, setQuery] = useState("");

  // ── Safely parse persisted state — corrupt JSON falls back to defaults ──
  const [chatHistory, setChatHistory] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AI_CHAT);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    // Use compact mobile greeting when on a narrow screen (check directly at init time)
    return [window.innerWidth <= 768 ? MOBILE_INITIAL_MESSAGE : INITIAL_MESSAGE];
  });

  const [cardSearch, setCardSearch] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [taggedCards, setTaggedCards] = useState<ScryfallCard[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AI_TAGS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [rulingsMap, setRulingsMap] = useState<Record<string, ScryfallRuling[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AI_RULINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Separate loading states: cardLoading for Scryfall fetches, queryLoading for AI calls
  const [cardLoading, setCardLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Saved Rulings (Favorites) ────────────────────────────────────────────
  const [favorites, setFavorites] = useState<FavoriteRuling[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.AI_FAVORITES);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [showFavorites, setShowFavorites] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea as content grows (max ~4 lines / 140px)
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  // ── Zustand: card history + pendingTagCard signal ──
  const addToCardHistory = useAppStore((s) => s.addToCardHistory);
  const pendingTagCard = useAppStore((s) => s.pendingTagCard);
  const setPendingTagCard = useAppStore((s) => s.setPendingTagCard);

  // ── Auto-scroll chat to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, queryLoading]);

  // ── Persist chat state ──
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AI_CHAT, JSON.stringify(chatHistory));
    localStorage.setItem(STORAGE_KEYS.AI_TAGS, JSON.stringify(taggedCards));
    localStorage.setItem(STORAGE_KEYS.AI_RULINGS, JSON.stringify(rulingsMap));
  }, [chatHistory, taggedCards, rulingsMap]);

  // ── Click outside — close autocomplete dropdown ──
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

  // ── Autocomplete debounce — 300ms + AbortController to cancel stale requests ──
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (cardSearch.trim().length >= 2) {
        autocompleteAbortRef.current?.abort();
        autocompleteAbortRef.current = new AbortController();
        const list = await autocompleteCard(cardSearch, autocompleteAbortRef.current.signal);
        setSuggestions(list);
      } else {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [cardSearch]);

  // ── Tag a card — fetch oracle text + rulings for RAG context ──
  const handleTagCard = useCallback(
    async (cardName: string) => {
      setCardSearch("");
      setSuggestions([]);

      if (taggedCards.some((c) => c.name.toLowerCase() === cardName.toLowerCase())) {
        return;
      }
      if (taggedCards.length >= 5) {
        setError("You can tag a maximum of 5 cards per question.");
        setTimeout(() => setError(""), 4000);
        return;
      }

      setCardLoading(true);
      const card = await searchCardFuzzy(cardName);
      if (card) {
        setTaggedCards((prev) => [...prev, card]);
        const rulings = await fetchCardRulings(card.id);
        setRulingsMap((prev) => ({ ...prev, [card.id]: rulings }));
        addToCardHistory(card);
      } else {
        setError(`Could not find details for "${cardName}".`);
        setTimeout(() => setError(""), 4000);
      }
      setCardLoading(false);
    },
    [taggedCards, addToCardHistory]
  );

  // ── pendingTagCard watcher — consumed when CardCodex History "Tag in Judge" fires ──
  useEffect(() => {
    if (!pendingTagCard) return;
    const card = pendingTagCard;
    setPendingTagCard(null);
    if (taggedCards.some((c) => c.id === card.id) || taggedCards.length >= 5) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCardLoading(true);
    fetchCardRulings(card.id).then((rulings) => {
      setTaggedCards((prev) => [...prev, card]);
      setRulingsMap((prev) => ({ ...prev, [card.id]: rulings }));
      addToCardHistory(card);
      setCardLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTagCard]);

  // ── Remove a tagged card ──
  const handleRemoveTag = (cardId: string) => {
    setTaggedCards((prev) => prev.filter((c) => c.id !== cardId));
    setRulingsMap((prev) => {
      const copy = { ...prev };
      delete copy[cardId];
      return copy;
    });
  };

  // ── Submit rules question ──
  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const question = query.trim();
    if (!question) return;

    setError("");
    setQueryLoading(true);
    setQuery("");
    // Reset textarea height after clearing
    if (inputRef.current) inputRef.current.style.height = "44px";

    const userMessage: Message = {
      role: "user",
      content: question,
      taggedCards: [...taggedCards], // snapshot for historical display
    };
    setChatHistory((prev) => [...prev, userMessage]);

    try {
      const apiHistory = chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const judgeResponse = await askGeminiJudge(
        question,
        apiHistory,
        taggedCards,
        rulingsMap,
        apiKey,
        geminiModel
      );

      setChatHistory((prev) => [
        ...prev,
        { role: "model", content: judgeResponse },
      ]);
    } catch (err: unknown) {
      console.error(err);
      setError("Error communicating with AI Judge.");
    } finally {
      setQueryLoading(false);
    }
  };

  const handleClearChat = () => setShowClearConfirm(true);

  const doClearChat = () => {
    setChatHistory([
      {
        role: "model",
        content: `Chat history cleared. I am ready for your next question! Search and tag cards below to begin.`,
      },
    ]);
    setTaggedCards([]);
    setRulingsMap({});
  };

  // ── Favorites handlers ─────────────────────────────────────────────────────
  const handleBookmark = (msgIdx: number) => {
    const msg = chatHistory[msgIdx];
    if (msg.role !== "model") return;
    // Find the nearest preceding user message for context
    let question = "";
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (chatHistory[i].role === "user") { question = chatHistory[i].content; break; }
    }
    // eslint-disable-next-line react-hooks/purity
    const ts = Date.now();
    const fav: FavoriteRuling = {
      id: ts.toString(),
      savedAt: ts,
      question,
      answer: msg.content,
      taggedCardNames: (msg.taggedCards ?? []).map(c => c.name),
    };
    const next = [fav, ...favorites];
    setFavorites(next);
    localStorage.setItem(STORAGE_KEYS.AI_FAVORITES, JSON.stringify(next));
  };

  const handleDeleteFavorite = (id: string) => {
    const next = favorites.filter(f => f.id !== id);
    setFavorites(next);
    localStorage.setItem(STORAGE_KEYS.AI_FAVORITES, JSON.stringify(next));
  };

  // Shortcut to open Codex — CardTagBar and ChatMessage both need this.
  // Wrapped in useCallback so the reference is stable across renders caused by
  // local state changes (card search input, etc.), keeping markdownComponents
  // memoized in ChatMessage and preventing <strong> remount on every keystroke.
  const handleOpenCodex = useCallback(
    (term: string) => {
      if (openCodexWith) openCodexWith(term);
      else openCodex();
    },
    [openCodex, openCodexWith]
  );

  const sampleQuestions = [
    {
      label: "Commander Tax rules",
      q: "How does Commander Tax work when casting my commander from zones other than the command zone (like the hand or library)?",
    },
    {
      label: "Commander damage limit",
      q: "Does commander damage count if it is dealt by a commander I control but my opponent stole? Is it total commander damage or per commander?",
    },
    {
      label: "Phased Out combat",
      q: "What happens to attached equipment and Auras when a creature phases out? Does the phased out creature still count as dealing commander damage?",
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="view-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        maxWidth: isModal ? "100%" : "900px",
        padding: isModal ? "16px" : undefined,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "16px",
          marginBottom: "16px",
          flexShrink: 0,
        }}
      >
        {/* Row 1: Title and Close */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>
            AI Rules Judge
          </h2>
          {/* Modal Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="glass-button"
              aria-label="Close AI Judge"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-color)",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-primary)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
        </div>

        {/* Row 2: Icon and Subtext */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <Scale size={20} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.4 }}>
            Certified Commander rules analysis. Tag cards to provide ground-truth oracle texts.
          </p>
        </div>

        {/* Row 3: Action Buttons */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          {/* Saved Rulings button */}
          <button
            onClick={() => setShowFavorites(true)}
            className="glass-button"
            title="View saved rulings"
            style={{
              padding: "8px 12px",
              background: favorites.length > 0 ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.02)",
              borderColor: favorites.length > 0 ? "rgba(234,179,8,0.3)" : undefined,
              color: favorites.length > 0 ? "var(--accent-gold)" : "var(--text-secondary)",
              fontSize: "0.85rem",
            }}
          >
            <BookmarkCheck size={14} />
            <span>Saved{favorites.length > 0 ? ` (${favorites.length})` : ""}</span>
          </button>

          {chatHistory.length > 1 && (
            <button
              onClick={handleClearChat}
              className="glass-button"
              style={{
                padding: "8px 12px",
                background: "rgba(255, 255, 255, 0.02)",
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
              }}
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Message History Board */}
      <div
        className="glass-panel"
        style={{
          flex: 1,
          padding: "20px",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          marginBottom: "16px",
          background: "rgba(22, 19, 32, 0.4)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {chatHistory.map((msg, index) => (
          <ChatMessage
            key={index}
            message={msg}
            onOpenCodex={handleOpenCodex}
            onGoToSettings={goToSettings}
            onBookmark={msg.role === "model" ? () => handleBookmark(index) : undefined}
            isBookmarked={msg.role === "model" && favorites.some(f => f.answer === msg.content)}
            onReprompt={msg.role === "user" ? (content, cards) => {
              setQuery(content);
              if (cards && cards.length > 0) setTaggedCards(cards);
              setTimeout(() => inputRef.current?.focus(), 0);
            } : undefined}
          />
        ))}

        {/* AI Thinking Animation */}
        {queryLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <div
              style={{
                maxWidth: "150px",
                padding: "12px 20px",
                borderRadius: "14px",
                borderTopLeftRadius: "2px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                display: "flex",
                gap: "6px",
                alignItems: "center",
              }}
            >
              <div
                className="dot"
                style={{
                  width: "8px",
                  height: "8px",
                  background: "var(--accent-purple)",
                  borderRadius: "50%",
                  animation: "bounce-dots 1.4s infinite ease-in-out both",
                }}
              />
              <div
                className="dot"
                style={{
                  width: "8px",
                  height: "8px",
                  background: "var(--accent-cyan)",
                  borderRadius: "50%",
                  animation:
                    "bounce-dots 1.4s infinite ease-in-out both 0.2s",
                }}
              />
              <div
                className="dot"
                style={{
                  width: "8px",
                  height: "8px",
                  background: "var(--accent-purple)",
                  borderRadius: "50%",
                  animation:
                    "bounce-dots 1.4s infinite ease-in-out both 0.4s",
                }}
              />
              <style>{`
                @keyframes bounce-dots {
                  0%, 80%, 100% { transform: scale(0); }
                  40% { transform: scale(1); }
                }
              `}</style>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error notification */}
      {error && (
        <div
          style={{
            background: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "var(--accent-rose)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.85rem",
            marginBottom: "12px",
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Card Tagging Bar + Quick Suggestions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <CardTagBar
          taggedCards={taggedCards}
          cardSearch={cardSearch}
          setCardSearch={setCardSearch}
          suggestions={suggestions}
          cardLoading={cardLoading}
          onTagCard={handleTagCard}
          onRemoveTag={handleRemoveTag}
          onClearAll={() => {
            setTaggedCards([]);
            setRulingsMap({});
          }}
          dropdownRef={dropdownRef}
        />

        {/* Sample prompt shortcuts — only shown on desktop when chat is fresh */}
        {!isMobile && !query && chatHistory.length <= 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              💡 Common Rules Scenarios:
            </span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {sampleQuestions.map((sq, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(sq.q)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "6px 12px",
                    borderRadius: "14px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.08)";
                    e.currentTarget.style.borderColor = "var(--accent-purple-glow)";
                    e.currentTarget.style.color = "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {sq.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Input Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "10px",
          width: "100%",
          marginBottom: "12px",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="glass-input"
          placeholder={
            apiKey
              ? "Ask a rules question..."
              : "Mock Mode: Tag cards (Add API Key)"
          }
          value={query}
          onChange={(e) => { setQuery(e.target.value); autoResize(e.target); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Trigger form submit programmatically
              (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          disabled={queryLoading}
          style={{
            flex: 1,
            resize: "none",
            overflow: "hidden",
            minHeight: "44px",
            maxHeight: "140px",
            padding: "11px 16px",
            fontSize: "16px",
            lineHeight: "1.4",
          }}
        />
        <button
          type="submit"
          className="glass-button"
          disabled={queryLoading || !query.trim()}
          style={{
            alignSelf: "flex-end",
            height: "44px",
            background: "var(--accent-purple)",
            borderColor: "var(--accent-purple)",
            color: "#ffffff",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Send size={16} />
          <span>Ask</span>
        </button>
      </form>
      {/* ── Saved Rulings Panel ─────────────────────────────────────────── */}
      {showFavorites && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowFavorites(false); }}
        >
          <div style={{
            width: "720px", maxWidth: "94vw", maxHeight: "82vh",
            background: "var(--bg-dark)", borderRadius: "18px",
            border: "1px solid var(--border-color)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Panel header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "18px 24px", borderBottom: "1px solid var(--border-color)",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <BookmarkCheck size={20} color="var(--accent-gold)" />
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Saved Rulings</h3>
                {favorites.length > 0 && (
                  <span style={{
                    background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)",
                    borderRadius: "20px", padding: "2px 10px", fontSize: "0.72rem",
                    color: "var(--accent-gold)", fontWeight: 700,
                  }}>{favorites.length}</span>
                )}
              </div>
              <button
                onClick={() => setShowFavorites(false)}
                aria-label="Close saved rulings"
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px", padding: "6px 10px", color: "var(--text-secondary)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                  fontSize: "0.8rem",
                }}
              >
                <X size={14} /> Close
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {favorites.length === 0 ? (
                <div style={{ textAlign: "center", marginTop: "40px", color: "var(--text-muted)" }}>
                  <BookmarkCheck size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
                  <p style={{ fontSize: "0.9rem" }}>No saved rulings yet.</p>
                  <p style={{ fontSize: "0.78rem", marginTop: "6px" }}>
                    Click the <strong style={{ color: "var(--text-secondary)" }}>Save</strong> button on any AI response to bookmark it here.
                  </p>
                </div>
              ) : (
                favorites.map(fav => (
                  <div key={fav.id} style={{
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px",
                  }}>
                    {/* Question */}
                    {fav.question && (
                      <div style={{
                        background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)",
                        borderRadius: "8px", padding: "10px 14px",
                        fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5,
                      }}>
                        <span style={{ color: "var(--accent-purple)", fontWeight: 700, marginRight: "6px" }}>Q:</span>
                        {fav.question}
                      </div>
                    )}
                    {/* Tagged cards */}
                    {fav.taggedCardNames.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {fav.taggedCardNames.map(name => (
                          <span key={name} style={{
                            fontSize: "0.72rem", background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "10px", padding: "2px 8px", color: "var(--text-muted)",
                          }}>🎴 {name}</span>
                        ))}
                      </div>
                    )}
                    {/* Answer — reuse ChatMessage for full markdown + keyword tooltips */}
                    <ChatMessage
                      message={{ role: "model", content: fav.answer }}
                      onOpenCodex={handleOpenCodex}
                      onGoToSettings={goToSettings}
                    />
                    {/* Footer: date + delete */}
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                        Saved {new Date(fav.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <button
                        onClick={() => handleDeleteFavorite(fav.id)}
                        style={{
                          background: "none", border: "1px solid rgba(244,63,94,0.2)",
                          borderRadius: "6px", padding: "3px 10px", color: "rgba(244,63,94,0.7)",
                          cursor: "pointer", fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(244,63,94,0.1)"; e.currentTarget.style.color = "var(--accent-rose)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "rgba(244,63,94,0.7)"; }}
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <BottomSheet onClose={() => setShowClearConfirm(false)} zIndex={300} maxWidth="380px" padding="24px">
          <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 600 }}>Clear Chat?</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            This will remove the entire conversation history and all tagged cards.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowClearConfirm(false)} className="glass-button" style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              onClick={() => { setShowClearConfirm(false); doClearChat(); }}
              className="glass-button"
              style={{ flex: 1, background: "rgba(244,63,94,0.1)", borderColor: "rgba(244,63,94,0.25)", color: "#f43f5e" }}
            >
              Clear
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
