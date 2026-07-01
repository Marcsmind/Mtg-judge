import React, { useEffect, useRef, useState } from "react";
import { X, Share2, Trash2, Check, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { CollectionCard } from "../../types/collection";
import type { ScryfallCard, ScryfallRuling } from "../../services/scryfall";
import { fetchCardById, fetchCardRulings, fetchCardPrints, getCardOracleText } from "../../services/scryfall";
import { useToast } from "../../components/Toast";

interface CardDetailViewProps {
  cards: CollectionCard[];
  index: number;
  onNavigate: (index: number) => void;
  onUpdate: (id: string, patch: Partial<CollectionCard>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  common:    "#d1d5db",
  uncommon:  "#9fd1c7",
  rare:      "#fbbf24",
  mythic:    "#f97316",
  special:   "#c4b5fd",
  bonus:     "#c4b5fd",
};

function formatLegality(status: string): { label: string; color: string } {
  switch (status) {
    case "legal":      return { label: "Legal",      color: "#86efac" };
    case "not_legal":  return { label: "Not Legal",  color: "var(--text-muted)" };
    case "banned":     return { label: "Banned",     color: "#f87171" };
    case "restricted": return { label: "Restricted", color: "#fbbf24" };
    default:           return { label: status,       color: "var(--text-muted)" };
  }
}

const FORMAT_ORDER = ["standard", "pioneer", "modern", "legacy", "vintage", "commander", "pauper", "brawl", "historic", "alchemy"];

export const CardDetailView: React.FC<CardDetailViewProps> = ({ cards, index, onNavigate, onUpdate, onRemove, onClose }) => {
  const card = cards[index];
  const { showToast } = useToast();

  const [scryfallCard, setScryfallCard] = useState<ScryfallCard | null>(null);
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [showPrints, setShowPrints] = useState(false);
  const [showRulings, setShowRulings] = useState(false);
  const [loadingPrints, setLoadingPrints] = useState(false);

  const touchStartX = useRef<number | null>(null);

  // Reset card-specific state synchronously during render when the active card changes
  // (the "adjusting state when a prop changes" pattern — avoids a stale-data flash
  // that a setState-in-effect reset would cause before the fetch below resolves).
  const [activeScryfallId, setActiveScryfallId] = useState(card.scryfallId);
  if (card.scryfallId !== activeScryfallId) {
    setActiveScryfallId(card.scryfallId);
    setScryfallCard(null);
    setRulings([]);
    setPrints([]);
    setShowPrints(false);
    setShowRulings(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [full, r] = await Promise.all([
        fetchCardById(card.scryfallId),
        fetchCardRulings(card.scryfallId),
      ]);
      if (cancelled) return;
      setScryfallCard(full);
      setRulings(r);
    })();
    return () => { cancelled = true; };
  }, [card.scryfallId]);

  const handleLoadPrints = async () => {
    setShowPrints(o => !o);
    if (prints.length > 0 || !scryfallCard?.prints_search_uri) return;
    setLoadingPrints(true);
    const data = await fetchCardPrints(scryfallCard.prints_search_uri);
    setPrints(data);
    setLoadingPrints(false);
  };

  const handleSwitchPrint = (p: ScryfallCard) => {
    onUpdate(card.id, {
      scryfallId: p.id,
      imageUri: p.image_uris?.normal ?? p.card_faces?.[0]?.image_uris?.normal ?? card.imageUri,
      priceUsd: parseFloat((card.foil ? p.prices?.usd_foil : p.prices?.usd) ?? p.prices?.usd ?? "0") || null,
      rarity: p.rarity ?? card.rarity,
      setCode: p.set ?? card.setCode,
    });
    showToast(`Switched to ${p.set_name ?? p.set}`, "success");
    setShowPrints(false);
  };

  const handleShare = async () => {
    const url = scryfallCard?.scryfall_uri ?? `https://scryfall.com/search?q=${encodeURIComponent(card.name)}`;
    if (navigator.share) {
      try { await navigator.share({ title: card.name, url }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      showToast("Link copied", "success");
    }
  };

  const handleRemove = () => {
    if (!confirm(`Remove ${card.name} from your collection?`)) return;
    onRemove(card.id);
  };

  const goPrev = () => { if (index > 0) onNavigate(index - 1); };
  const goNext = () => { if (index < cards.length - 1) onNavigate(index + 1); };

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx > 0) goPrev(); else goNext();
  };

  const oracleText = scryfallCard ? getCardOracleText(scryfallCard) : "";
  const legalities = scryfallCard?.legalities
    ? FORMAT_ORDER.filter(f => scryfallCard.legalities?.[f]).map(f => [f, scryfallCard.legalities![f]] as const)
    : [];

  const heroImage = scryfallCard?.image_uris?.normal
    ?? scryfallCard?.card_faces?.[0]?.image_uris?.normal
    ?? card.imageUri;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "var(--bg, #08070b)", zIndex: 250, display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: "env(safe-area-inset-top, 0px)" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "var(--text-primary)" }}
        >
          <X size={18} />
        </button>
        {card.priceUsd != null && (
          <div style={{ padding: "5px 14px", borderRadius: "20px", border: "1px solid rgba(234,179,8,0.5)", color: "#fbbf24", fontWeight: 700, fontSize: "0.9rem" }}>
            ${card.priceUsd.toFixed(2)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Card image with swipe-nav chevrons */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {index > 0 && (
            <button onClick={goPrev} aria-label="Previous card" style={{ position: "absolute", left: 0, zIndex: 2, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <img
            src={heroImage}
            alt={card.name}
            style={{ width: "min(78vw, 320px)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
          />
          {index < cards.length - 1 && (
            <button onClick={goNext} aria-label="Next card" style={{ position: "absolute", right: 0, zIndex: 2, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--text-muted)" }}>{index + 1} of {cards.length} · swipe to browse</div>

        {/* Action toolbar */}
        <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
          <button onClick={() => onUpdate(card.id, { foil: !card.foil })} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", background: card.foil ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${card.foil ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`, color: card.foil ? "#fbbf24" : "var(--text-secondary)", fontSize: "0.82rem", cursor: "pointer" }}>
            ✨ Foil {card.foil && <Check size={12} />}
          </button>
          <button onClick={handleShare} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)", fontSize: "0.82rem", cursor: "pointer" }}>
            <Share2 size={14} /> Share
          </button>
          <button onClick={handleRemove} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", color: "#f87171", fontSize: "0.82rem", cursor: "pointer" }}>
            <Trash2 size={14} /> Remove
          </button>
        </div>

        {/* Name + quantity */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>{card.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <button onClick={() => onUpdate(card.id, { quantity: Math.max(1, card.quantity - 1) })} style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer" }}>−</button>
              <span style={{ fontWeight: 700, minWidth: "18px", textAlign: "center" }}>{card.quantity}</span>
              <button onClick={() => onUpdate(card.id, { quantity: card.quantity + 1 })} style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer" }}>+</button>
            </div>
          </div>

          {/* Set / rarity / all prints */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px" }}>
            <img
              src={`https://svgs.scryfall.io/sets/${card.setCode}.svg`}
              alt=""
              style={{ width: "20px", height: "20px", filter: "invert(1)", opacity: 0.85 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{scryfallCard?.set_name ?? card.setCode.toUpperCase()}</div>
              <div style={{ fontSize: "0.72rem", color: RARITY_COLORS[card.rarity] ?? "var(--text-muted)", fontWeight: 700, textTransform: "capitalize" }}>
                {card.setCode.toUpperCase()} · {card.rarity}
              </div>
            </div>
            <button onClick={handleLoadPrints} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", color: "var(--accent-cyan)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              <Layers size={13} /> All Prints
            </button>
          </div>

          {showPrints && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {loadingPrints ? (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "10px" }}>Loading printings…</div>
              ) : prints.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "10px" }}>No other printings found.</div>
              ) : (
                prints.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSwitchPrint(p)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", background: p.id === card.scryfallId ? "color-mix(in srgb, var(--accent-purple) 12%, transparent)" : "rgba(255,255,255,0.02)", border: `1px solid ${p.id === card.scryfallId ? "color-mix(in srgb, var(--accent-purple) 40%, transparent)" : "rgba(255,255,255,0.06)"}`, cursor: "pointer", textAlign: "left" }}
                  >
                    {(p.image_uris?.small ?? p.card_faces?.[0]?.image_uris?.small) && (
                      <img src={p.image_uris?.small ?? p.card_faces?.[0]?.image_uris?.small} alt="" style={{ width: "28px", height: "39px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{p.set_name}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{(p.set ?? "").toUpperCase()} #{p.collector_number} {p.released_at ? `· ${p.released_at.slice(0, 4)}` : ""}</div>
                    </div>
                    {p.prices?.usd && <div style={{ fontSize: "0.78rem", color: "#86efac", flexShrink: 0 }}>${p.prices.usd}</div>}
                    {p.id === card.scryfallId && <Check size={14} color="var(--accent-purple)" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Oracle text */}
        {oracleText && (
          <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "6px" }}>Mana Value: {card.cmc}</div>
            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{oracleText}</p>
          </div>
        )}

        {/* Legality */}
        {legalities.length > 0 && (
          <div>
            <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Legality</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {legalities.map(([format, status]) => {
                const meta = formatLegality(status);
                return (
                  <div key={format} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>{format}</span>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: meta.color }}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rulings */}
        {rulings.length > 0 && (
          <div>
            <button
              onClick={() => setShowRulings(o => !o)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", color: "var(--text-secondary)" }}
            >
              <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Rulings ({rulings.length})</span>
              <ChevronRight size={16} style={{ transform: showRulings ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }} />
            </button>
            {showRulings && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                {rulings.map((r, i) => (
                  <div key={i} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px" }}>{r.published_at}</div>
                    <div style={{ fontSize: "0.82rem", lineHeight: 1.45 }}>{r.comment}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
