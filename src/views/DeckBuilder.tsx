import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Wand2, Upload, Search, Copy, Check, Loader, AlertTriangle, X,
  BookMarked, Trash2, Pencil, PlusCircle, ListOrdered, Sparkles, ClipboardPaste,
} from "lucide-react";
import { loadDecks, addDeck, updateDeck, deleteDeck } from "../services/decks";
import type { SavedDeck, DeckCard } from "../types/deck";
import { DeckEditorView } from "./deck-editor/DeckEditorView";
import { DeckRecommendationsView } from "./deck-editor/DeckRecommendationsView";
import { useFeature } from "../hooks/useFeature";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { searchCardFuzzy as searchCardForDeck, getCardImage as getDeckCardImage, autocompleteCard as autocompleteDeck } from "../services/scryfall";
import {
  autocompleteCard,
  searchCardFuzzy,
  getCardImage,
} from "../services/scryfall";
import type { ScryfallCard } from "../services/scryfall";
import { askGeminiDeckBuilder } from "../services/gemini";
import { buildManaCurve, buildColorSpread, calcDeckCost, toMoxfieldFormat, COLOR_META } from "../utils/deckUtils";
import { useToast } from "../components/Toast";
import { track } from "../services/analytics";

interface DeckBuilderProps {
  apiKey: string;
  geminiModel: string;
  openCodexWith: (name: string) => void;
}

type DeckMode = "generate" | "import" | "decks";
type BudgetTier = "any" | "budget" | "competitive";

const BUDGET_LABELS: Record<BudgetTier, string> = {
  any:         "Any Budget",
  budget:      "Budget (<$3/card avg)",
  competitive: "Competitive",
};

/**
 * Parse a decklist in MTGO / Moxfield / MTGA format into unique card names.
 * Handles:
 *   "1 Sol Ring"            (MTGO)
 *   "1 Sol Ring (CMR) 263"  (Moxfield with set + collector number)
 *   "4x Birds of Paradise"  (quantity with x)
 * Section headers (Commander, Deck, Sideboard) and comment lines are ignored.
 */
