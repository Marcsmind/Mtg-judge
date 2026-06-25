import React, { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Search, X, Trash2, ChevronDown, Check, Pencil, Camera, ArrowUpDown } from "lucide-react";
import { useCollection } from "../hooks/useCollection";
import { searchCardsWithImages } from "../services/scryfall";
import type { ScryfallCard } from "../services/scryfall";
import type { CollectionCard, ColorSymbol, CardType, SortKey } from "../types/collection";
import { COLOR_SYMBOLS, CARD_TYPES, GROUP_TYPE_META } from "../types/collection";
import { CardScanner } from "./CardScanner";

// ── Color swatch config ───────────────────────────────────────────────────────
const COLOR_META: Record<ColorSymbol | "C", { label: string; bg: string; border: string; text: string }> = {
  W: { label: "White", bg: "rgba(255,248,220,0.15)", border: "rgba(255,248,220,0.5)", text: "#fff8dc" },
  U: { label: "Blue",  bg: "rgba(59,130,246,0.2)",  border: "rgba(59,130,246,0.5)",  text: "#93c5fd"  },
  B: { label: "Black", bg: "rgba(150,120,180,0.2)",  border: "rgba(150,120,180,0.5)", text: "#c4b5fd"  },
  R: { label: "Red",   bg: "rgba(239,68,68,0.2)",   border: "rgba(239,68,68,0.5)",   text: "#fca5a5"  },
  G: { label: "Green", bg: "rgba(34,197,94,0.2)",   border: "rgba(34,197,94,0.5)",   text: "#86efac"  },
  C: { label: "Colorless", bg: "rgba(156,163,175,0.15)", border: "rgba(156,163,175,0.4)", text: "#d1d5db" },
};

function getCardImage(card: ScryfallCard): string {
  return card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small ?? "";
}

function cardMatchesType(card: CollectionCard, type: CardType): boolean {
  return card.typeLine.toLowerCase().includes(type.toLowerCase());
}

function cardMatchesColor(card: CollectionCard, color: ColorSymbol | "C"): boolean {
  if (color === "C") return card.colors.length === 0;
  return card.colors.includes(color);
}

// ── Add Card Modal ─────────────────────────────────────────────────────────────
interface AddCardModalProps {
  groupId: string;
  groups: { id: string; name: string }[];
  onAdd: (card: Omit<CollectionCard, "id" | "addedAt">) => void;
  onClose: () => void;
}

