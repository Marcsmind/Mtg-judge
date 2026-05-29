import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Search, X, Plus, Minus, Loader2,
  ChevronRight, Trash2, Check, ListOrdered, RefreshCw, ClipboardPaste,
} from "lucide-react";
import type { SavedDeck, DeckCard } from "../../types/deck";
import type { ScryfallCard } from "../../services/scryfall";
import { autocompleteCard, searchCardFuzzy, getCardImage } from "../../services/scryfall";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Commander", "Creatures", "Planeswalkers",
  "Instants", "Sorceries", "Artifacts", "Enchantments", "Lands", "Other",
] as const;
type Category = (typeof CATEGORIES)[number];

// Accent color per category for the section header
const CAT_COLOR: Record<string, string> = {
  Commander:     "var(--accent-gold)",
  Creatures:     "var(--accent-emerald)",
  Planeswalkers: "var(--accent-purple)",
  Instants:      "var(--accent-cyan)",
  Sorceries:     "#f97316",
  Artifacts:     "#94a3b8",
  Enchantments:  "#f472b6",
  Lands:         "#a78bfa",
  Other:         "var(--text-muted)",
};

function inferCategory(typeLine: string): Category {
  if (typeLine.includes("Land"))        return "Lands";
  if (typeLine.includes("Creature"))    return "Creatures";
  if (typeLine.includes("Planeswalker")) return "Planeswalkers";
  if (typeLine.includes("Instant"))     return "Instants";
  if (typeLine.includes("Sorcery"))     return "Sorceries";
  if (typeLine.includes("Enchantment")) return "Enchantments";
  if (typeLine.includes("Artifact"))    return "Artifacts";
  return "Other";
}

function cycleCategory(current: string): Category {
  const idx = CATEGORIES.indexOf(current as Category);
  return CATEGORIES[(idx + 1) % CATEGORIES.length];
}