function parseDecklist(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split("\n")
    .filter(l => /^\s*\d/.test(l))                                 // only lines starting with a quantity
    .map(l =>
      l.trim()
       .replace(/^\d+[xX]?\s+/, "")                               // strip quantity prefix
       .replace(/\s*\([A-Z0-9]{2,6}\)\s*\d+.*$/i, "")            // strip "(SET) CollectorNum" suffix
       .trim()
    )
    .filter(name => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}


/** Extract card names from AI-generated markdown (lines starting with "- ") */
function extractCardNames(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter(l => l.trim().startsWith("- "))
    .map(l => l.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  apiKey,
  geminiModel,
  openCodexWith,
}) => {
  const { showToast } = useToast();
  const canGenerate  = useFeature("ai_deck_generation");
  const canCloudDecks = useFeature("cloud_decks");

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const [mode, setMode] = useState<DeckMode>("generate");

  // ── Generate mode state ──
  const [commander, setCommander] = useState("");
  const [strategy, setStrategy] = useState("");
  const [budget, setBudget] = useState<BudgetTier>("any");
  const [cmdSuggestions, setCmdSuggestions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedDeck, setGeneratedDeck] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Import mode state ──
  const [rawDecklist, setRawDecklist] = useState("");
  const [importedCards, setImportedCards] = useState<(ScryfallCard | null)[]>([]);
  const [fetchProgress, setFetchProgress] = useState<{ done: number; total: number } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // ── My Decks state ──
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadDecks());
  const [deckThumbs, setDeckThumbs] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [openDeckId, setOpenDeckId]             = useState<string | null>(null);
  const [openRecommendDeckId, setOpenRecommendDeckId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckCmd, setNewDeckCmd] = useState("");
  const [newDeckPartner, setNewDeckPartner] = useState("");
  const [newDeckNotes, setNewDeckNotes] = useState("");
  const [deckCmdSugs, setDeckCmdSugs] = useState<string[]>([]);
  const [deckPartnerSugs, setDeckPartnerSugs] = useState<string[]>([]);
  const deckCmdAbortRef = useRef<AbortController | null>(null);
  const deckPartnerAbortRef = useRef<AbortController | null>(null);

  // Re-read decks when switching to the decks tab
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === "decks") setSavedDecks(loadDecks());
  }, [mode]);

  // Lazy-load thumbnail images for each deck's commander
  useEffect(() => {
    if (mode !== "decks") return;
    let cancelled = false;
    savedDecks.forEach(async deck => {
      if (deckThumbs[deck.id]) return;
      const card = await searchCardForDeck(deck.commanderName);
      if (card && !cancelled) {
        setDeckThumbs(prev => ({ ...prev, [deck.id]: getDeckCardImage(card) }));
      }
    });
    return () => { cancelled = true; };
  }, [savedDecks, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autocomplete for new deck commander field
  useEffect(() => {
    const delay = setTimeout(async () => {
      if (newDeckCmd.trim().length < 2) { setDeckCmdSugs([]); return; }
      deckCmdAbortRef.current?.abort();
      deckCmdAbortRef.current = new AbortController();
      const list = await autocompleteDeck(newDeckCmd, deckCmdAbortRef.current.signal);
      setDeckCmdSugs(list.slice(0, 8));
    }, 300);
    return () => clearTimeout(delay);
  }, [newDeckCmd]);

  // Autocomplete for partner field
  useEffect(() => {
    const delay = setTimeout(async () => {
      if (newDeckPartner.trim().length < 2) { setDeckPartnerSugs([]); return; }
      deckPartnerAbortRef.current?.abort();
      deckPartnerAbortRef.current = new AbortController();
      const list = await autocompleteDeck(newDeckPartner, deckPartnerAbortRef.current.signal);
      setDeckPartnerSugs(list.slice(0, 6));
    }, 300);
    return () => clearTimeout(delay);
  }, [newDeckPartner]);

  const resetDeckForm = () => {
    setNewDeckName(""); setNewDeckCmd(""); setNewDeckPartner(""); setNewDeckNotes("");
    setDeckCmdSugs([]); setDeckPartnerSugs([]); setShowAddForm(false); setEditingDeckId(null);
  };

  const handleSaveDeck = () => {
    const name = newDeckName.trim();
    const commanderName = newDeckCmd.trim();
    if (!name) { showToast("Enter a deck name.", "error"); return; }
    if (!commanderName) { showToast("Enter a commander name.", "error"); return; }
    try {
      if (editingDeckId) {
        updateDeck(editingDeckId, { name, commanderName, partnerName: newDeckPartner.trim() || undefined, notes: newDeckNotes.trim() || undefined });
      } else {
        addDeck({ name, commanderName, partnerName: newDeckPartner.trim() || undefined, notes: newDeckNotes.trim() || undefined });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DeckBuilder] save error:", err);
      const isQuota = /quota|storage|QuotaExceeded/i.test(msg);
      showToast(isQuota ? "Storage full — go to Settings and clear chat history to free space." : `Save failed: ${msg}`, "error");
      return;
    }
    if (!editingDeckId) {
      track("deck_saved");
      if (savedDecks.length === 0) track("deck_saved_first");
    }
    showToast(editingDeckId ? "Deck updated!" : `"${name}" saved!`, "success");
    setSavedDecks(loadDecks());
    setDeckThumbs(prev => { const next = { ...prev }; if (editingDeckId) delete next[editingDeckId]; return next; });
    resetDeckForm();
  };

  const handleEditDeck = (deck: SavedDeck) => {
    setEditingDeckId(deck.id);
    setNewDeckName(deck.name);
    setNewDeckCmd(deck.commanderName);
    setNewDeckPartner(deck.partnerName ?? "");
    setNewDeckNotes(deck.notes ?? "");
    setShowAddForm(true);
  };

  const handleDeleteDeck = (id: string) => {
    deleteDeck(id);
    setSavedDecks(loadDecks());
    setDeckThumbs(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const handleSaveDeckCards = (deckId: string, cards: DeckCard[]) => {
    updateDeck(deckId, { cards });
    setSavedDecks(loadDecks());
  };

  // ── Autocomplete abort controller ──
  const cmdAbortRef = useRef<AbortController | null>(null);

  // Autocomplete for commander name
  useEffect(() => {
    const delay = setTimeout(async () => {
      if (commander.trim().length < 2) { setCmdSuggestions([]); return; }
      cmdAbortRef.current?.abort();
      cmdAbortRef.current = new AbortController();
      const list = await autocompleteCard(commander, cmdAbortRef.current.signal);
      setCmdSuggestions(list.slice(0, 8));
    }, 300);
    return () => clearTimeout(delay);
  }, [commander]);

  // ── Generate mode ──

  const handleGenerate = useCallback(async () => {
    if (!commander.trim()) return;
    setGenerating(true);
    setGeneratedDeck(null);
    setCmdSuggestions([]);

    const budgetNote = budget === "budget"
      ? "Keep the average card price under $3 (no card over $10)."
      : budget === "competitive"
      ? "Optimize for competitive play — include all best-in-slot staples regardless of price."
      : "";

    const prompt = [
      `Build me a full 100-card Commander deck for: ${commander.trim()}`,
      strategy.trim() ? `Strategy / theme: ${strategy.trim()}` : "",
      budgetNote,
      "Output the complete decklist in the required grouped markdown format.",
    ].filter(Boolean).join("\n");

    const result = await askGeminiDeckBuilder(prompt, apiKey, geminiModel);
    setGeneratedDeck(result);
    setGenerating(false);
    if (result) track("deck_generated", { commander: commander.trim() });
  }, [commander, strategy, budget, apiKey, geminiModel]);

  const handleCopyDecklist = () => {
    if (!generatedDeck) return;
    const names = extractCardNames(generatedDeck);
    navigator.clipboard.writeText(names.join("\n")).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMoxfield = (names: string[]) => {
    navigator.clipboard.writeText(toMoxfieldFormat(names)).catch(() => undefined);
    showToast("Copied in Moxfield format!", "success");
  };

  // ── Import mode ──

  /** Fetch cards with max 5 concurrent requests */
  const handleFetchFromUrl = async () => {
    if (!importUrl.trim()) return;
    setUrlFetching(true);
    setUrlError(null);
    try {
      const res = await fetch(importUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setRawDecklist(text.trim());
      setImportUrl("");
    } catch {
      setUrlError("Couldn't fetch that URL — CORS may be blocking it. Paste the decklist manually instead.");
    } finally {
      setUrlFetching(false);
    }
  };

  const handleParseDecklist = useCallback(async () => {
    const names = parseDecklist(rawDecklist);
    if (names.length === 0) return;

    setImportedCards([]);
    setAnalysisResult(null);
    setFetchProgress({ done: 0, total: names.length });

    const results: (ScryfallCard | null)[] = new Array(names.length).fill(null);
    const CONCURRENCY = 5;

    for (let i = 0; i < names.length; i += CONCURRENCY) {
      const batch = names.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(name => searchCardFuzzy(name))
      );
      settled.forEach((r, j) => {
        results[i + j] = r.status === "fulfilled" ? r.value : null;
      });
      setFetchProgress({ done: Math.min(i + CONCURRENCY, names.length), total: names.length });
      setImportedCards([...results]);
      if (i + CONCURRENCY < names.length) await new Promise(r => setTimeout(r, 100));
    }

    setFetchProgress(null);
    const found = results.filter(Boolean).length;
    if (found > 0) track("deck_imported", { card_count: found });
  }, [rawDecklist]);

  const handleAnalyzeImport = useCallback(async () => {
    const found = importedCards.filter(Boolean) as ScryfallCard[];
    if (found.length === 0) return;

    setAnalyzing(true);
    setAnalysisResult(null);

    const cardList = found.map(c => c.name).join("\n");
    const prompt = `IMPORTED DECK LIST:\n${cardList}\n\nAnalyze this Commander deck. Identify the primary strategy.\nSuggest exactly 10 cards to CUT (with one-line reason each) and\n10 cards to ADD (with one-line reason each).\nFormat as two markdown sections: ## Cards to Cut and ## Cards to Add.`;

    const result = await askGeminiDeckBuilder(prompt, apiKey, geminiModel);
    setAnalysisResult(result);
    setAnalyzing(false);
  }, [importedCards, apiKey, geminiModel]);

  // ── Render helpers ──

  const renderCardName = (name: string) => (
    <strong
      key={name}
      style={{ cursor: "pointer", color: "var(--accent-cyan)" }}
      onClick={() => openCodexWith(name)}
      title={`Look up ${name} in Card Codex`}
    >
      {name}
    </strong>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1, overflow: "hidden" }}>

      {/* ── Deck editor overlay ── */}
      {openDeckId && (() => {
        const deck = savedDecks.find(d => d.id === openDeckId);
        if (!deck) return null;
        return (
          <DeckEditorView
            deck={deck}
            onSave={cards => handleSaveDeckCards(deck.id, cards)}
            onBack={() => setOpenDeckId(null)}
            openCodexWith={openCodexWith}
          />
        );
      })()}

      {/* ── Deck recommendations overlay ── */}
      {openRecommendDeckId && (() => {
        const deck = savedDecks.find(d => d.id === openRecommendDeckId);
        if (!deck) return null;
        return (
          <DeckRecommendationsView
            deck={deck}
            apiKey={apiKey}
            geminiModel={geminiModel}
            onBack={() => setOpenRecommendDeckId(null)}
            onDeckUpdated={() => setSavedDecks(loadDecks())}
            openCodexWith={openCodexWith}
          />
        );
      })()}

      {/* Hide everything below when an overlay is open */}
      {!openDeckId && !openRecommendDeckId && <>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <Wand2 size={22} color="var(--accent-purple)" />
        <div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.1 }}>Deck Builder</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>AI-powered Commander deck construction</p>
        </div>
      </div>

      {/* ── Mode Tab Bar ── */}
      <div style={{
        display: "flex", gap: "4px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--border-color)",
        borderRadius: "10px", padding: "3px", flexShrink: 0,
        maxWidth: "480px",
      }}>
        {(["generate", "import", "decks"] as DeckMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: "7px", border: "none",
              background: mode === m ? "var(--accent-purple)" : "transparent",
              color: mode === m ? "#fff" : "var(--text-secondary)",
              fontWeight: mode === m ? 700 : 500,
              fontSize: "0.85rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            {m === "generate" ? <Wand2 size={13} /> : m === "import" ? <Upload size={13} /> : <BookMarked size={13} />}
            {m === "generate" ? "AI Generate" : m === "import" ? "Import List" : "My Decks"}
          </button>
        ))}
      </div>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", background: "var(--bg-card)" }}>

        {/* ════════════════════════════════════════
            GENERATE MODE
        ════════════════════════════════════════ */}
        {mode === "generate" && (
          <>
            {/* Input form */}
            <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Commander name with autocomplete */}
              <div style={{ position: "relative" }}>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Commander *
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Atraxa, Praetors' Voice"
                    value={commander}
                    onChange={e => setCommander(e.target.value)}
                    style={{ width: "100%", paddingRight: "36px" }}
                  />
                  <Search size={14} color="var(--text-muted)" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }} />
                </div>
                {cmdSuggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                    background: "var(--bg-dark)", border: "1px solid var(--border-color)",
                    borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    zIndex: 50, maxHeight: "200px", overflowY: "auto",
                  }}>
                    {cmdSuggestions.map((name, i) => (
                      <div
                        key={i}
                        onClick={() => { setCommander(name); setCmdSuggestions([]); }}
                        style={{
                          padding: "9px 14px", cursor: "pointer", fontSize: "0.88rem",
                          color: "var(--text-secondary)",
                          borderBottom: i < cmdSuggestions.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Strategy */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "6px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Theme / Strategy
                </label>
                <textarea
                  className="glass-input"
                  placeholder="e.g. Aggressive voltron with equipment synergies, or Combo-focused proliferate engine"
                  value={strategy}
                  onChange={e => { setStrategy(e.target.value); autoResize(e.target); }}
                  onFocus={e => { autoResize(e.target); e.target.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
                  rows={2}
                  style={{ width: "100%", resize: "none", minHeight: "60px", fontFamily: "inherit", overflow: "hidden", WebkitAppearance: "none", borderRadius: "8px" }}
                />
              </div>

              {/* Budget */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "8px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  Budget
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["any", "budget", "competitive"] as BudgetTier[]).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setBudget(tier)}
                      style={{
                        padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
                        background: budget === tier ? "color-mix(in srgb, var(--accent-purple) 20%, transparent)" : "rgba(255,255,255,0.04)",
                        color: budget === tier ? "var(--accent-purple)" : "var(--text-secondary)",
                        fontWeight: budget === tier ? 700 : 500,
                        border: `1px solid ${budget === tier ? "color-mix(in srgb, var(--accent-purple) 40%, transparent)" : "rgba(255,255,255,0.08)"}`,
                        fontSize: "0.78rem", transition: "all 0.15s ease",
                      }}
                    >
                      {BUDGET_LABELS[tier]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleGenerate}
                disabled={!commander.trim() || generating || !canGenerate}
                className="glass-button"
                style={{
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 25%, transparent) 0%, rgba(6,182,212,0.15) 100%)",
                  border: "1px solid color-mix(in srgb, var(--accent-purple) 40%, transparent)",
                  padding: "10px 20px", fontSize: "0.9rem", fontWeight: 700,
                  color: !commander.trim() ? "var(--text-muted)" : "var(--text-primary)",
                  cursor: !commander.trim() || generating || !canGenerate ? "not-allowed" : "pointer",
                  justifyContent: "center", gap: "8px",
                  opacity: !commander.trim() || !canGenerate ? 0.5 : 1,
                }}
              >
                {generating ? (
                  <><Loader size={15} style={{ animation: "spinner 0.8s linear infinite" }} /> Building deck…</>
                ) : (
                  <><Wand2 size={15} /> Generate 100-Card Deck</>
                )}
              </button>
              {!canGenerate && (
                <UpgradePrompt message="AI deck generation requires Pro." compact />
              )}
            </div>

            {/* Generated deck output */}
            {generatedDeck && (
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent-purple)" }}>
                    Generated Decklist
                  </h3>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={handleCopyDecklist}
                      className="glass-button"
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    >
                      {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Names</>}
                    </button>
                    <button
                      onClick={() => handleCopyMoxfield(extractCardNames(generatedDeck))}
                      className="glass-button"
                      style={{
                        padding: "6px 12px", fontSize: "0.78rem",
                        background: "rgba(16,185,129,0.08)",
                        borderColor: "rgba(16,185,129,0.25)",
                        color: "var(--accent-emerald)",
                      }}
                    >
                      <Copy size={12} /> Moxfield
                    </button>
                  </div>
                </div>

                <div className="chat-markdown" style={{ fontSize: "0.88rem" }}>
                  <ReactMarkdown
                    components={{
                      // Make card names in list items clickable
                      li: ({ children }) => (
                        <li>
                          {React.Children.map(children, child => {
                            if (typeof child === "string") {
                              return renderCardName(child.trim());
                            }
                            return child;
                          })}
                        </li>
                      ),
                    }}
                  >
                    {generatedDeck}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════
            IMPORT MODE
        ════════════════════════════════════════ */}
        {mode === "import" && (
          <>
            <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                Paste Decklist (MTGO / Moxfield format)
              </label>

              {/* URL import row */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="url"
                  className="glass-input"
                  placeholder="Paste deck export URL (Moxfield, Archidekt, Pastebin…)"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleFetchFromUrl()}
                  style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
                />
                <button
                  onClick={handleFetchFromUrl}
                  disabled={!importUrl.trim() || urlFetching}
                  className="glass-button"
                  style={{ padding: "8px 16px", fontSize: "0.82rem", flexShrink: 0 }}
                >
                  {urlFetching ? "Fetching…" : "Fetch"}
                </button>
              </div>
              {urlError && (
                <p style={{ fontSize: "0.75rem", color: "var(--accent-rose)", marginTop: "-4px" }}>
                  {urlError}
                </p>
              )}

              <div style={{ position: "relative" }}>
                <textarea
                  className="glass-input"
                  placeholder={"1 Sol Ring\n1 Command Tower\n1 Atraxa, Praetors' Voice\n..."}
                  value={rawDecklist}
                  onChange={e => { setRawDecklist(e.target.value); autoResize(e.target); }}
                  onFocus={e => { autoResize(e.target); e.target.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
                  rows={8}
                  style={{ width: "100%", resize: "none", fontFamily: "'Courier New', monospace", fontSize: "0.82rem", overflow: "hidden", minHeight: "160px", WebkitAppearance: "none", borderRadius: "8px", paddingBottom: "36px" }}
                />
                {!rawDecklist.trim() && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.readText().then(t => { if (t.trim()) setRawDecklist(t.trim()); }).catch(() => undefined)}
                    style={{ position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "5px", background: "color-mix(in srgb, var(--accent-purple) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)", borderRadius: "8px", color: "var(--accent-purple)", fontSize: "0.75rem", fontWeight: 600, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  >
                    <ClipboardPaste size={12} /> Paste from Clipboard
                  </button>
                )}
              </div>
              <button
                onClick={handleParseDecklist}
                disabled={!rawDecklist.trim() || !!fetchProgress}
                className="glass-button"
                style={{ padding: "9px 20px", fontSize: "0.88rem", fontWeight: 700, justifyContent: "center" }}
              >
                {fetchProgress ? (
                  <><Loader size={14} style={{ animation: "spinner 0.8s linear infinite" }} />
                  Fetching {fetchProgress.done}/{fetchProgress.total} cards…</>
                ) : (
                  <><Search size={14} /> Parse &amp; Fetch Cards</>
                )}
              </button>
            </div>

            {/* Card grid */}
            {importedCards.length > 0 && (
              <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Header row: count + cost + action buttons */}
                {(() => {
                  const found = importedCards.filter(Boolean) as ScryfallCard[];
                  const cost  = calcDeckCost(importedCards);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", justifyContent: "space-between" }}>
                      {/* Left: count + cost pill */}
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          {found.length} / {importedCards.length} cards found
                        </span>
                        {cost.priced > 0 && (
                          <div style={{
                            display: "flex", flexDirection: "column",
                            background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
                            borderRadius: "8px", padding: "4px 10px",
                          }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--accent-emerald)" }}>
                              ~${cost.total.toFixed(2)}
                            </span>
                            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                              avg ${(cost.total / cost.priced).toFixed(2)}/card
                              {cost.unpriced > 0 ? ` · ${cost.unpriced} no price` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Right: Moxfield copy + AI analyze */}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => handleCopyMoxfield(found.map(c => c.name))}
                          disabled={found.length === 0}
                          className="glass-button"
                          style={{
                            padding: "7px 12px", fontSize: "0.78rem",
                            background: "rgba(16,185,129,0.08)",
                            borderColor: "rgba(16,185,129,0.25)",
                            color: "var(--accent-emerald)",
                          }}
                        >
                          <Copy size={13} /> Moxfield
                        </button>
                        <button
                          onClick={handleAnalyzeImport}
                          disabled={analyzing || found.length === 0}
                          className="glass-button"
                          style={{
                            padding: "7px 14px", fontSize: "0.82rem", fontWeight: 700,
                            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 20%, transparent) 0%, rgba(6,182,212,0.1) 100%)",
                            borderColor: "color-mix(in srgb, var(--accent-purple) 35%, transparent)",
                          }}
                        >
                          {analyzing ? (
                            <><Loader size={13} style={{ animation: "spinner 0.8s linear infinite" }} /> Analyzing…</>
                          ) : (
                            <><Wand2 size={13} /> Analyze with AI</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 4-column grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: "8px",
                }}>
                  {importedCards.map((card, i) => (
                    card ? (
                      <div
                        key={card.id + i}
                        onClick={() => openCodexWith(card.name)}
                        title={card.name}
                        style={{
                          display: "flex", flexDirection: "column", gap: "4px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "8px", padding: "6px",
                          cursor: "pointer", transition: "background 0.15s ease",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      >
                        <img
                          src={getCardImage(card)}
                          alt={card.name}
                          style={{ width: "100%", borderRadius: "4px", objectFit: "cover", aspectRatio: "4/3" }}
                        />
                        <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {card.name}
                        </span>
                        <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
                          {card.type_line?.split(" — ")[0]}
                        </span>
                      </div>
                    ) : (
                      <div key={i} style={{
                        background: "rgba(244,63,94,0.05)",
                        border: "1px dashed rgba(244,63,94,0.2)",
                        borderRadius: "8px", padding: "10px 6px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                      }}>
                        <X size={16} color="var(--accent-rose)" style={{ opacity: 0.5 }} />
                        <span style={{ fontSize: "0.6rem", color: "var(--accent-rose)", opacity: 0.6, textAlign: "center" }}>Not found</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Color Spread + Mana Curve Charts */}
            {importedCards.filter(Boolean).length > 0 && (() => {
              const curve     = buildManaCurve(importedCards);
              const spread    = buildColorSpread(importedCards);
              const maxCurve  = Math.max(...Object.values(curve), 1);
              const maxSpread = Math.max(...Object.values(spread), 1);
              const totalSpells = Object.values(curve).reduce((a, b) => a + b, 0);
              const barColors = ["#94a3b8","#38bdf8","#34d399","#facc15","#f97316","#f43f5e","#a855f7"];
              const colorKeys = Object.keys(spread).filter(k => spread[k] > 0);
              return (
                <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* ── Color Identity Spread ── */}
                  {colorKeys.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-purple)" }}>🎨 Color Spread</h4>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>by color identity</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", height: "60px" }}>
                        {colorKeys.map(pip => {
                          const count = spread[pip];
                          const meta  = COLOR_META[pip];
                          return (
                            <div key={pip} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                              <span style={{ fontSize: "0.6rem", fontWeight: 700, color: meta.color }}>{count}</span>
                              <div style={{
                                width: "100%",
                                height: `${Math.max((count / maxSpread) * 40, 4)}px`,
                                background: meta.color,
                                borderRadius: "3px 3px 0 0",
                                opacity: 0.8,
                                transition: "height 0.3s ease",
                              }} />
                              <span style={{ fontSize: "0.65rem", color: meta.color, fontWeight: 700 }}>{pip}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Mana Curve ── */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-cyan)" }}>⚡ Mana Curve</h4>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{totalSpells} non-land spells</span>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", height: "72px" }}>
                      {Object.entries(curve).map(([cmc, count], i) => (
                        <div key={cmc} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          {count > 0 && (
                            <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--text-secondary)" }}>{count}</span>
                          )}
                          <div style={{
                            width: "100%",
                            height: `${Math.max((count / maxCurve) * 50, count > 0 ? 4 : 0)}px`,
                            background: barColors[i] ?? "var(--accent-purple)",
                            borderRadius: "4px 4px 0 0",
                            transition: "height 0.3s ease",
                            opacity: count === 0 ? 0.15 : 0.85,
                          }} />
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}>{cmc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* AI Analysis result */}
            {analysisResult && (
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Wand2 size={16} color="var(--accent-purple)" />
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent-purple)" }}>AI Analysis</h3>
                </div>
                <div className="chat-markdown" style={{ fontSize: "0.88rem" }}>
                  <ReactMarkdown>{analysisResult}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "8px",
              background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)",
              borderRadius: "10px", padding: "12px 14px", flexShrink: 0,
            }}>
              <AlertTriangle size={15} color="#eab308" style={{ flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                AI suggestions may include unreleased or incorrectly named cards. Always verify card legality on Scryfall before registering a deck.
              </p>
            </div>
          </>
        )}
        {/* ════════════════════════════════════════
            MY DECKS MODE
        ════════════════════════════════════════ */}
        {mode === "decks" && (
          <>
            {/* Add Deck button / form toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                {savedDecks.length === 0 ? "No saved decks yet." : `${savedDecks.length} saved deck${savedDecks.length > 1 ? "s" : ""}`}
                {!canCloudDecks && <span style={{ color: "var(--text-muted)" }}> · 3 max on free</span>}
              </p>
              <button
                onClick={() => { resetDeckForm(); setShowAddForm(v => !v); }}
                disabled={!canCloudDecks && savedDecks.length >= 3 && !showAddForm}
                style={{
                  display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px",
                  borderRadius: "9px", cursor: (!canCloudDecks && savedDecks.length >= 3 && !showAddForm) ? "not-allowed" : "pointer",
                  background: showAddForm ? "color-mix(in srgb, var(--accent-purple) 15%, transparent)" : "color-mix(in srgb, var(--accent-purple) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent-purple) 35%, transparent)",
                  color: "var(--accent-purple)", fontSize: "0.82rem", fontWeight: 700,
                  transition: "all 0.15s ease",
                  opacity: (!canCloudDecks && savedDecks.length >= 3 && !showAddForm) ? 0.4 : 1,
                }}
              >
                <PlusCircle size={14} /> {showAddForm ? "Cancel" : "Add Deck"}
              </button>
            </div>
            {!canCloudDecks && savedDecks.length >= 3 && !showAddForm && (
              <UpgradePrompt message="You've reached the 3-deck limit on the free plan. Upgrade for unlimited decks and cloud sync." compact />
            )}

            {/* Add / Edit form */}
            {showAddForm && (
              <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)" }}>
                  {editingDeckId ? "Edit Deck" : "New Deck"}
                </p>

                {/* Deck Name */}
                <div>
                  <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "4px", fontWeight: 700 }}>Deck Name *</label>
                  <input
                    type="text" value={newDeckName} onChange={e => setNewDeckName(e.target.value)}
                    placeholder="e.g. Atraxa Infect" maxLength={40}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = "var(--accent-purple)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>

                {/* Commander autocomplete */}
                <div style={{ position: "relative" }}>
                  <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "4px", fontWeight: 700 }}>Commander *</label>
                  <input
                    type="text" value={newDeckCmd}
                    onChange={e => { setNewDeckCmd(e.target.value); }}
                    placeholder="e.g. Atraxa, Praetors' Voice"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", fontSize: "0.88rem", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = "var(--accent-purple)")}
                    onBlur={e => { setTimeout(() => setDeckCmdSugs([]), 150); (e.target.style.borderColor = "rgba(255,255,255,0.1)"); }}
                  />
                  {deckCmdSugs.length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 30, background: "var(--bg-dark)", border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", boxShadow: "0 6px 24px rgba(0,0,0,0.5)" }}>
                      {deckCmdSugs.map((s, i) => (
                        <button key={i} onMouseDown={() => { setNewDeckCmd(s); setDeckCmdSugs([]); }}
                          style={{ display: "block", width: "100%", padding: "7px 12px", background: "transparent", border: "none", color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "left", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >{s}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Partner (optional) */}
                <div style={{ position: "relative" }}>
                  <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "4px", fontWeight: 700 }}>Partner <span style={{ fontWeight: 400 }}>(optional)</span></label>
                  <input
                    type="text" value={newDeckPartner}
                    onChange={e => setNewDeckPartner(e.target.value)}
                    placeholder="Partner commander name"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", fontSize: "0.88rem", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = "var(--accent-purple)")}
                    onBlur={e => { setTimeout(() => setDeckPartnerSugs([]), 150); (e.target.style.borderColor = "rgba(255,255,255,0.1)"); }}
                  />
                  {deckPartnerSugs.length > 0 && (
                    <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 30, background: "var(--bg-dark)", border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", boxShadow: "0 6px 24px rgba(0,0,0,0.5)" }}>
                      {deckPartnerSugs.map((s, i) => (
                        <button key={i} onMouseDown={() => { setNewDeckPartner(s); setDeckPartnerSugs([]); }}
                          style={{ display: "block", width: "100%", padding: "7px 12px", background: "transparent", border: "none", color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "left", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >{s}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", marginBottom: "4px", fontWeight: 700 }}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    value={newDeckNotes}
                    onChange={e => { setNewDeckNotes(e.target.value); autoResize(e.target); }}
                    placeholder="Strategy notes, combos, budget info…" rows={2} maxLength={200}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", fontSize: "0.82rem", outline: "none", resize: "none", boxSizing: "border-box", overflow: "hidden", minHeight: "56px", WebkitAppearance: "none" }}
                    onFocus={e => { e.target.style.borderColor = "var(--accent-purple)"; autoResize(e.target); e.target.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <button onClick={resetDeckForm} style={{ padding: "8px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", fontSize: "0.82rem", cursor: "pointer" }}>Cancel</button>
                  <button
                    onClick={handleSaveDeck}
                    style={{
                      padding: "8px 16px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
                      background: newDeckName.trim() && newDeckCmd.trim() ? "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 30%, transparent), rgba(6,182,212,0.2))" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${newDeckName.trim() && newDeckCmd.trim() ? "color-mix(in srgb, var(--accent-purple) 50%, transparent)" : "rgba(255,255,255,0.08)"}`,
                      color: newDeckName.trim() && newDeckCmd.trim() ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    <Check size={13} style={{ marginRight: "5px" }} />{editingDeckId ? "Save Changes" : "Save Deck"}
                  </button>
                </div>
              </div>
            )}

            {/* Deck cards */}
            {savedDecks.map(deck => {
              const winRate = deck.gamesPlayed > 0 ? Math.round((deck.wins / deck.gamesPlayed) * 100) : null;
              const thumbUrl = deckThumbs[deck.id];
              return (
                <div key={deck.id} className="glass-panel" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* Commander art thumbnail */}
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={deck.commanderName} style={{ width: "52px", height: "37px", borderRadius: "6px", objectFit: "cover", objectPosition: "center 15%", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }} />
                  ) : (
                    <div style={{ width: "52px", height: "37px", borderRadius: "6px", background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <BookMarked size={16} color="var(--accent-purple)" />
                    </div>
                  )}
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{deck.name}</p>
                      {deck.cards && deck.cards.length > 0 && (() => {
                        const total = deck.cards.reduce((s, c) => s + c.quantity, 0);
                        return (
                          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: total === 100 ? "var(--accent-emerald)" : "var(--text-muted)", background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "1px 6px", flexShrink: 0 }}>
                            {total}/100
                          </span>
                        );
                      })()}
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      ⚔️ {deck.commanderName}{deck.partnerName ? ` + ${deck.partnerName}` : ""}
                    </p>
                    {deck.notes && <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deck.notes}</p>}
                  </div>
                  {/* Stats */}
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: "60px" }}>
                    {winRate !== null ? (
                      <>
                        <span style={{
                          fontSize: "0.82rem", fontWeight: 800,
                          color: winRate >= 50 ? "#10b981" : winRate >= 33 ? "#f59e0b" : "#ef4444",
                        }}>{winRate}%</span>
                        <p style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{deck.wins}W / {deck.gamesPlayed - deck.wins}L</p>
                        {/* Win-rate progress bar */}
                        <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", marginTop: "5px", overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${winRate}%`,
                            background: winRate >= 50 ? "var(--accent-emerald)" : winRate >= 33 ? "#f59e0b" : "var(--accent-rose)",
                            borderRadius: "2px",
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>No games</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                    <button
                      onClick={() => setOpenDeckId(deck.id)}
                      aria-label={`Edit cards in ${deck.name}`}
                      title="Edit cards"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "3px", display: "flex" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--accent-cyan)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                      <ListOrdered size={13} />
                    </button>
                    <button
                      onClick={() => setOpenRecommendDeckId(deck.id)}
                      aria-label={`AI recommendations for ${deck.name}`}
                      title="AI recommendations"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "3px", display: "flex" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--accent-purple)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                      <Sparkles size={13} />
                    </button>
                    <button onClick={() => handleEditDeck(deck)} aria-label={`Edit ${deck.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "3px", display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = "#a78bfa"} onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDeleteDeck(deck.id)} aria-label={`Delete ${deck.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "3px", display: "flex" }} onMouseEnter={e => e.currentTarget.style.color = "#ef4444"} onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            {savedDecks.length === 0 && !showAddForm && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
                <BookMarked size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
                <p style={{ fontSize: "0.88rem" }}>No decks saved yet.</p>
                <p style={{ fontSize: "0.78rem", marginTop: "4px" }}>Add your first deck to track win rates and fill in your commander quickly during Game Night.</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "8px" }}>
                  Win tracking starts automatically when you link a deck to a player in Game Night or Life Counter.
                </p>
              </div>
            )}
          </>
        )}

      </div>

      </> /* end !openDeckId && !openRecommendDeckId */}
    </div>
  );
};
