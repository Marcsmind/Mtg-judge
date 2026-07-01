import React, { useState, useEffect, useRef } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { searchCardFuzzy, getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import type { Player, ManaKey } from "../../types/game";
import type { ColorTheme, HubTab } from "./GameContext";
import {
  Crown, Trash2, X, Pencil, Plus, Check,
  CloudLightning, Hexagon, Zap, Skull, Star, CircleDot, Radiation,
  ChevronLeft, ChevronRight,
} from "lucide-react";

type CounterKey = "generic" | "energy" | "poison" | "experience" | "ringLevel" | "storm" | "rad";

export interface CommanderHubModalProps {
  player: Player;
  allPlayers: Player[];
  colors: Record<string, ColorTheme>;

  onSetArtSource: (usePartner: boolean) => void;
  onClearCommander: () => void;
  onClearPartnerCommander: () => void;

  adjustTax: (id: number, isPartner: boolean, amount: number) => void;
  togglePartner: (id: number) => void;

  adjustCounter: (id: number, key: CounterKey, delta: number) => void;
  clearCounters: (id: number) => void;
  assignMonarch: (id: number) => void;
  releaseMonarch: () => void;
  assignInitiative: (id: number) => void;
  releaseInitiative: () => void;
  toggleCityBlessing: (id: number) => void;

  adjustMana: (id: number, color: ManaKey, delta: number) => void;
  adjustStorm: (id: number, delta: number) => void;
  clearMana: (id: number) => void;

  onAdjustDamage: (targetId: number, sourceId: number, suffix: string, amount: number) => void;

  onOpenEdit: () => void;
  onClose: () => void;
  initialTab?: HubTab;
}

// ── Static data ────────────────────────────────────────────────────────────────

const MANA_PIPS: { key: ManaKey; sym: string; bg: string; border: string; text: string }[] = [
  { key: "W", sym: "W", bg: "rgba(245,215,150,0.15)", border: "rgba(245,215,150,0.45)", text: "#f0d870" },
  { key: "U", sym: "U", bg: "rgba(30,120,220,0.18)",  border: "rgba(60,140,255,0.45)",  text: "#5eaaff" },
  { key: "B", sym: "B", bg: "rgba(80,60,100,0.25)",   border: "rgba(180,140,220,0.35)", text: "#c0a8e0" },
  { key: "R", sym: "R", bg: "rgba(200,50,30,0.18)",   border: "rgba(240,80,50,0.45)",   text: "#ff6b50" },
  { key: "G", sym: "G", bg: "rgba(30,140,60,0.18)",   border: "rgba(50,200,80,0.40)",   text: "#50d868" },
  { key: "C", sym: "C", bg: "rgba(100,100,120,0.18)", border: "rgba(180,180,200,0.35)", text: "#c0c0d0" },
];

const RING_STAGES = [
  "Not Tempted",
  "Tempted",
  "Lured",
  "Corrupted",
  "Dominated",
];

const COUNTER_DEFS: { key: CounterKey; label: string; Icon: React.ElementType; color: string; max?: number }[] = [
  { key: "storm",      label: "Storm",      Icon: CloudLightning, color: "#818cf8" },
  { key: "generic",    label: "Generic",    Icon: Hexagon,        color: "#94a3b8" },
  { key: "energy",     label: "Energy",     Icon: Zap,            color: "#fbbf24" },
  { key: "poison",     label: "Poison",     Icon: Skull,          color: "#10b981", max: 10 },
  { key: "experience", label: "Experience", Icon: Star,           color: "#a78bfa" },
  { key: "ringLevel",  label: "The Ring",   Icon: CircleDot,      color: "#c084fc", max: 4 },
  { key: "rad",        label: "Radiation",  Icon: Radiation,      color: "#84cc16" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const CommanderHubModal: React.FC<CommanderHubModalProps> = ({
  player: p,
  allPlayers, colors,
  onSetArtSource, onClearCommander,
  onClearPartnerCommander,
  adjustTax, togglePartner,
  adjustCounter, clearCounters,
  assignMonarch, releaseMonarch, assignInitiative, releaseInitiative, toggleCityBlessing,
  adjustMana, adjustStorm, clearMana,
  onAdjustDamage,
  onOpenEdit, onClose,
  initialTab = "commander",
}) => {
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);

  // Zoom overlay state
  const [zoomedCardSide, setZoomedCardSide] = useState<"main" | "partner" | null>(null);
  const [rulings, setRulings] = useState<{ published_at: string; comment: string }[] | null>(null);
  const [rulingsLoading, setRulingsLoading] = useState(false);

  // Commander card images
  const [mainCard, setMainCard]       = useState<ScryfallCard | null>(null);
  const [partnerCard, setPartnerCard] = useState<ScryfallCard | null>(null);
  const [mainLoading, setMainLoading] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);

  // Tab-swipe detection
  const touchStartX    = useRef(0);
  const touchStartTime = useRef(0);
  const touchStartEl   = useRef<EventTarget | null>(null);

  // Zoom-overlay swipe detection (separate refs to avoid conflict)
  const zoomTouchX    = useRef(0);
  const zoomTouchTime = useRef(0);

  const TAB_ORDER: HubTab[] = ["commander", "damage", "counters", "mana"];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current    = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    touchStartEl.current   = e.target;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Never swipe when the touch originated on a text input (keyboard would be opening)
    const el = touchStartEl.current as Element | null;
    if (el?.closest('input, textarea')) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dt = Date.now() - touchStartTime.current;
    if (Math.abs(dx) > 50 && dt < 400) {
      const idx = TAB_ORDER.indexOf(activeTab);
      const last = TAB_ORDER.length - 1;
      if (dx < 0 && idx < last) setActiveTab(TAB_ORDER[idx + 1]);
      if (dx > 0 && idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
    }
  };

  // Load main commander card image
  useEffect(() => {
    if (!p.commanderName) { setMainCard(null); return; }
    let cancelled = false;
    setMainLoading(true);
    searchCardFuzzy(p.commanderName).then(c => {
      if (!cancelled) { setMainCard(c); setMainLoading(false); }
    });
    return () => { cancelled = true; };
  }, [p.commanderName]);

  // Load partner commander card image
  useEffect(() => {
    if (!p.partnerCommanderName) { setPartnerCard(null); return; }
    let cancelled = false;
    setPartnerLoading(true);
    searchCardFuzzy(p.partnerCommanderName).then(c => {
      if (!cancelled) { setPartnerCard(c); setPartnerLoading(false); }
    });
    return () => { cancelled = true; };
  }, [p.partnerCommanderName]);

  // Fetch Scryfall rulings when zoom is opened or switched
  useEffect(() => {
    if (!zoomedCardSide) return;
    const card = zoomedCardSide === "main" ? mainCard : partnerCard;
    setRulings(null);
    if (!card?.rulings_uri) { setRulings([]); return; }
    setRulingsLoading(true);
    let cancelled = false;
    fetch(card.rulings_uri)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setRulings(data.data ?? []); setRulingsLoading(false); } })
      .catch(() => { if (!cancelled) { setRulings([]); setRulingsLoading(false); } });
    return () => { cancelled = true; };
  }, [zoomedCardSide, mainCard, partnerCard]);

  // Derive values
  const getCounterVal = (key: CounterKey): number => {
    if (key === "rad") return p.rad ?? 0;
    return (p as unknown as Record<string, number>)[key] ?? 0;
  };

  const hasAnyCounters = COUNTER_DEFS.some(d => getCounterVal(d.key) > 0);
  const hasGameStates  = p.isMonarch || p.hasInitiative || p.cityBlessing;
  const totalMana      = MANA_PIPS.reduce((s, pip) => s + (p.mana?.[pip.key] ?? 0), 0);
  const hasAnyMana     = totalMana > 0 || (p.storm ?? 0) > 0;

  const mainImgSrc    = mainCard    ? getCardImage(mainCard)    : null;
  const partnerImgSrc = partnerCard ? getCardImage(partnerCard) : null;
  const hasPartner    = !!p.partnerCommanderName;

  // ── Tab bar ──────────────────────────────────────────────────────────────────

  const TAB_LABELS: Record<HubTab, string> = {
    commander: "Commander",
    damage:    "Damage",
    counters:  "Counters",
    mana:      "Mana",
  };

  const TabBar = () => (
    <div style={{
      display: "flex", gap: "4px",
      background: "rgba(0,0,0,0.3)", borderRadius: "10px", padding: "3px",
      marginBottom: "16px",
    }}>
      {TAB_ORDER.map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            flex: 1, padding: "8px 4px",
            background: activeTab === tab ? "rgba(255,255,255,0.16)" : "transparent",
            border: activeTab === tab ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
            borderRadius: "8px",
            color: activeTab === tab ? "#fff" : "var(--text-muted)",
            fontSize: "0.72rem", fontWeight: activeTab === tab ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s",
          }}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );

  // ── Commander Tab ─────────────────────────────────────────────────────────────

  const CommanderTab = () => {
    const renderCardSlot = (side: "main" | "partner") => {
      const name    = side === "main" ? p.commanderName : p.partnerCommanderName;
      const img     = side === "main" ? mainImgSrc      : partnerImgSrc;
      const loading = side === "main" ? mainLoading     : partnerLoading;
      return (
        <div
          onClick={() => name && setZoomedCardSide(side)}
          style={{ cursor: name ? "pointer" : "default", borderRadius: "8px" }}
        >
          {!name ? (
            <div style={{
              width: hasPartner ? "130px" : "150px",
              height: hasPartner ? "182px" : "210px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              <Crown size={hasPartner ? 22 : 28} color="rgba(255,255,255,0.25)" />
              <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "0 10px" }}>
                {side === "main" ? "No commander set" : "No partner set"}
              </span>
            </div>
          ) : loading ? (
            <div style={{ width: hasPartner ? "130px" : "150px", height: hasPartner ? "182px" : "210px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>Loading…</span>
            </div>
          ) : img ? (
            <img
              src={img} alt={name}
              style={{ width: hasPartner ? "130px" : "150px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", display: "block" }}
            />
          ) : (
            <div style={{ width: hasPartner ? "130px" : "150px", height: hasPartner ? "182px" : "210px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>{name}</span>
            </div>
          )}
        </div>
      );
    };

    return (
    <div>
      {/* Side-by-side card display */}
      <div style={{ display: "flex", gap: hasPartner ? "12px" : 0, justifyContent: "center", marginBottom: "8px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
          {hasPartner && <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Commander</span>}
          {renderCardSlot("main")}
          {p.commanderName && <span style={{ fontSize: "0.58rem", color: "var(--text-muted)" }}>Tap to view</span>}
        </div>
        {hasPartner && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Partner</span>
            {renderCardSlot("partner")}
            {p.partnerCommanderName && <span style={{ fontSize: "0.58rem", color: "var(--text-muted)" }}>Tap to view</span>}
          </div>
        )}
      </div>
      {hasPartner && (p.commanderName || p.partnerCommanderName) && (
        <div style={{ textAlign: "center", fontSize: "0.6rem", color: "var(--text-muted)", marginBottom: "10px" }}>
          Tap a card • Swipe left/right in the detail view to switch
        </div>
      )}

      {/* Art source selector (when both commanders are set) */}
      {p.commanderName && p.partnerCommanderName && (
        <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
          {([
            { label: "Main Art",    artPartner: false },
            { label: "Partner Art", artPartner: true  },
          ] as const).map(({ label, artPartner }) => {
            const active = artPartner ? !!p.artUsePartner : !p.artUsePartner;
            return (
              <button
                key={label}
                onClick={() => onSetArtSource(artPartner)}
                style={{
                  flex: 1, padding: "7px 4px",
                  background: active ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.25)",
                  border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "8px",
                  color: active ? "#fff" : "var(--text-muted)",
                  fontSize: "0.68rem", fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Commander name display / set button */}
      <div style={{ marginBottom: "12px" }}>
        {p.commanderName ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
            borderRadius: "10px", padding: "10px 12px",
          }}>
            <div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "2px" }}>Commander</div>
              <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>{p.commanderName}</div>
            </div>
            <button
              onClick={onClearCommander}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { onClose(); setTimeout(onOpenEdit, 60); }}
            style={{
              width: "100%", padding: "12px",
              background: "color-mix(in srgb, var(--accent-purple) 15%, transparent)", border: "1px dashed color-mix(in srgb, var(--accent-purple) 40%, transparent)",
              borderRadius: "10px", color: "var(--accent-purple)", fontWeight: 600,
              fontSize: "0.9rem", cursor: "pointer",
            }}
          >
            + Set Commander
          </button>
        )}
      </div>

      {/* Partner section */}
      {p.partnerMode && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px" }}>Partner Commander</div>
          {p.partnerCommanderName ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
              borderRadius: "10px", padding: "10px 12px",
            }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>{p.partnerCommanderName}</span>
              <button
                onClick={onClearPartnerCommander}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { onClose(); setTimeout(onOpenEdit, 60); }}
              style={{
                width: "100%", padding: "12px",
                background: "color-mix(in srgb, var(--accent-purple) 15%, transparent)", border: "1px dashed color-mix(in srgb, var(--accent-purple) 40%, transparent)",
                borderRadius: "10px", color: "var(--accent-purple)", fontWeight: 600,
                fontSize: "0.9rem", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              <Plus size={14} /> Set Partner Commander
            </button>
          )}
        </div>
      )}

      {/* Tax section */}
      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px" }}>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px" }}>Commander Tax</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: p.partnerMode ? "10px" : 0 }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>Main</span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => adjustTax(p.id, false, -2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>−</span></button>
            <span style={{ fontSize: "1.4rem", fontWeight: 900, color: p.tax > 0 ? "var(--accent-purple)" : "var(--text-muted)", minWidth: "32px", textAlign: "center" }}>{p.tax}</span>
            <button onClick={() => adjustTax(p.id, false, 2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>+</span></button>
          </div>
        </div>
        {p.partnerMode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>Partner</span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={() => adjustTax(p.id, true, -2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>−</span></button>
              <span style={{ fontSize: "1.4rem", fontWeight: 900, color: p.taxPartner > 0 ? "var(--accent-purple)" : "var(--text-muted)", minWidth: "32px", textAlign: "center" }}>{p.taxPartner}</span>
              <button onClick={() => adjustTax(p.id, true, 2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>+</span></button>
            </div>
          </div>
        )}
      </div>

      {/* Partner toggle */}
      <button
        onClick={() => togglePartner(p.id)}
        style={{
          width: "100%", padding: "10px",
          background: p.partnerMode ? "color-mix(in srgb, var(--accent-purple) 12%, transparent)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${p.partnerMode ? "color-mix(in srgb, var(--accent-purple) 35%, transparent)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: "10px", color: p.partnerMode ? "var(--accent-purple)" : "var(--text-secondary)",
          fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", marginBottom: "10px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
        }}
      >
        {p.partnerMode ? (<><Check size={14} /> Partner Mode On — Disable</>) : (<><Plus size={14} /> Enable Partner Mode</>)}
      </button>

      {/* Edit button */}
      {p.commanderName && (
        <button
          onClick={() => { onClose(); setTimeout(onOpenEdit, 60); }}
          style={{
            width: "100%", padding: "10px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px", color: "var(--text-secondary)",
            fontWeight: 500, fontSize: "0.85rem", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          <Pencil size={13} /> Edit Commander / Player Name
        </button>
      )}
    </div>
    );
  };

  // ── Counters Tab ──────────────────────────────────────────────────────────────

  const CountersTab = () => (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        {(hasAnyCounters || hasGameStates) && (
          <button
            onClick={() => clearCounters(p.id)}
            style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
              color: "#ef4444", fontSize: "0.72rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <Trash2 size={12} /> Clear All
          </button>
        )}
      </div>

      {/* Counters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
        {COUNTER_DEFS.map(({ key, label, Icon, color, max }) => {
          const val = getCounterVal(key);
          const atMax = max !== undefined && val >= max;
          const subLabel = key === "ringLevel" ? RING_STAGES[val] : key === "poison" ? `${val}/10` : undefined;
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center",
              background: val > 0 ? `${color}14` : "rgba(0,0,0,0.25)",
              border: `1px solid ${val > 0 ? `${color}50` : "rgba(255,255,255,0.07)"}`,
              borderRadius: "10px", padding: "9px 12px",
              transition: "background 0.15s, border-color 0.15s",
            }}>
              <Icon size={18} color={val > 0 ? color : "var(--text-muted)"} style={{ marginRight: "10px", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: val > 0 ? color : "var(--text-secondary)" }}>{label}</div>
                {subLabel && <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "1px" }}>{subLabel}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={() => adjustCounter(p.id, key, -1)} disabled={val <= 0}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: val > 0 ? "#fff" : "rgba(255,255,255,0.2)", width: "30px", height: "30px", borderRadius: "7px", fontSize: "1rem", fontWeight: 700, cursor: val > 0 ? "pointer" : "default" }}>−</button>
                <span style={{ fontSize: "1.2rem", fontWeight: 900, color: atMax ? "#ef4444" : (val > 0 ? color : "var(--text-muted)"), minWidth: "26px", textAlign: "center" }}>{val}</span>
                <button onClick={() => adjustCounter(p.id, key, 1)} disabled={atMax}
                  style={{ background: "rgba(0,0,0,0.3)", border: "none", color: atMax ? "rgba(255,255,255,0.2)" : "#fff", width: "30px", height: "30px", borderRadius: "7px", fontSize: "1rem", fontWeight: 700, cursor: atMax ? "default" : "pointer" }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: "12px" }} />

      {/* Game states */}
      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px" }}>Game States</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {[
          { label: "Monarch",        active: p.isMonarch,     color: "#eab308", onToggle: () => p.isMonarch ? releaseMonarch() : assignMonarch(p.id) },
          { label: "Initiative",     active: p.hasInitiative, color: "#06b6d4", onToggle: () => p.hasInitiative ? releaseInitiative() : assignInitiative(p.id) },
          { label: "City's Blessing",active: p.cityBlessing,  color: "#eab308", onToggle: () => toggleCityBlessing(p.id) },
        ].map(({ label, active, color, onToggle }) => (
          <button key={label} onClick={onToggle} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: active ? `${color}20` : "rgba(0,0,0,0.25)",
            border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.07)"}`,
            borderRadius: "10px", padding: "10px 14px", cursor: "pointer", textAlign: "left",
          }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: active ? color : "var(--text-secondary)" }}>{label}</span>
            <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: active ? color : "rgba(255,255,255,0.1)", border: `2px solid ${active ? color : "rgba(255,255,255,0.2)"}` }} />
          </button>
        ))}
      </div>
    </div>
  );

  // ── Mana Tab ──────────────────────────────────────────────────────────────────

  const ManaTab = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        {hasAnyMana && (
          <button
            onClick={() => clearMana(p.id)}
            style={{
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
              color: "#ef4444", fontSize: "0.72rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <X size={12} /> Clear All
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "7px", marginBottom: "14px" }}>
        {MANA_PIPS.map(({ key, sym, bg, border, text }) => {
          const count = p.mana?.[key] ?? 0;
          return (
            <div key={key} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: "12px", padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 900, color: "#fff" }}>{sym}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <button onClick={() => adjustMana(p.id, key, -1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "26px", height: "26px", borderRadius: "5px", fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>−</button>
                <span style={{ fontSize: "1.3rem", fontWeight: 900, color: text, minWidth: "22px", textAlign: "center" }}>{count}</span>
                <button onClick={() => adjustMana(p.id, key, 1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "26px", height: "26px", borderRadius: "5px", fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storm */}
      <div style={{
        background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
        borderRadius: "12px", padding: "12px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
            <CloudLightning size={15} color="var(--accent-purple)" /> Storm
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "2px" }}>Copies cast this turn</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => adjustStorm(p.id, -1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer" }}>−</button>
          <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--accent-purple)", minWidth: "28px", textAlign: "center" }}>{p.storm ?? 0}</span>
          <button onClick={() => adjustStorm(p.id, 1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
      </div>
    </div>
  );

  // ── Damage Tab ─────────────────────────────────────────────────────────────────

  const DamageTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.7rem", margin: 0 }}>
        21+ from one commander = loss.
      </p>
      {allPlayers
        .filter(sp => sp.id !== p.id)
        .map(src => {
          const sTheme = colors[src.colorName] || colors.purple;

          const renderBlock = (suffix: string, label: string) => {
            const key = `${src.id}${suffix}`;
            const dmg = p.commanderDamage[key] ?? 0;
            const pct = Math.min(100, (dmg / 21) * 100);
            return (
              <div key={key} style={{
                background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px", padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: "7px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: sTheme.accent, display: "block", flexShrink: 0 }} />
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: "1rem", fontWeight: 800, color: dmg >= 21 ? "var(--accent-rose)" : "var(--text-primary)" }}>
                    {dmg} / 21
                  </span>
                </div>
                <div style={{ height: "4px", width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: dmg >= 21 ? "var(--accent-rose)" : sTheme.accent, transition: "width 0.3s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                  {[-1, 1, 5].map(amt => (
                    <button
                      key={amt}
                      onClick={() => onAdjustDamage(p.id, src.id, suffix, amt)}
                      disabled={amt < 0 && dmg === 0}
                      style={{
                        width: "36px", height: "30px",
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "6px", cursor: amt < 0 && dmg === 0 ? "not-allowed" : "pointer",
                        color: "#fff", fontSize: "0.78rem", fontWeight: 700,
                        opacity: amt < 0 && dmg === 0 ? 0.3 : 1,
                      }}
                    >
                      {amt > 0 ? `+${amt}` : amt}
                    </button>
                  ))}
                </div>
              </div>
            );
          };

          return (
            <div key={src.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {renderBlock("", `${src.name}'s Commander`)}
              {src.partnerMode && renderBlock("_B", `${src.name}'s Partner`)}
            </div>
          );
        })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  // Zoom-overlay derived values
  const zoomedCard = zoomedCardSide === "main" ? mainCard    : partnerCard;
  const zoomedImg  = zoomedCardSide === "main" ? mainImgSrc  : partnerImgSrc;
  const zoomedName = zoomedCardSide === "main" ? p.commanderName : p.partnerCommanderName;
  const canSwitch  = hasPartner && !!p.commanderName && !!p.partnerCommanderName;

  return (
    <>
    <BottomSheet
      onClose={onClose}
      zIndex={1000}
      maxWidth="440px"
      padding="20px"
      alwaysCentered={true}
      aria-label={`${p.name} Commander Hub`}
    >
      {/* Player name header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ width: "32px" }} />
        <div style={{ flex: 1, textAlign: "center", fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{p.name}</div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "50%", width: "32px", height: "32px", color: "#fff",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Tab bar */}
      <TabBar />

      {/* Tab content — swipe enabled */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ overflowY: "auto", maxHeight: "65dvh" }}
      >
        {activeTab === "commander" && <CommanderTab />}
        {activeTab === "damage"    && <DamageTab />}
        {activeTab === "counters"  && <CountersTab />}
        {activeTab === "mana"      && <ManaTab />}
      </div>
    </BottomSheet>

    {/* ── Card zoom overlay ──────────────────────────────────────────── */}
    {zoomedCardSide && (
      <BottomSheet onClose={() => setZoomedCardSide(null)} zIndex={1100} maxWidth="440px" padding="16px">
        <div
          onTouchStart={e => { zoomTouchX.current = e.touches[0].clientX; zoomTouchTime.current = Date.now(); }}
          onTouchEnd={e => {
            const dx = e.changedTouches[0].clientX - zoomTouchX.current;
            const dt = Date.now() - zoomTouchTime.current;
            if (canSwitch && Math.abs(dx) > 50 && dt < 400) {
              setZoomedCardSide(prev => prev === "main" ? "partner" : "main");
            }
          }}
        >
          {/* Header: prev/next + close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <button
              onClick={() => canSwitch && setZoomedCardSide(prev => prev === "main" ? "partner" : "main")}
              disabled={!canSwitch}
              style={{
                background: canSwitch ? "rgba(255,255,255,0.08)" : "transparent",
                border: "none", borderRadius: "8px", padding: "6px",
                color: canSwitch ? "#fff" : "transparent", cursor: canSwitch ? "pointer" : "default",
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>
                {zoomedCardSide === "main" ? "Commander" : "Partner Commander"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff", lineHeight: 1.2 }}>{zoomedName}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={() => canSwitch && setZoomedCardSide(prev => prev === "main" ? "partner" : "main")}
                disabled={!canSwitch}
                style={{
                  background: canSwitch ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none", borderRadius: "8px", padding: "6px",
                  color: canSwitch ? "#fff" : "transparent", cursor: canSwitch ? "pointer" : "default",
                  display: "flex", alignItems: "center",
                }}
              >
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => setZoomedCardSide(null)}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "50%", width: "30px", height: "30px", color: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Card image */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            {zoomedImg ? (
              <img
                src={zoomedImg} alt={zoomedName ?? ""}
                style={{ maxHeight: "290px", borderRadius: "12px", boxShadow: "0 12px 40px rgba(0,0,0,0.7)", display: "block" }}
              />
            ) : (
              <div style={{ width: "200px", height: "280px", borderRadius: "12px", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No image</span>
              </div>
            )}
          </div>

          {/* Type line + mana cost */}
          {zoomedCard && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px",
            }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{zoomedCard.type_line ?? "—"}</span>
              {zoomedCard.mana_cost && (
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {zoomedCard.mana_cost}
                </span>
              )}
            </div>
          )}

          {/* Oracle text */}
          {zoomedCard?.oracle_text && (
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", padding: "12px 14px", marginBottom: "14px",
            }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {zoomedCard.oracle_text}
              </div>
            </div>
          )}

          {/* Rulings */}
          <div>
            <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px" }}>
              Rulings
            </div>
            {rulingsLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Loading rulings…</div>
            ) : rulings && rulings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {rulings.map((r, i) => (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "8px", padding: "10px 12px",
                  }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginBottom: "4px" }}>{r.published_at}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>{r.comment}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No official rulings.</div>
            )}
          </div>

          {/* Swipe hint */}
          {canSwitch && (
            <div style={{ textAlign: "center", marginTop: "16px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
              ← Swipe to see {zoomedCardSide === "main" ? "Partner Commander" : "Commander"} →
            </div>
          )}
        </div>
      </BottomSheet>
    )}
    </>
  );
};

// ── Shared micro-styles ────────────────────────────────────────────────────────

const taxBtnStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)", border: "none", color: "#fff",
  width: "32px", height: "32px", borderRadius: "8px",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};