/** Parse an MTGO / Moxfield / MTGA decklist into name + quantity pairs. */
function parseBulkList(raw: string): { name: string; quantity: number }[] {
  const indexByName = new Map<string, number>();
  const out: { name: string; quantity: number }[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !/^\d/.test(trimmed)) continue;
    const match = trimmed.match(/^(\d+)[xX]?\s+(.+?)(?:\s*\([A-Z0-9]{2,6}\)\s*\d+.*)?$/i);
    if (!match) continue;
    const qty  = Math.max(1, parseInt(match[1], 10));
    const name = match[2].trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = indexByName.get(key);
    if (existing !== undefined) {
      out[existing].quantity += qty; // accumulate duplicates instead of discarding
    } else {
      indexByName.set(key, out.length);
      out.push({ name, quantity: qty });
    }
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DeckEditorViewProps {
  deck: SavedDeck;
  onSave: (cards: DeckCard[]) => void;
  onBack: () => void;
  openCodexWith: (name: string) => void;
}

export const DeckEditorView: React.FC<DeckEditorViewProps> = ({
  deck, onSave, onBack, openCodexWith,
}) => {
  const [cards, setCards]               = useState<DeckCard[]>(deck.cards ?? []);
  const [searchQuery, setSearchQuery]   = useState("");
  const [acNames, setAcNames]           = useState<string[]>([]);
  const [acResults, setAcResults]       = useState<ScryfallCard[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [addLoading, setAddLoading]     = useState(false);
  const [showBulk, setShowBulk]         = useState(false);
  const [bulkText, setBulkText]         = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [saved, setSaved]               = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [resyncing, setResyncing]       = useState(false);
  const [resyncProgress, setResyncProgress] = useState<{ done: number; total: number } | null>(null);

  const searchRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef     = useRef<AbortController | null>(null);

  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);

  // ── Inline card search (same pattern as CardTagBar) ──────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAcNames([]); setAcResults([]); setSearching(false);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setSearching(true); setAcNames([]); setAcResults([]);

    const timer = setTimeout(async () => {
      try {
        const names = await autocompleteCard(searchQuery, signal);
        if (signal.aborted) return;
        setAcNames(names);
        if (!names.length) { setSearching(false); return; }

        const top  = names.slice(0, 10);
        const q    = top.map(n => `!"${n}"`).join(" or ");
        const res  = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`,
          { signal }
        );
        if (!res.ok) { if (!signal.aborted) setSearching(false); return; }
        const data = await res.json();
        const sorted = ((data.data ?? []) as ScryfallCard[]).sort(
          (a, b) => top.indexOf(a.name) - top.indexOf(b.name)
        );
        if (!signal.aborted) { setAcResults(sorted); setSearching(false); }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on outside click/touch
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  // ── Card manipulation ─────────────────────────────────────────────────────

  const addCard = useCallback((name: string, typeLine: string, imageUrl?: string) => {
    setCards(prev => {
      const idx = prev.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { name, quantity: 1, category: inferCategory(typeLine), imageUrl }];
    });
    setSearchQuery(""); setAcNames([]); setAcResults([]); setSearchOpen(false);
  }, []);

  const handleSelectCard = useCallback((card: ScryfallCard) => {
    addCard(card.name, card.type_line ?? "", getCardImage(card));
  }, [addCard]);

  const handleSelectName = useCallback(async (name: string) => {
    setAddLoading(true);
    setSearchQuery(""); setAcNames([]); setAcResults([]); setSearchOpen(false);
    const card = await searchCardFuzzy(name);
    addCard(card ? card.name : name, card?.type_line ?? "", card ? getCardImage(card) : undefined);
    setAddLoading(false);
  }, [addCard]);

  const removeCard = (name: string) =>
    setCards(prev => prev.filter(c => c.name !== name));

  const updateQty = (name: string, delta: number) =>
    setCards(prev => prev.map(c =>
      c.name !== name ? c : { ...c, quantity: Math.max(1, c.quantity + delta) }
    ));

  const cycleCat = (name: string) =>
    setCards(prev => prev.map(c =>
      c.name !== name ? c : { ...c, category: cycleCategory(c.category) }
    ));

  // ── Bulk import ────────────────────────────────────────────────────────────

  const handleBulkImport = async () => {
    const parsed = parseBulkList(bulkText);
    if (!parsed.length) return;

    setBulkImporting(true);
    setBulkProgress({ done: 0, total: parsed.length });

    // Resolve all names → ScryfallCard|null, respecting Scryfall's 10 req/sec limit
    const BATCH = 5;
    const resolved: (ScryfallCard | null)[] = new Array(parsed.length).fill(null);

    for (let i = 0; i < parsed.length; i += BATCH) {
      const slice = parsed.slice(i, i + BATCH);
      const fetched = await Promise.allSettled(slice.map(p => searchCardFuzzy(p.name)));
      fetched.forEach((r, j) => { resolved[i + j] = r.status === "fulfilled" ? r.value : null; });
      setBulkProgress({ done: Math.min(i + BATCH, parsed.length), total: parsed.length });
      // 100ms pause keeps us well under Scryfall's rate limit (especially when cache is warm and batches finish fast)
      if (i + BATCH < parsed.length) await new Promise(r => setTimeout(r, 100));
    }

    // Single retry pass for any cards that returned null (transient failure / rate limit hit)
    const retryIdxs = resolved.map((r, i) => (r === null ? i : -1)).filter(i => i >= 0);
    if (retryIdxs.length > 0) {
      await new Promise(r => setTimeout(r, 300));
      for (let i = 0; i < retryIdxs.length; i += BATCH) {
        const idxSlice = retryIdxs.slice(i, i + BATCH);
        const fetched = await Promise.allSettled(idxSlice.map(idx => searchCardFuzzy(parsed[idx].name)));
        fetched.forEach((r, j) => {
          if (r.status === "fulfilled" && r.value) resolved[idxSlice[j]] = r.value;
        });
        if (i + BATCH < retryIdxs.length) await new Promise(r => setTimeout(r, 100));
      }
    }

    const working: DeckCard[] = [...cards];
    resolved.forEach((card, i) => {
      const { name, quantity } = parsed[i];
      const existIdx = working.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
      const imageUrl  = card ? getCardImage(card) : undefined;
      const category  = card ? inferCategory(card.type_line ?? "") : "Other";
      const canonical = card ? card.name : name;

      if (existIdx >= 0) {
        working[existIdx] = { ...working[existIdx], quantity: working[existIdx].quantity + quantity };
      } else {
        working.push({ name: canonical, quantity, category, imageUrl });
      }
    });

    setCards(working);
    setBulkImporting(false);
    setBulkProgress(null);
    setBulkText("");
    setShowBulk(false);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    onSave(cards);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearDeck = () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 3000); return; }
    setCards([]);
    setClearConfirm(false);
  };

  const handleResync = async () => {
    // Re-fetch any card that is in "Other" category or is missing an image
    const needsSync = cards.filter(c => c.category === "Other" || !c.imageUrl);
    if (!needsSync.length) return;
    setResyncing(true);
    setResyncProgress({ done: 0, total: needsSync.length });

    const BATCH = 5;
    const updates = new Map<string, { category: string; imageUrl?: string; name: string }>();

    for (let i = 0; i < needsSync.length; i += BATCH) {
      const slice = needsSync.slice(i, i + BATCH);
      const fetched = await Promise.allSettled(slice.map(c => searchCardFuzzy(c.name)));
      fetched.forEach((r, j) => {
        const original = slice[j];
        if (r.status === "fulfilled" && r.value) {
          const card = r.value;
          updates.set(original.name.toLowerCase(), {
            name: card.name,
            category: inferCategory(card.type_line ?? ""),
            imageUrl: getCardImage(card),
          });
        }
      });
      setResyncProgress({ done: Math.min(i + BATCH, needsSync.length), total: needsSync.length });
      if (i + BATCH < needsSync.length) await new Promise(r => setTimeout(r, 100));
    }

    setCards(prev => prev.map(c => {
      const update = updates.get(c.name.toLowerCase());
      if (!update) return c;
      return { ...c, name: update.name, category: update.category, imageUrl: update.imageUrl };
    }));
    setResyncing(false);
    setResyncProgress(null);
  };

  // ── Group cards by category ────────────────────────────────────────────────

  const grouped = CATEGORIES.reduce<Record<string, DeckCard[]>>((acc, cat) => {
    const inCat = cards.filter(c => c.category === cat);
    if (inCat.length) acc[cat] = inCat;
    return acc;
  }, {});

  const showDropdown = searchOpen && searchQuery.trim().length >= 2;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header ── */}
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
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            ⚔️ {deck.commanderName}{deck.partnerName ? ` + ${deck.partnerName}` : ""}
          </p>
        </div>
        {/* Card count badge */}
        <div style={{
          flexShrink: 0,
          background: totalCards === 100 ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${totalCards === 100 ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: "20px", padding: "4px 12px",
          fontSize: "0.8rem", fontWeight: 700,
          color: totalCards === 100 ? "var(--accent-emerald)" : totalCards > 100 ? "var(--accent-rose)" : "var(--text-secondary)",
        }}>
          {totalCards}/100
        </div>
      </div>

      {/* ── Add card section ── */}
      <div style={{ flexShrink: 0, marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>

        {/* Inline search */}
        <div ref={containerRef} style={{ position: "relative" }}>
          <input
            ref={searchRef}
            type="text"
            className="glass-input"
            placeholder="Search card to add…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            style={{ width: "100%", paddingLeft: "36px", paddingRight: "36px", fontSize: "16px" }}
          />
          <Search size={14} color="var(--text-muted)"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          {addLoading || (searching && searchQuery.length >= 2) ? (
            <Loader2 size={14} className="spinner" color="var(--accent-purple)"
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            />
          ) : searchQuery.length > 0 ? (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setSearchQuery(""); setAcNames([]); setAcResults([]); searchRef.current?.focus(); }}
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", display: "flex" }}
            >
              <X size={14} />
            </button>
          ) : null}

          {/* Dropdown */}
          {showDropdown && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
              background: "rgba(10,8,20,0.97)", border: "1px solid var(--border-color)",
              borderRadius: "12px", zIndex: 200, maxHeight: "260px", overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", padding: "4px",
            }}>
              {searching && !acNames.length && (
                <div style={{ display: "flex", justifyContent: "center", padding: "18px" }}>
                  <Loader2 className="spinner" size={20} color="var(--accent-purple)" />
                </div>
              )}
              {!searching && !acNames.length && !acResults.length && (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "16px", fontSize: "0.85rem" }}>No cards found.</div>
              )}
              {/* Text-only names while images load */}
              {!acResults.length && acNames.map((name, i) => (
                <button key={`t-${i}`} type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelectName(name); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: "8px", cursor: "pointer", textAlign: "left", color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "Outfit, sans-serif", fontWeight: 500 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  {name}
                  {searching && i === 0 && <Loader2 size={12} className="spinner" color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                </button>
              ))}
              {/* Image results */}
              {acResults.map(card => (
                <button key={card.id} type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelectCard(card); }}
                  style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "8px 10px", background: "none", border: "none", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontFamily: "Outfit, sans-serif" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <img src={getCardImage(card)} alt={card.name}
                    style={{ width: "40px", height: "56px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.type_line}</div>
                  </div>
                  {card.mana_cost && (
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", flexShrink: 0 }}>{card.mana_cost}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bulk import toggle */}
        <button
          type="button"
          onClick={() => setShowBulk(v => !v)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "4px", padding: "0 2px" }}
        >
          <ChevronRight size={12} style={{ transform: showBulk ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
          Paste full decklist
        </button>

        {showBulk && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ position: "relative" }}>
              <textarea
                className="glass-input"
                placeholder={"1 Sol Ring\n1 Command Tower\n4 Birds of Paradise\n..."}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={5}
                style={{ width: "100%", resize: "none", fontFamily: "'Courier New', monospace", fontSize: "0.8rem", minHeight: "100px", WebkitAppearance: "none", borderRadius: "8px", paddingBottom: "36px" }}
              />
              {!bulkText.trim() && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.readText().then(t => { if (t.trim()) setBulkText(t.trim()); }).catch(() => undefined)}
                  style={{ position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "5px", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "8px", color: "var(--accent-purple)", fontSize: "0.75rem", fontWeight: 600, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                >
                  <ClipboardPaste size={12} /> Paste from Clipboard
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={!bulkText.trim() || bulkImporting}
              className="glass-button"
              style={{ padding: "8px 16px", fontSize: "0.82rem", fontWeight: 700, justifyContent: "center", alignSelf: "flex-start" }}
            >
              {bulkProgress ? (
                <><Loader2 size={13} className="spinner" /> Adding {bulkProgress.done}/{bulkProgress.total}…</>
              ) : (
                <><ListOrdered size={13} /> Import Cards</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Card list (scrollable) ── */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: "16px" }}>

        {cards.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <ListOrdered size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.25 }} />
            <p style={{ fontSize: "0.9rem" }}>No cards yet.</p>
            <p style={{ fontSize: "0.78rem", marginTop: "4px" }}>Search above to add one at a time, or paste a full decklist.</p>
          </div>
        )}

        {Object.entries(grouped).map(([category, catCards]) => {
          const catTotal = catCards.reduce((sum, c) => sum + c.quantity, 0);
          const color    = CAT_COLOR[category] ?? "var(--text-muted)";
          return (
            <div key={category}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", paddingBottom: "5px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ fontSize: "0.67rem", fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color }}>
                  {category}
                </span>
                <span style={{ fontSize: "0.67rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "1px 7px" }}>
                  {catTotal}
                </span>
              </div>

              {/* Card rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {catCards.map(card => (
                  <div key={card.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 6px", borderRadius: "8px", background: "rgba(255,255,255,0.02)" }}>

                    {/* Art crop thumbnail */}
                    {card.imageUrl ? (
                      <img
                        src={card.imageUrl} alt=""
                        onClick={() => openCodexWith(card.name)}
                        style={{ width: "40px", height: "28px", borderRadius: "3px", objectFit: "cover", objectPosition: "center 15%", flexShrink: 0, cursor: "pointer" }}
                      />
                    ) : (
                      <div style={{ width: "40px", height: "28px", borderRadius: "3px", background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
                    )}

                    {/* Name + category */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => openCodexWith(card.name)}
                        style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                      >
                        {card.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => cycleCat(card.name)}
                        title="Tap to change category"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "Outfit, sans-serif", display: "flex", alignItems: "center", gap: "2px" }}
                      >
                        {card.category} ↻
                      </button>
                    </div>

                    {/* Quantity controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => updateQty(card.name, -1)}
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", width: "22px", height: "22px", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                      >
                        <Minus size={9} />
                      </button>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", minWidth: "16px", textAlign: "center" }}>
                        {card.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(card.name, 1)}
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "5px", width: "22px", height: "22px", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                      >
                        <Plus size={9} />
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeCard(card.name)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--accent-rose)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Save bar ── */}
      <div style={{ flexShrink: 0, paddingTop: "12px", borderTop: "1px solid var(--border-color)", marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>

        {/* Secondary actions row */}
        {cards.length > 0 && (
          <div style={{ display: "flex", gap: "8px" }}>
            {/* Re-sync uncategorized */}
            {cards.some(c => c.category === "Other" || !c.imageUrl) && (
              <button
                type="button"
                onClick={handleResync}
                disabled={resyncing}
                className="glass-button"
                style={{ flex: 1, justifyContent: "center", padding: "8px", fontSize: "0.78rem", fontWeight: 600, background: "rgba(6,182,212,0.08)", borderColor: "rgba(6,182,212,0.25)", color: "var(--accent-cyan)" }}
              >
                {resyncProgress ? (
                  <><Loader2 size={12} className="spinner" /> Syncing {resyncProgress.done}/{resyncProgress.total}…</>
                ) : (
                  <><RefreshCw size={12} /> Fix uncategorized</>
                )}
              </button>
            )}
            {/* Clear deck */}
            <button
              type="button"
              onClick={handleClearDeck}
              className="glass-button"
              style={{ flex: clearConfirm ? 1 : 0, padding: "8px 14px", fontSize: "0.78rem", fontWeight: 600, background: clearConfirm ? "rgba(244,63,94,0.15)" : "rgba(255,255,255,0.03)", borderColor: clearConfirm ? "rgba(244,63,94,0.45)" : "rgba(255,255,255,0.08)", color: clearConfirm ? "var(--accent-rose)" : "var(--text-muted)", transition: "all 0.2s ease", justifyContent: "center", whiteSpace: "nowrap" }}
            >
              {clearConfirm ? <><Trash2 size={12} /> Tap again to clear all</> : <Trash2 size={12} />}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="glass-button"
          style={{
            width: "100%", justifyContent: "center", padding: "11px",
            fontWeight: 700, fontSize: "0.9rem",
            background: saved
              ? "rgba(16,185,129,0.2)"
              : "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(6,182,212,0.15) 100%)",
            borderColor: saved ? "rgba(16,185,129,0.35)" : "rgba(139,92,246,0.4)",
            color: saved ? "var(--accent-emerald)" : "var(--text-primary)",
            transition: "all 0.2s ease",
          }}
        >
          {saved ? <><Check size={15} /> Saved!</> : "Save Changes"}
        </button>
      </div>
    </div>
  );
};
