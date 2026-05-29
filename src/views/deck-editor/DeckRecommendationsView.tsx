import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Wand2, Loader, Plus, Minus, Check, AlertTriangle } from "lucide-react";
import type { SavedDeck, DeckCard } from "../../types/deck";
import type { ScryfallCard } from "../../services/scryfall";
import { searchCardFuzzy, getCardImage } from "../../services/scryfall";
import { askGeminiDeckOptimizer } from "../../services/gemini";
import { updateDeck, loadDecks } from "../../services/decks";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecommendedCard {
  name: string;
  reason: string;
  card: ScryfallCard | null;   // null while loading / not found
  fetched: boolean;
  added?: boolean;             // track "added to deck" button state
  removed?: boolean;           // track "removed from deck" button state
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract `- **Card Name** — reason` lines from AI markdown output. */
function parseSection(markdown: string, header: string): { name: string; reason: string }[] {
  const headerRe = new RegExp(`##[\\s\\S]*?${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const nextHeaderRe = /^##\s/m;

  const headerMatch = markdown.match(headerRe);
  if (!headerMatch || headerMatch.index == null) return [];

  const afterHeader = markdown.slice(headerMatch.index + headerMatch[0].length);
  const nextMatch   = afterHeader.match(nextHeaderRe);
  const section     = nextMatch ? afterHeader.slice(0, nextMatch.index) : afterHeader;

  const results: { name: string; reason: string }[] = [];
  const lineRe = /^-\s+\*\*([^*]+)\*\*\s*[—–-]\s*(.+)/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section)) !== null) {
    results.push({ name: m[1].trim(), reason: m[2].trim() });
  }
  return results;
}

function isErrorResponse(text: string) {
  return text.startsWith("❌");
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  deck: SavedDeck;
  apiKey: string;
  geminiModel: string;
  onBack: () => void;
  onDeckUpdated: () => void;  // tells DeckBuilder to reload savedDecks
  openCodexWith: (name: string) => void;
}

export const DeckRecommendationsView: React.FC<Props> = ({
  deck, apiKey, geminiModel, onBack, onDeckUpdated, openCodexWith,
}) => {
  const [loading, setLoading]     = useState(false);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [cuts, setCuts]           = useState<RecommendedCard[]>([]);
  const [adds, setAdds]           = useState<RecommendedCard[]>([]);
  const didFetch = useRef(false);

  const cardNames: string[] = (deck.cards ?? []).flatMap(c =>
    Array(c.quantity).fill(c.name)
  );
  const hasCardList = (deck.cards ?? []).length > 0;

  // ── Analyse ───────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    setLoading(true);
    setRawResult(null);
    setCuts([]); setAdds([]);
    didFetch.current = false;

    const result = await askGeminiDeckOptimizer(
      deck.commanderName,
      cardNames,
      apiKey,
      geminiModel,
    );
    setRawResult(result);
    setLoading(false);
  };

  // ── Parse + image-fetch when result arrives ───────────────────────────────

  useEffect(() => {
    if (!rawResult || isErrorResponse(rawResult) || didFetch.current) return;
    didFetch.current = true;

    const parsedCuts = parseSection(rawResult, "Cards to Cut");
    const parsedAdds = parseSection(rawResult, "Cards to Add");

    const makeStubs = (items: { name: string; reason: string }[]): RecommendedCard[] =>
      items.map(i => ({ name: i.name, reason: i.reason, card: null, fetched: false }));

    setCuts(makeStubs(parsedCuts));
    setAdds(makeStubs(parsedAdds));

    // Fetch Scryfall data for each card asynchronously
    parsedCuts.forEach(({ name }, idx) => {
      searchCardFuzzy(name).then(card => {
        setCuts(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], card: card ?? null, fetched: true };
          return next;
        });
      });
    });
    parsedAdds.forEach(({ name }, idx) => {
      searchCardFuzzy(name).then(card => {
        setAdds(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], card: card ?? null, fetched: true };
          return next;
        });
      });
    });
  }, [rawResult]);

  // ── One-click "Add to deck" ───────────────────────────────────────────────

  const handleAddToDeck = (item: RecommendedCard) => {
    const currentDecks = loadDecks();
    const current = currentDecks.find(d => d.id === deck.id);
    if (!current) return;

    const existing = (current.cards ?? []).findIndex(
      c => c.name.toLowerCase() === item.name.toLowerCase()
    );
    let newCards: DeckCard[];
    if (existing >= 0) {
      newCards = current.cards!.map((c, i) =>
        i === existing ? { ...c, quantity: c.quantity + 1 } : c
      );
    } else {
      const typeLine = item.card?.type_line ?? "";
      const category = inferCategory(typeLine);
      newCards = [
        ...(current.cards ?? []),
        { name: item.card?.name ?? item.name, quantity: 1, category, imageUrl: item.card ? getCardImage(item.card) : undefined },
      ];
    }
    updateDeck(deck.id, { cards: newCards });
    onDeckUpdated();

    setAdds(prev => prev.map(a => a.name === item.name ? { ...a, added: true } : a));
    setTimeout(() => {
      setAdds(prev => prev.map(a => a.name === item.name ? { ...a, added: false } : a));
    }, 2000);
  };

  const handleRemoveFromDeck = (item: RecommendedCard) => {
    const currentDecks = loadDecks();
    const current = currentDecks.find(d => d.id === deck.id);
    if (!current) return;

    const newCards = (current.cards ?? []).filter(
      c => c.name.toLowerCase() !== item.name.toLowerCase()
    );
    updateDeck(deck.id, { cards: newCards });
    onDeckUpdated();

    setCuts(prev => prev.map(c => c.name === item.name ? { ...c, removed: true } : c));
    setTimeout(() => {
      setCuts(prev => prev.map(c => c.name === item.name ? { ...c, removed: false } : c));
    }, 2000);
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const CardRow = ({
    item,
    action,
  }: {
    item: RecommendedCard;
    action: "add" | "remove";
  }) => (
    <div style={{
      display: "flex", gap: "10px",
      padding: "10px", borderRadius: "10px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      {/* Art thumbnail */}
      <div style={{ flexShrink: 0, width: "48px" }}>
        {item.fetched && item.card ? (
          <img
            src={getCardImage(item.card)}
            alt={item.name}
            onClick={() => openCodexWith(item.name)}
            style={{ width: "48px", height: "68px", borderRadius: "4px", objectFit: "cover", cursor: "pointer" }}
          />
        ) : (
          <div style={{
            width: "48px", height: "68px", borderRadius: "4px",
            background: "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!item.fetched && <Loader size={14} color="var(--text-muted)" style={{ animation: "spinner 0.8s linear infinite" }} />}
          </div>
        )}
      </div>

      {/* Name + type + reason */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
        <div
          onClick={() => openCodexWith(item.name)}
          style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.2 }}
        >
          {item.name}
        </div>
        {item.card && (
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.card.type_line}
          </div>
        )}
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4, margin: 0 }}>
          {item.reason}
        </p>
      </div>

      {/* Action button */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        {action === "add" ? (
          <button
            onClick={() => handleAddToDeck(item)}
            disabled={!hasCardList}
            title={hasCardList ? "Add to deck" : "Open deck editor to add cards first"}
            style={{
              background: item.added ? "rgba(16,185,129,0.15)" : "rgba(139,92,246,0.12)",
              border: `1px solid ${item.added ? "rgba(16,185,129,0.3)" : "rgba(139,92,246,0.3)"}`,
              borderRadius: "8px", padding: "6px 10px", cursor: hasCardList ? "pointer" : "not-allowed",
              color: item.added ? "var(--accent-emerald)" : "var(--accent-purple)",
              fontSize: "0.72rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px",
              opacity: hasCardList ? 1 : 0.4, transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {item.added ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add</>}
          </button>
        ) : (
          <button
            onClick={() => handleRemoveFromDeck(item)}
            disabled={!hasCardList}
            title={hasCardList ? "Remove from deck" : "Open deck editor to manage cards first"}
            style={{
              background: item.removed ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.08)",
              border: `1px solid ${item.removed ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.2)"}`,
              borderRadius: "8px", padding: "6px 10px", cursor: hasCardList ? "pointer" : "not-allowed",
              color: item.removed ? "var(--accent-emerald)" : "var(--accent-rose)",
              fontSize: "0.72rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px",
              opacity: hasCardList ? 1 : 0.4, transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {item.removed ? <><Check size={11} /> Done</> : <><Minus size={11} /> Cut</>}
          </button>
        )}
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        paddingBottom: "12px", borderBottom: "1px solid var(--border-color)",
        flexShrink: 0, marginBottom: "12px",
      }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", padding: "6px", borderRadius: "8px", flexShrink: 0 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {deck.name}
          </h3>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: 0 }}>
            ⚔️ {deck.commanderName}{deck.partnerName ? ` + ${deck.partnerName}` : ""}
            {hasCardList && ` · ${cardNames.length} cards`}
          </p>
        </div>
        <Wand2 size={18} color="var(--accent-purple)" style={{ flexShrink: 0 }} />
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Context note + Analyze button */}
        <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <Wand2 size={16} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
              {hasCardList
                ? `Analyzing your full ${cardNames.length}-card list for synergy gaps, redundancies, and high-impact upgrades.`
                : "No card list saved yet — recommendations will be based on your commander's color identity and common strategies. Add cards via the deck editor for personalized suggestions."
              }
            </p>
          </div>

          {!hasCardList && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "7px", background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "8px", padding: "10px 12px" }}>
              <AlertTriangle size={13} color="#eab308" style={{ flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                Tap the list icon on your deck to add cards — then come back for fully personalized recommendations.
              </p>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="glass-button"
            style={{
              justifyContent: "center", padding: "10px 20px", fontWeight: 700,
              background: "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(6,182,212,0.15) 100%)",
              borderColor: "rgba(139,92,246,0.4)",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading
              ? <><Loader size={15} style={{ animation: "spinner 0.8s linear infinite" }} /> Analyzing…</>
              : <><Wand2 size={15} /> {rawResult ? "Re-analyze" : "Get AI Recommendations"}</>
            }
          </button>
        </div>

        {/* Loading animation */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "32px 20px", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {[0, 0.2, 0.4].map((delay, i) => (
                <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i % 2 === 0 ? "var(--accent-purple)" : "var(--accent-cyan)", animation: `bounce-dots 1.4s infinite ease-in-out both ${delay}s` }} />
              ))}
            </div>
            <p style={{ fontSize: "0.8rem" }}>Consulting the oracle…</p>
          </div>
        )}

        {/* Error */}
        {rawResult && isErrorResponse(rawResult) && (
          <div style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "10px", padding: "14px 16px", fontSize: "0.85rem", color: "var(--accent-rose)" }}>
            {rawResult.replace("❌ ", "")}
          </div>
        )}

        {/* Results */}
        {!loading && rawResult && !isErrorResponse(rawResult) && (
          <>
            {/* Cuts */}
            {cuts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--accent-rose)", letterSpacing: "0.5px", textTransform: "uppercase" }}>✂️ Cards to Cut</span>
                  <span style={{ fontSize: "0.68rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "10px", padding: "1px 8px", color: "var(--accent-rose)" }}>{cuts.length}</span>
                  {!hasCardList && <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>(no deck list — buttons disabled)</span>}
                </div>
                {cuts.map(item => (
                  <CardRow key={item.name} item={item} action="remove" />
                ))}
              </div>
            )}

            {/* Adds */}
            {adds.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--accent-emerald)", letterSpacing: "0.5px", textTransform: "uppercase" }}>➕ Cards to Add</span>
                  <span style={{ fontSize: "0.68rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "10px", padding: "1px 8px", color: "var(--accent-emerald)" }}>{adds.length}</span>
                  {!hasCardList && <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>(add cards to deck to enable one-click add)</span>}
                </div>
                {adds.map(item => (
                  <CardRow key={item.name} item={item} action="add" />
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "7px", background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)", borderRadius: "8px", padding: "10px 12px" }}>
              <AlertTriangle size={13} color="#eab308" style={{ flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                AI recommendations may suggest unreleased or misnamed cards. Verify on Scryfall before purchasing.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Category inference (mirrors DeckEditorView) ───────────────────────────────
function inferCategory(typeLine: string): string {
  if (typeLine.includes("Land"))         return "Lands";
  if (typeLine.includes("Creature"))     return "Creatures";
  if (typeLine.includes("Planeswalker")) return "Planeswalkers";
  if (typeLine.includes("Instant"))      return "Instants";
  if (typeLine.includes("Sorcery"))      return "Sorceries";
  if (typeLine.includes("Enchantment"))  return "Enchantments";
  if (typeLine.includes("Artifact"))     return "Artifacts";
  return "Other";
}
