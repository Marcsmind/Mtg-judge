import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Wand2, Upload, Search, Copy, Check, Loader, AlertTriangle, X
} from "lucide-react";
import {
  autocompleteCard,
  searchCardFuzzy,
  getCardImage,
} from "../services/scryfall";
import type { ScryfallCard } from "../services/scryfall";
import { askGeminiDeckBuilder } from "../services/gemini";

interface DeckBuilderProps {
  apiKey: string;
  geminiModel: string;
  openCodexWith: (name: string) => void;
}

type DeckMode = "generate" | "import";
type BudgetTier = "any" | "budget" | "competitive";

const BUDGET_LABELS: Record<BudgetTier, string> = {
  any:         "Any Budget",
  budget:      "Budget (<$3/card avg)",
  competitive: "Competitive",
};

/** Strip quantity prefix from a line: "1 Sol Ring", "4x Forest" → card name */
function parseDecklist(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split("\n")
    .map(line => line.trim().replace(/^\d+[xX]?\s+/, "").trim())
    .filter(line => line.length > 1)
    .filter(line => {
      if (seen.has(line.toLowerCase())) return false;
      seen.add(line.toLowerCase());
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
  }, [commander, strategy, budget, apiKey, geminiModel]);

  const handleCopyDecklist = () => {
    if (!generatedDeck) return;
    const names = extractCardNames(generatedDeck);
    navigator.clipboard.writeText(names.join("\n")).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Import mode ──

  /** Fetch cards with max 5 concurrent requests */
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
    }

    setFetchProgress(null);
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 48px)", overflow: "hidden" }}>

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
        maxWidth: "340px",
      }}>
        {(["generate", "import"] as DeckMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: "7px", border: "none",
              background: mode === m ? "var(--accent-purple)" : "transparent",
              color: mode === m ? "#fff" : "var(--text-secondary)",
              fontWeight: mode === m ? 700 : 500,
              fontSize: "0.85rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              transition: "all 0.15s ease",
            }}
          >
            {m === "generate" ? <Wand2 size={13} /> : <Upload size={13} />}
            {m === "generate" ? "AI Generate" : "Import List"}
          </button>
        ))}
      </div>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>

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
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.15)"; e.currentTarget.style.color = "var(--text-primary)"; }}
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
                  onChange={e => setStrategy(e.target.value)}
                  rows={2}
                  style={{ width: "100%", resize: "vertical", minHeight: "60px", fontFamily: "inherit" }}
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
                        background: budget === tier ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                        color: budget === tier ? "var(--accent-purple)" : "var(--text-secondary)",
                        fontWeight: budget === tier ? 700 : 500,
                        border: `1px solid ${budget === tier ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"}`,
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
                disabled={!commander.trim() || generating}
                className="glass-button"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(6,182,212,0.15) 100%)",
                  border: "1px solid rgba(139,92,246,0.4)",
                  padding: "10px 20px", fontSize: "0.9rem", fontWeight: 700,
                  color: !commander.trim() ? "var(--text-muted)" : "var(--text-primary)",
                  cursor: !commander.trim() || generating ? "not-allowed" : "pointer",
                  justifyContent: "center", gap: "8px",
                  opacity: !commander.trim() ? 0.5 : 1,
                }}
              >
                {generating ? (
                  <><Loader size={15} style={{ animation: "spinner 0.8s linear infinite" }} /> Building deck…</>
                ) : (
                  <><Wand2 size={15} /> Generate 100-Card Deck</>
                )}
              </button>
            </div>

            {/* Generated deck output */}
            {generatedDeck && (
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent-purple)" }}>
                    Generated Decklist
                  </h3>
                  <button
                    onClick={handleCopyDecklist}
                    className="glass-button"
                    style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  >
                    {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Names</>}
                  </button>
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
              <textarea
                className="glass-input"
                placeholder={"1 Sol Ring\n1 Command Tower\n1 Atraxa, Praetors' Voice\n..."}
                value={rawDecklist}
                onChange={e => setRawDecklist(e.target.value)}
                rows={8}
                style={{ width: "100%", resize: "vertical", fontFamily: "'Courier New', monospace", fontSize: "0.82rem" }}
              />
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    {importedCards.filter(Boolean).length} / {importedCards.length} cards found
                  </span>
                  <button
                    onClick={handleAnalyzeImport}
                    disabled={analyzing || importedCards.filter(Boolean).length === 0}
                    className="glass-button"
                    style={{
                      padding: "7px 14px", fontSize: "0.82rem", fontWeight: 700,
                      background: "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(6,182,212,0.1) 100%)",
                      borderColor: "rgba(139,92,246,0.35)",
                    }}
                  >
                    {analyzing ? (
                      <><Loader size={13} style={{ animation: "spinner 0.8s linear infinite" }} /> Analyzing…</>
                    ) : (
                      <><Wand2 size={13} /> Analyze with AI</>
                    )}
                  </button>
                </div>

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
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.1)"}
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
      </div>
    </div>
  );
};