const AddCardModal: React.FC<AddCardModalProps> = ({ groupId: initialGroupId, groups, onAdd, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ScryfallCard | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [foil, setFoil] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState(initialGroupId);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setSearching(true);
      try {
        const res = await searchCardsWithImages(query, abortRef.current.signal);
        setResults(res.slice(0, 12));
      } catch { /* aborted */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAdd = () => {
    if (!selected) return;
    onAdd({
      groupId: targetGroupId,
      scryfallId: selected.id,
      name: selected.name,
      quantity,
      foil,
      colors: selected.colors ?? [],
      typeLine: selected.type_line ?? "",
      cmc: selected.cmc ?? 0,
      imageUri: getCardImage(selected),
      priceUsd: foil
        ? parseFloat(selected.prices?.usd_foil ?? "0") || null
        : parseFloat(selected.prices?.usd ?? "0") || null,
      rarity: (selected as unknown as { rarity?: string }).rarity ?? "common",
      setCode: (selected as unknown as { set?: string }).set ?? "",
    });
    setSelected(null);
    setQuery("");
    setResults([]);
    setQuantity(1);
    setFoil(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: "540px", background: "var(--bg, #08070b)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "24px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "90vh", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Add Card</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)", padding: "4px" }}><X size={20} /></button>
        </div>

        {/* Search */}
        {!selected && (
          <>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted, #635e78)", pointerEvents: "none" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search for a card…"
                style={{ width: "100%", padding: "10px 12px 10px 36px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#f1f0f4", fontSize: "0.9rem", outline: "none" }}
              />
              {searching && <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted, #635e78)" }}>…</div>}
            </div>

            {results.length > 0 && (
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "55vh" }}>
                {results.map(card => (
                  <button key={card.id} onClick={() => setSelected(card)}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(139,92,246,0.4)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
                  >
                    {getCardImage(card) && (
                      <img src={getCardImage(card)} alt={card.name} style={{ width: "36px", height: "50px", borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f0f4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #635e78)", marginTop: "2px" }}>{card.type_line}</div>
                    </div>
                    {card.prices?.usd && (
                      <div style={{ fontSize: "0.8rem", color: "#86efac", flexShrink: 0 }}>${card.prices.usd}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Selected card — configure + add */}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
            {/* Card preview */}
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              {getCardImage(selected) && (
                <img src={getCardImage(selected)} alt={selected.name} style={{ width: "60px", height: "84px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "1rem", fontWeight: 700 }}>{selected.name}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #635e78)", marginTop: "2px" }}>{selected.type_line}</div>
                {selected.prices?.usd && <div style={{ fontSize: "0.8rem", color: "#86efac", marginTop: "4px" }}>${foil ? (selected.prices.usd_foil ?? selected.prices.usd) : selected.prices.usd}</div>}
              </div>
              <button onClick={() => { setSelected(null); setQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)", alignSelf: "flex-start" }}>
                <X size={16} />
              </button>
            </div>

            {/* Quantity */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Quantity</span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, minWidth: "24px", textAlign: "center" }}>{quantity}</span>
                <button onClick={() => setQuantity(q => q + 1)} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>

            {/* Foil toggle */}
            <button onClick={() => setFoil(f => !f)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: foil ? "rgba(234,179,8,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${foil ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: "10px", cursor: "pointer" }}
            >
              <span style={{ fontSize: "0.88rem", fontWeight: 600, color: foil ? "#fbbf24" : "#f1f0f4" }}>✨ Foil</span>
              <div style={{ width: "36px", height: "20px", borderRadius: "10px", background: foil ? "rgba(234,179,8,0.6)" : "rgba(255,255,255,0.1)", position: "relative", transition: "background 0.15s" }}>
                <div style={{ position: "absolute", top: "2px", left: foil ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
              </div>
            </button>

            {/* Group selector */}
            {groups.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted, #635e78)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Add to Group</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {groups.map(g => (
                    <button key={g.id} onClick={() => setTargetGroupId(g.id)}
                      style={{ padding: "6px 14px", borderRadius: "20px", background: targetGroupId === g.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${targetGroupId === g.id ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`, color: targetGroupId === g.id ? "#c4b5fd" : "var(--text-muted, #635e78)", fontSize: "0.82rem", cursor: "pointer" }}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add button */}
            <button onClick={handleAdd}
              style={{ padding: "12px", background: "linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(6,182,212,0.6) 100%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Plus size={16} /> Add to Collection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Card detail modal ──────────────────────────────────────────────────────────
interface CardDetailProps {
  card: CollectionCard;
  onUpdate: (patch: Partial<CollectionCard>) => void;
  onRemove: () => void;
  onClose: () => void;
}

const CardDetail: React.FC<CardDetailProps> = ({ card, onUpdate, onRemove, onClose }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ width: "100%", maxWidth: "540px", background: "var(--bg, #08070b)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{card.name}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)" }}><X size={20} /></button>
      </div>
      <div style={{ display: "flex", gap: "16px" }}>
        {card.imageUri && <img src={card.imageUri} alt={card.name} style={{ width: "80px", height: "112px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #635e78)" }}>{card.typeLine}</div>
          {card.priceUsd != null && <div style={{ fontSize: "0.88rem", color: "#86efac" }}>${card.priceUsd.toFixed(2)} {card.foil ? "(foil)" : ""}</div>}
          {/* Quantity */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #635e78)" }}>Qty</span>
            <button onClick={() => onUpdate({ quantity: Math.max(1, card.quantity - 1) })} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <span style={{ fontSize: "1rem", fontWeight: 700, minWidth: "20px", textAlign: "center" }}>{card.quantity}</span>
            <button onClick={() => onUpdate({ quantity: card.quantity + 1 })} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </div>
          {/* Foil */}
          <button onClick={() => onUpdate({ foil: !card.foil })}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "8px", background: card.foil ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${card.foil ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`, color: card.foil ? "#fbbf24" : "var(--text-muted, #635e78)", fontSize: "0.8rem", cursor: "pointer", alignSelf: "flex-start" }}
          >
            ✨ Foil {card.foil && <Check size={12} />}
          </button>
        </div>
      </div>
      <button onClick={onRemove} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "10px", color: "#f87171", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}>
        <Trash2 size={14} /> Remove from Collection
      </button>
    </div>
  </div>
);

// ── Main Collection view ───────────────────────────────────────────────────────
export const Collection: React.FC = () => {
  const { groups, cards, wantedIds, addGroup, renameGroup, deleteGroup, addCard, updateCard, removeCard } = useCollection();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null); // null = All
  const [colorFilters, setColorFilters] = useState<Set<ColorSymbol | "C">>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<CardType>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [showAddCard, setShowAddCard] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CollectionCard | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const newGroupRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showNewGroup) newGroupRef.current?.focus(); }, [showNewGroup]);

  const toggleColor = (c: ColorSymbol | "C") =>
    setColorFilters(prev => { const s = new Set(prev); if (s.has(c)) s.delete(c); else s.add(c); return s; });

  const toggleType = (t: CardType) =>
    setTypeFilters(prev => { const s = new Set(prev); if (s.has(t)) s.delete(t); else s.add(t); return s; });

  const visibleCards = useMemo(() => {
    let result = activeGroupId ? cards.filter(c => c.groupId === activeGroupId) : cards;
    if (colorFilters.size > 0)
      result = result.filter(c => [...colorFilters].some(col => cardMatchesColor(c, col)));
    if (typeFilters.size > 0)
      result = result.filter(c => [...typeFilters].some(t => cardMatchesType(c, t)));
    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':       return a.name.localeCompare(b.name);
        case 'price-high': return (b.priceUsd ?? 0) - (a.priceUsd ?? 0);
        case 'price-low':  return (a.priceUsd ?? 0) - (b.priceUsd ?? 0);
        case 'quantity':   return b.quantity - a.quantity;
        case 'newest':
        default:           return b.addedAt - a.addedAt;
      }
    });
  }, [cards, activeGroupId, colorFilters, typeFilters, sortKey]);

  const totalValue = useMemo(() =>
    visibleCards.reduce((sum, c) => sum + (c.priceUsd ?? 0) * c.quantity, 0),
    [visibleCards]
  );

  const totalCount = visibleCards.reduce((sum, c) => sum + c.quantity, 0);

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const group = addGroup(name);
    setActiveGroupId(group.id);
    setNewGroupName("");
    setShowNewGroup(false);
  };

  const handleRenameGroup = () => {
    if (!editingGroupId || !editingGroupName.trim()) return;
    renameGroup(editingGroupId, editingGroupName.trim());
    setEditingGroupId(null);
  };

  const handleDeleteGroup = (id: string) => {
    if (!confirm(`Delete this group and all its cards?`)) return;
    deleteGroup(id);
    if (activeGroupId === id) setActiveGroupId(null);
  };

  const hasFilters = colorFilters.size > 0 || typeFilters.size > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* Header */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>My Collection</h2>
          {totalCount > 0 && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #635e78)", textAlign: "right" }}>
              <span style={{ color: "#f1f0f4", fontWeight: 600 }}>{totalCount}</span> cards
              {totalValue > 0 && <> · <span style={{ color: "#86efac", fontWeight: 600 }}>${totalValue.toFixed(2)}</span></>}
            </div>
          )}
        </div>

        {/* Group tabs */}
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "10px", scrollbarWidth: "none" }}>
          {/* All tab */}
          <button onClick={() => setActiveGroupId(null)}
            style={{ flexShrink: 0, padding: "6px 14px", borderRadius: "20px", background: activeGroupId === null ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${activeGroupId === null ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`, color: activeGroupId === null ? "#c4b5fd" : "var(--text-muted, #635e78)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            All Cards {cards.length > 0 && `(${cards.reduce((s, c) => s + c.quantity, 0)})`}
          </button>

          {groups.map(g => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
              {editingGroupId === g.id ? (
                <input
                  value={editingGroupName}
                  onChange={e => setEditingGroupName(e.target.value)}
                  onBlur={handleRenameGroup}
                  onKeyDown={e => { if (e.key === "Enter") handleRenameGroup(); if (e.key === "Escape") setEditingGroupId(null); }}
                  autoFocus
                  style={{ padding: "5px 10px", borderRadius: "20px", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.5)", color: "#c4b5fd", fontSize: "0.82rem", outline: "none", width: "120px" }}
                />
              ) : (
                <button onClick={() => setActiveGroupId(g.id)}
                  style={{ padding: "6px 14px", borderRadius: "20px", background: activeGroupId === g.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${activeGroupId === g.id ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`, color: activeGroupId === g.id ? "#c4b5fd" : "var(--text-muted, #635e78)", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {GROUP_TYPE_META[g.type]?.icon && <span style={{ marginRight: "4px" }}>{GROUP_TYPE_META[g.type].icon}</span>}{g.name} ({cards.filter(c => c.groupId === g.id).reduce((s, c) => s + c.quantity, 0)})
                </button>
              )}
              {activeGroupId === g.id && (
                <>
                  <button onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)", padding: "2px" }}><Pencil size={12} /></button>
                  <button onClick={() => handleDeleteGroup(g.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)", padding: "2px" }}><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}

          {/* New group */}
          {showNewGroup ? (
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <input
                ref={newGroupRef}
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setShowNewGroup(false); }}
                placeholder="Group name…"
                style={{ padding: "5px 10px", borderRadius: "20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "#f1f0f4", fontSize: "0.82rem", outline: "none", width: "120px" }}
              />
              <button onClick={handleCreateGroup} style={{ padding: "5px 10px", borderRadius: "20px", background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd", fontSize: "0.82rem", cursor: "pointer" }}>Add</button>
              <button onClick={() => setShowNewGroup(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #635e78)" }}><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => setShowNewGroup(true)}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "20px", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.15)", color: "var(--text-muted, #635e78)", fontSize: "0.82rem", cursor: "pointer" }}
            >
              <Plus size={12} /> New Group
            </button>
          )}
        </div>

        {/* Color filters */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
          {([...COLOR_SYMBOLS, "C"] as (ColorSymbol | "C")[]).map(c => {
            const meta = COLOR_META[c];
            const active = colorFilters.has(c);
            return (
              <button key={c} onClick={() => toggleColor(c)}
                style={{ padding: "4px 10px", borderRadius: "16px", background: active ? meta.bg : "rgba(255,255,255,0.03)", border: `1px solid ${active ? meta.border : "rgba(255,255,255,0.08)"}`, color: active ? meta.text : "var(--text-muted, #635e78)", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}
              >
                {c}
              </button>
            );
          })}
          {colorFilters.size > 0 && (
            <button onClick={() => setColorFilters(new Set())} style={{ padding: "4px 8px", borderRadius: "16px", background: "none", border: "none", color: "var(--text-muted, #635e78)", fontSize: "0.75rem", cursor: "pointer" }}>Clear</button>
          )}
        </div>

        {/* Type filters */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
          {CARD_TYPES.map(t => {
            const active = typeFilters.has(t);
            return (
              <button key={t} onClick={() => toggleType(t)}
                style={{ padding: "4px 10px", borderRadius: "16px", background: active ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${active ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"}`, color: active ? "#c4b5fd" : "var(--text-muted, #635e78)", fontSize: "0.78rem", cursor: "pointer" }}
              >
                {t}
              </button>
            );
          })}
          {typeFilters.size > 0 && (
            <button onClick={() => setTypeFilters(new Set())} style={{ padding: "4px 8px", borderRadius: "16px", background: "none", border: "none", color: "var(--text-muted, #635e78)", fontSize: "0.75rem", cursor: "pointer" }}>Clear</button>
          )}
        </div>

        {hasFilters && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #635e78)", marginBottom: "8px" }}>
            Showing {visibleCards.length} of {cards.length} card types
            <button onClick={() => { setColorFilters(new Set()); setTypeFilters(new Set()); }} style={{ marginLeft: "8px", background: "none", border: "none", color: "var(--text-muted, #635e78)", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline" }}>Clear all</button>
          </div>
        )}

        {/* Sort controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
          <ArrowUpDown size={13} color="var(--text-muted, #635e78)" />
          {([ ['newest','Newest'], ['name','A–Z'], ['price-high','$ High'], ['price-low','$ Low'], ['quantity','Qty'] ] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSortKey(key)}
              style={{ padding: "3px 10px", borderRadius: "14px", background: sortKey === key ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${sortKey === key ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.07)"}`, color: sortKey === key ? "#c4b5fd" : "var(--text-muted, #635e78)", fontSize: "0.75rem", cursor: "pointer" }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 100px" }}>
        {visibleCards.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: "12px", opacity: 0.5 }}>
            <ChevronDown size={32} color="var(--text-muted, #635e78)" />
            <p style={{ color: "var(--text-muted, #635e78)", fontSize: "0.9rem", textAlign: "center" }}>
              {cards.length === 0 ? "No cards yet. Tap + to add your first card." : "No cards match your filters."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {visibleCards.map(card => (
              <button key={card.id} onClick={() => setSelectedCard(card)}
                style={{ position: "relative", background: "none", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", cursor: "pointer", padding: 0, overflow: "hidden", aspectRatio: "488/680" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
              >
                {card.imageUri
                  ? <img src={card.imageUri} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  : <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-muted, #635e78)", textAlign: "center", lineHeight: 1.3 }}>{card.name}</span>
                    </div>
                }
                {/* Quantity badge */}
                {card.quantity > 1 && (
                  <div style={{ position: "absolute", bottom: "4px", right: "4px", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "10px", padding: "1px 6px", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
                    ×{card.quantity}
                  </div>
                )}
                {/* Foil badge */}
                {card.foil && (
                  <div style={{ position: "absolute", top: "4px", left: "4px", background: "rgba(234,179,8,0.8)", borderRadius: "4px", padding: "1px 4px", fontSize: "0.6rem", fontWeight: 700, color: "#000" }}>✨</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FABs */}
      <div style={{ position: "absolute", bottom: "80px", right: "16px", display: "flex", flexDirection: "column", gap: "10px", zIndex: 10 }}>
        {/* Scan */}
        <button
          onClick={() => setShowScanner(true)}
          style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(20,16,30,0.85)", border: "1px solid rgba(139,92,246,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
          title="Scan cards"
        >
          <Camera size={20} color="var(--accent-purple, #8b5cf6)" />
        </button>
        {/* Manual add */}
        <button
          onClick={() => setShowAddCard(true)}
          style={{ width: "52px", height: "52px", borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-purple, #8b5cf6) 0%, var(--accent-cyan, #06b6d4) 100%)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(139,92,246,0.5)" }}
          title="Add card manually"
        >
          <Plus size={22} color="#fff" />
        </button>
      </div>

      {/* Modals */}
      {showAddCard && (
        <AddCardModal
          groupId={activeGroupId ?? groups[0]?.id ?? ""}
          groups={groups}
          onAdd={card => { addCard(card); }}
          onClose={() => setShowAddCard(false)}
        />
      )}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onUpdate={patch => updateCard(selectedCard.id, patch)}
          onRemove={() => { removeCard(selectedCard.id); setSelectedCard(null); }}
          onClose={() => setSelectedCard(null)}
        />
      )}
      {showScanner && (
        <CardScanner
          defaultGroupId={activeGroupId ?? groups[0]?.id ?? ""}
          wantedIds={wantedIds}
          onAddCards={scannedCards => scannedCards.forEach(c => addCard(c))}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
};
