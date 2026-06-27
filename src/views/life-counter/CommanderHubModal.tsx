import React, { useState, useEffect, useRef } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { searchCardFuzzy, getCardImage } from "../../services/scryfall";
import type { ScryfallCard } from "../../services/scryfall";
import type { Player, ManaKey } from "../../types/game";
import { Crown, Trash2, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type HubTab = "commander" | "counters" | "mana";

type CounterKey = "generic" | "energy" | "poison" | "experience" | "ringLevel" | "storm" | "rad";

export interface CommanderHubModalProps {
  player: Player;

  onUpdateArt: (x: number, y: number, zoom: number | undefined) => void;
  onClearCommander: () => void;
  onSetPartnerCommander: (name: string) => void;
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

const COUNTER_DEFS: { key: CounterKey; label: string; emoji: string; color: string; max?: number }[] = [
  { key: "storm",      label: "Storm",      emoji: "⛈",  color: "#818cf8" },
  { key: "generic",    label: "Generic",    emoji: "⬡",  color: "#94a3b8" },
  { key: "energy",     label: "Energy",     emoji: "⚡", color: "#fbbf24" },
  { key: "poison",     label: "Poison",     emoji: "💀", color: "#10b981", max: 10 },
  { key: "experience", label: "Experience", emoji: "⭐", color: "#a78bfa" },
  { key: "ringLevel",  label: "The Ring",   emoji: "💍", color: "#c084fc", max: 4 },
  { key: "rad",        label: "Radiation",  emoji: "☢️", color: "#84cc16" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const CommanderHubModal: React.FC<CommanderHubModalProps> = ({
  player: p,
  onUpdateArt, onClearCommander,
  onSetPartnerCommander, onClearPartnerCommander,
  adjustTax, togglePartner,
  adjustCounter, clearCounters,
  assignMonarch, releaseMonarch, assignInitiative, releaseInitiative, toggleCityBlessing,
  adjustMana, adjustStorm, clearMana,
  onOpenEdit, onClose,
  initialTab = "commander",
}) => {
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [flipped, setFlipped] = useState(false);

  // Commander card images
  const [mainCard, setMainCard]       = useState<ScryfallCard | null>(null);
  const [partnerCard, setPartnerCard] = useState<ScryfallCard | null>(null);
  const [mainLoading, setMainLoading] = useState(false);
  const [partnerLoading, setPartnerLoading] = useState(false);

  // Partner search
  const [partnerInput, setPartnerInput]           = useState(p.partnerCommanderName ?? "");
  const [partnerSuggestions, setPartnerSuggestions] = useState<ScryfallCard[]>([]);
  const [showPartnerSug, setShowPartnerSug]         = useState(false);
  const partnerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerInputRef    = useRef<HTMLInputElement>(null);

  // Swipe detection
  const touchStartX    = useRef(0);
  const touchStartTime = useRef(0);
  const touchStartEl   = useRef<EventTarget | null>(null);

  const TAB_ORDER: HubTab[] = ["commander", "counters", "mana"];

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
      if (dx < 0 && idx < 2) setActiveTab(TAB_ORDER[idx + 1]);
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

  // Keep partnerInput in sync so clearing the partner resets the search field
  useEffect(() => { setPartnerInput(p.partnerCommanderName ?? ""); }, [p.partnerCommanderName]);

  // Partner autocomplete debounce
  const onPartnerInputChange = (val: string) => {
    setPartnerInput(val);
    if (partnerDebounceRef.current) clearTimeout(partnerDebounceRef.current);
    if (val.length < 2) { setPartnerSuggestions([]); setShowPartnerSug(false); return; }
    partnerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}&include_extras=false`);
        const json = await res.json();
        setPartnerSuggestions((json.data ?? []).slice(0, 6).map((name: string) => ({ name } as ScryfallCard)));
        setShowPartnerSug(true);
      } catch { /* ignore */ }
    }, 280);
  };

  const confirmPartner = (name: string) => {
    onSetPartnerCommander(name);
    setPartnerInput(name);
    setShowPartnerSug(false);
  };

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

  const TabBar = () => (
    <div style={{
      display: "flex", gap: "4px",
      background: "rgba(0,0,0,0.3)", borderRadius: "10px", padding: "3px",
      marginBottom: "16px",
    }}>
      {(["commander", "counters", "mana"] as HubTab[]).map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            flex: 1, padding: "8px 4px",
            background: activeTab === tab ? "rgba(139,92,246,0.35)" : "transparent",
            border: activeTab === tab ? "1px solid rgba(139,92,246,0.5)" : "1px solid transparent",
            borderRadius: "8px",
            color: activeTab === tab ? "#fff" : "var(--text-muted)",
            fontSize: "0.75rem", fontWeight: activeTab === tab ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s",
            textTransform: "capitalize",
          }}
        >
          {tab === "commander" ? "⚔ Commander" : tab === "counters" ? "🎯 Counters" : "🔮 Mana"}
        </button>
      ))}
    </div>
  );

  // ── Commander Tab ─────────────────────────────────────────────────────────────

  const CommanderTab = () => (
    <div>
      {/* Card flip display */}
      <div
        style={{ perspective: "800px", marginBottom: "12px", cursor: hasPartner ? "pointer" : "default" }}
        onClick={() => hasPartner && setFlipped(f => !f)}
      >
        <div style={{
          position: "relative", transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.45s ease",
          height: "200px",
        }}>
          {/* Front: main commander */}
          <div style={{
            position: "absolute", inset: 0, backfaceVisibility: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!p.commanderName ? (
              <div style={{
                width: "140px", height: "196px", borderRadius: "10px",
                background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.15)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
              }}>
                <Crown size={28} color="rgba(255,255,255,0.25)" />
                <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", textAlign: "center" }}>No commander set</span>
              </div>
            ) : mainLoading ? (
              <div style={{ width: "140px", height: "196px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Loading…</span>
              </div>
            ) : mainImgSrc ? (
              <img src={mainImgSrc} alt={p.commanderName} style={{ height: "196px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }} />
            ) : (
              <div style={{
                width: "140px", height: "196px", borderRadius: "10px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>{p.commanderName}</span>
              </div>
            )}
          </div>
          {/* Back: partner commander */}
          {hasPartner && (
            <div style={{
              position: "absolute", inset: 0, backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {partnerLoading ? (
                <div style={{ width: "140px", height: "196px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Loading…</span>
                </div>
              ) : partnerImgSrc ? (
                <img src={partnerImgSrc} alt={p.partnerCommanderName} style={{ height: "196px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }} />
              ) : (
                <div style={{ width: "140px", height: "196px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>{p.partnerCommanderName}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {hasPartner && (
          <div style={{ textAlign: "center", fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Tap to flip • {flipped ? (p.partnerCommanderName ?? "Partner") : (p.commanderName ?? "Main")}
          </div>
        )}
      </div>

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
                onClick={() => onUpdateArt(p.artOffsetX ?? 50, p.artOffsetY ?? 35, p.artZoom)}
                style={{
                  flex: 1, padding: "7px 4px",
                  background: active ? "rgba(139,92,246,0.25)" : "rgba(0,0,0,0.25)",
                  border: `1px solid ${active ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)"}`,
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
            background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)",
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
              background: "rgba(139,92,246,0.15)", border: "1px dashed rgba(139,92,246,0.4)",
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
          {/* Input is always mounted so iOS focus() works within the tap gesture */}
          <div style={{ position: "relative" }}>
            <input
              ref={partnerInputRef}
              value={partnerInput}
              onChange={e => onPartnerInputChange(e.target.value)}
              onFocus={() => partnerInput.length >= 2 && setShowPartnerSug(true)}
              onBlur={() => setTimeout(() => setShowPartnerSug(false), 150)}
              placeholder="Search partner commander…"
              style={{
                width: "100%", padding: "10px 12px", boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px", color: "#fff", fontSize: "0.88rem",
                outline: "none",
              }}
            />
            {showPartnerSug && partnerSuggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#1e1a2e", border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: "10px", zIndex: 10, overflow: "hidden",
              }}>
                {partnerSuggestions.map(s => (
                  <button
                    key={s.name}
                    onMouseDown={() => confirmPartner(s.name)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 14px", background: "none", border: "none",
                      color: "var(--text-primary)", fontSize: "0.85rem", cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {s.name}
                  </button>
                  ))}
                </div>
              )}
            {/* Display overlay — sits on top of the input when a partner is already set */}
            {p.partnerCommanderName && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)",
                borderRadius: "10px", padding: "0 12px",
              }}>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff" }}>{p.partnerCommanderName}</span>
                <button
                  onClick={() => {
                    onClearPartnerCommander();
                    requestAnimationFrame(() => partnerInputRef.current?.focus());
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            </div>
        </div>
      )}

      {/* Tax section */}
      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px" }}>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px" }}>Commander Tax</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: p.partnerMode ? "10px" : 0 }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>Main</span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => adjustTax(p.id, false, -2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>−</span></button>
            <span style={{ fontSize: "1.4rem", fontWeight: 900, color: p.tax > 0 ? "#a855f7" : "var(--text-muted)", minWidth: "32px", textAlign: "center" }}>{p.tax}</span>
            <button onClick={() => adjustTax(p.id, false, 2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>+</span></button>
          </div>
        </div>
        {p.partnerMode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>Partner</span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={() => adjustTax(p.id, true, -2)} style={taxBtnStyle}><span style={{ fontSize: "0.85rem", fontWeight: 700 }}>−</span></button>
              <span style={{ fontSize: "1.4rem", fontWeight: 900, color: p.taxPartner > 0 ? "#a855f7" : "var(--text-muted)", minWidth: "32px", textAlign: "center" }}>{p.taxPartner}</span>
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
          background: p.partnerMode ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${p.partnerMode ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: "10px", color: p.partnerMode ? "#a855f7" : "var(--text-secondary)",
          fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", marginBottom: "10px",
        }}
      >
        {p.partnerMode ? "✓ Partner Mode On  — Disable" : "+ Enable Partner Mode"}
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
          }}
        >
          ✏ Edit Commander / Player Name
        </button>
      )}
    </div>
  );

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
        {COUNTER_DEFS.map(({ key, label, emoji, color, max }) => {
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
              <span style={{ fontSize: "1.1rem", marginRight: "10px" }}>{emoji}</span>
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
        background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.3)",
        borderRadius: "12px", padding: "12px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff" }}>⛈ Storm</div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "2px" }}>Copies cast this turn</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => adjustStorm(p.id, -1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer" }}>−</button>
          <span style={{ fontSize: "1.4rem", fontWeight: 900, color: "#a855f7", minWidth: "28px", textAlign: "center" }}>{p.storm ?? 0}</span>
          <button onClick={() => adjustStorm(p.id, 1)} style={{ background: "rgba(0,0,0,0.3)", border: "none", color: "#fff", width: "32px", height: "32px", borderRadius: "8px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer" }}>+</button>
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <BottomSheet
      onClose={onClose}
      zIndex={1000}
      maxWidth="440px"
      padding="20px"
      alwaysCentered={true}
      aria-label={`${p.name} Commander Hub`}
    >
      {/* Player name header */}
      <div style={{ textAlign: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{p.name}</div>
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
        {activeTab === "counters"  && <CountersTab />}
        {activeTab === "mana"      && <ManaTab />}
      </div>
    </BottomSheet>
  );
};

// ── Shared micro-styles ────────────────────────────────────────────────────────

const taxBtnStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)", border: "none", color: "#fff",
  width: "32px", height: "32px", borderRadius: "8px",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};
