import React, { useState, useRef } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, Search, Zap,
  Swords, RefreshCw, AlertTriangle, BookMarked, Star, Layers
} from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

interface RuleItem {
  term: string;
  definition: string;
  example?: string;
}

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  rules: RuleItem[];
}

const SECTIONS: Section[] = [
  {
    id: "commander",
    title: "Commander Fundamentals",
    icon: Star,
    color: "#eab308",
    rules: [
      { term: "Starting Life", definition: "Each player begins with 40 life in multiplayer Commander. In 1v1 Duel Commander, each player starts at 20." },
      { term: "Commander Damage", definition: "A player who has been dealt 21 or more combat damage by a single commander over the course of the game loses the game. Only combat damage counts.", example: "If your commander deals 10 damage in one game and 11 in another, that's 21 total and the opponent loses." },
      { term: "Commander Tax", definition: "Each time a commander is cast from the command zone, it costs 2 more generic mana than it did the last time it was cast from there this game.", example: "Commander cost {3}{G}: First cast = {3}{G}, second = {3}{G}{2}, third = {3}{G}{2}{2}." },
      { term: "Command Zone", definition: "A commander may be returned to the command zone instead of going to the graveyard or exile. This is a replacement effect — it still counts as a death or exile trigger." },
      { term: "Color Identity", definition: "A card's color identity includes every mana symbol that appears anywhere on the card — mana cost, rules text, and color indicators. Cards in a Commander deck cannot have a color outside the commander's color identity.", example: "Chromatic Lantern is colorless because its oracle text says 'add one mana of any color' — those are regular words, not actual colored mana symbols {W}{U}{B}{R}{G}. By contrast, Ramos, Dragon Engine contains {W}{U}{B}{R}{G} symbols in its rules text and has five-color identity." },
      { term: "Legend Rule", definition: "If a player controls two or more legendary permanents with the same name, that player chooses one and puts the rest into their graveyard." },
      { term: "Uniqueness Rule (Commander)", definition: "A Commander deck may contain only one card of any given name, except for basic lands." },
    ],
  },
  {
    id: "stack",
    title: "The Stack & Priority",
    icon: Layers,
    color: "#06b6d4",
    rules: [
      { term: "The Stack", definition: "A zone where spells and abilities wait to resolve. The Stack is LIFO — Last In, First Out. The most recently added object resolves first." },
      { term: "Priority", definition: "Only one player may cast spells or activate abilities at a time. The active player (whose turn it is) receives priority first, then priority passes clockwise." },
      { term: "Resolving the Stack", definition: "After all players pass priority in succession without doing anything, the topmost object on the stack resolves. Then the active player receives priority again." },
      { term: "Responding to Spells", definition: "After a spell or ability is placed on the stack, each player gets a chance to respond before it resolves.", example: "Your opponent casts Counterspell. You may respond with your own instant before Counterspell resolves." },
      { term: "Mana Abilities", definition: "Mana abilities do NOT use the stack and cannot be responded to. They resolve immediately. Triggered abilities that produce mana are also mana abilities." },
      { term: "Split Second", definition: "While a spell with split second is on the stack, players cannot cast other spells or activate non-mana abilities. Triggered abilities still trigger." },
    ],
  },
  {
    id: "sba",
    title: "State-Based Actions",
    icon: AlertTriangle,
    color: "#f43f5e",
    rules: [
      { term: "What Are SBAs?", definition: "State-based actions are game rules checked automatically whenever a player would receive priority. They don't use the stack and cannot be responded to." },
      { term: "0 or Less Life", definition: "A player with 0 or less life loses the game." },
      { term: "Poison Counters", definition: "A player with 10 or more poison counters loses the game." },
      { term: "Commander Damage", definition: "A player who has been dealt 21 or more combat damage from a single commander loses the game." },
      { term: "Lethal Damage", definition: "A creature with damage equal to or greater than its toughness is destroyed. Indestructible creatures are immune to this." },
      { term: "0 or Less Toughness", definition: "A creature with toughness 0 or less is put into its owner's graveyard. This is not destruction — it bypasses indestructible." },
      { term: "Aura Without Target", definition: "An Aura that is attached to an illegal or no longer existing permanent is put into its owner's graveyard." },
      { term: "Legend Rule", definition: "If a player controls two or more legendary permanents with the same name, that player keeps one and the rest go to the graveyard." },
    ],
  },
  {
    id: "keywords",
    title: "Combat Keywords",
    icon: Swords,
    color: "#10b981",
    rules: [
      { term: "Deathtouch", definition: "Any amount of damage dealt by a source with deathtouch is enough to destroy the damaged creature.", example: "A 1/1 with deathtouch destroys a 10/10 in combat if it deals even 1 damage to it." },
      { term: "Trample", definition: "If a creature with trample is blocked, excess damage beyond what would kill the blockers may be assigned to the defending player (or their planeswalker).", example: "A 6/6 with trample is blocked by a 2/2. The attacker assigns 2 to the blocker (lethal) and 4 to the defending player." },
      { term: "Lifelink", definition: "Damage dealt by a source with lifelink causes its controller to gain that much life simultaneously with the damage being dealt." },
      { term: "First Strike", definition: "Creatures with first strike deal combat damage in a first combat damage step, before creatures without it. If a blocker dies to first strike damage, it never deals damage back." },
      { term: "Double Strike", definition: "A creature with double strike deals combat damage in both the first and the regular combat damage steps." },
      { term: "Vigilance", definition: "Attacking does not cause this creature to tap." },
      { term: "Haste", definition: "This creature can attack and use tap abilities the turn it comes under your control, ignoring summoning sickness." },
      { term: "Flash", definition: "This spell may be cast at any time you could cast an instant — on any player's turn, in response to anything on the stack." },
      { term: "Reach", definition: "This creature can block creatures with flying." },
      { term: "Menace", definition: "This creature can only be blocked by two or more creatures." },
      { term: "Hexproof", definition: "This permanent cannot be the target of spells or abilities controlled by your opponents." },
      { term: "Indestructible", definition: "This permanent cannot be destroyed by effects or by lethal damage. It can still be sacrificed, exiled, or have its toughness reduced to 0 or less." },
      { term: "Shroud", definition: "This permanent cannot be the target of any spells or abilities — including those controlled by its own controller." },
      { term: "Protection", definition: "A permanent with protection from [quality] cannot be damaged, enchanted, equipped, blocked, or targeted by anything with that quality.", example: "Protection from red means the creature can't be targeted by red spells, can't be blocked by red creatures, and red damage is prevented." },
    ],
  },
  {
    id: "abilities",
    title: "Triggered vs Activated Abilities",
    icon: Zap,
    color: "#a78bfa",
    rules: [
      { term: "Triggered Abilities", definition: "Abilities that begin with 'When,' 'Whenever,' or 'At.' They trigger automatically when their condition is met and are placed on the stack.", example: "\"When this creature enters, draw a card.\" This triggers as the creature enters the battlefield." },
      { term: "Activated Abilities", definition: "Abilities in the format [Cost]: [Effect]. The controller chooses when to use them. They use the stack and can be responded to.", example: "\"{T}: Add {G}\" or \"Sacrifice this: Draw a card.\"" },
      { term: "Mana Abilities", definition: "An activated ability that produces mana (or a triggered ability from a mana ability) does NOT use the stack. It resolves immediately." },
      { term: "Static Abilities", definition: "Abilities that create continuous effects simply by existing. No trigger, no activation. Examples: Flying, Trample, \"Other creatures you control get +1/+1.\"" },
      { term: "Missed Triggers", definition: "If both players overlook a mandatory trigger, the trigger is considered missed. Optional triggers ('may') can be declined without penalty." },
      { term: "Loyalty Abilities", definition: "Planeswalker loyalty abilities are activated abilities. A planeswalker can only activate one loyalty ability per turn, only during your main phase when the stack is empty." },
    ],
  },
  {
    id: "replacement",
    title: "Replacement Effects",
    icon: RefreshCw,
    color: "#f97316",
    rules: [
      { term: "What Are They?", definition: "Replacement effects use 'instead' or 'as X happens' language. They intercept an event and replace it with a different event. They do NOT use the stack." },
      { term: "Cannot Be Responded To", definition: "Because replacement effects don't use the stack, you cannot respond to them. They simply modify an event as it happens." },
      { term: "Multiple Replacements", definition: "If multiple replacement effects try to modify the same event, the player being most affected (or the controller of the permanent) chooses which replacement applies first.", example: "If a creature would die and you control both Leyline of the Void and a graveyard-to-exile effect, you choose the order." },
      { term: "Commander Zone Replacement", definition: "When your commander would go to the graveyard or exile, you may replace that event by putting it into the command zone. This is a replacement effect.", example: "Your commander dying still triggers 'dies' abilities, because the event (death) still happened — it was just also replaced." },
      { term: "Doubling Season", definition: "Doubling Season replaces the event of 'placing a counter' or 'creating a token' with placing twice as many. Planeswalkers entering with Doubling Season in play enter with double their printed loyalty." },
    ],
  },
  {
    id: "misconceptions",
    title: "Common Misconceptions",
    icon: BookMarked,
    color: "#ec4899",
    rules: [
      { term: "Tokens & the Graveyard", definition: "Tokens that leave the battlefield are immediately removed from the game. They cannot be returned from the graveyard — they cease to exist as they enter the graveyard.", example: "Reanimate cannot target a token in a graveyard." },
      { term: "Summoning Sickness", definition: "A creature has summoning sickness if it has been under your control since the start of your current turn. It can block on any turn, but cannot attack or use tap abilities until the turn after it entered under your control.", example: "If you steal an opponent's creature, it immediately has summoning sickness for you." },
      { term: "Indestructible ≠ Untouchable", definition: "Indestructible creatures can still be: sacrificed, exiled, have their toughness reduced to 0 or less, returned to hand, or become the target of spells." },
      { term: "Copy Effects", definition: "Copies of spells or permanents copy the printed values plus any copy-modifying effects. They do NOT copy counters, Auras, Equipment, or damage already on the object." },
      { term: "Phasing", definition: "Phased-out permanents and their attached permanents are treated as though they don't exist. They don't trigger 'leaves the battlefield' and 'enters the battlefield' abilities." },
      { term: "The 'Dies' Trigger", definition: "A creature 'dies' when it goes from the battlefield to the graveyard. Even if the creature is then moved (e.g., via a replacement effect to exile or the command zone), the death trigger still occurred." },
      { term: "Drawing on an Empty Library", definition: "A player who is forced to draw a card from an empty library loses the game. This is checked as a state-based action. Having 0 cards in library is not itself a loss." },
      { term: "Tapping for Mana Uses the Stack?", definition: "No. Activating a mana ability (like tapping a land for mana) does NOT use the stack. It resolves immediately and cannot be countered or responded to." },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const QuickRules: React.FC = () => {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["commander"]));
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll   = () => setOpenSections(new Set(SECTIONS.map(s => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  const q = search.trim().toLowerCase();

  const filteredSections = SECTIONS.map(section => ({
    ...section,
    rules: q
      ? section.rules.filter(r =>
          r.term.toLowerCase().includes(q) ||
          r.definition.toLowerCase().includes(q) ||
          (r.example || "").toLowerCase().includes(q)
        )
      : section.rules,
  })).filter(s => !q || s.rules.length > 0);

  return (
    <div style={{ height: "calc(100vh - 48px)", display: "flex", flexDirection: "column", gap: "0", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "16px", flexShrink: 0, flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(139,92,246,0.35)" }}>
            <BookOpen size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Quick Rules Reference</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Most commonly looked-up MTG rules in one place</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={expandAll}   className="glass-button" aria-label="Expand all rule sections" style={{ padding: "6px 12px", fontSize: "0.78rem" }}>Expand All</button>
          <button onClick={collapseAll} className="glass-button" aria-label="Collapse all rule sections" style={{ padding: "6px 12px", fontSize: "0.78rem" }}>Collapse All</button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: "relative", marginBottom: "16px", flexShrink: 0 }}>
        <Search size={15} color="var(--text-muted)" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search rules, keywords, mechanics…"
          aria-label="Search rules, keywords, and mechanics"
          className="glass-input"
          style={{ width: "100%", paddingLeft: "36px", paddingRight: "12px", fontSize: "0.88rem" }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Sections — minHeight:0 lets the flex item shrink past its content size so overflowY:auto actually scrolls */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
        {filteredSections.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "60px" }}>
            <BookOpen size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p>No rules found for "<strong>{search}</strong>"</p>
          </div>
        )}

        {filteredSections.map(section => {
          const isOpen = openSections.has(section.id) || !!q;
          const Icon = section.icon;

          return (
            <div
              key={section.id}
              style={{ border: `1px solid ${isOpen ? `${section.color}30` : "var(--border-color)"}`, borderRadius: "12px", overflow: "hidden", transition: "border-color 0.2s ease" }}
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${section.title} section`}
                aria-expanded={isOpen}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", background: isOpen ? `${section.color}0c` : "rgba(255,255,255,0.01)",
                  border: "none", cursor: "pointer", color: "#fff", transition: "background 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: `${section.color}20`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={16} color={section.color} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: isOpen ? section.color : "var(--text-primary)" }}>
                      {section.title}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      {section.rules.length} rule{section.rules.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                {isOpen
                  ? <ChevronDown size={16} color="var(--text-muted)" />
                  : <ChevronRight size={16} color="var(--text-muted)" />
                }
              </button>

              {/* Rules List — scrollable within each section so nothing is clipped */}
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0", borderTop: `1px solid ${section.color}20`, maxHeight: "350px", overflowY: "auto" }}>
                  {section.rules.map((rule, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "13px 18px",
                        borderBottom: idx < section.rules.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        background: "rgba(0,0,0,0.15)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: section.color, marginTop: "7px", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff", marginBottom: "4px" }}>
                            {rule.term}
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                            {rule.definition}
                          </div>
                          {rule.example && (
                            <div style={{
                              marginTop: "8px", padding: "8px 12px", borderRadius: "8px",
                              background: `${section.color}0d`, border: `1px solid ${section.color}22`,
                              fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5, fontStyle: "italic",
                            }}>
                              💡 {rule.example}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ marginTop: "8px", padding: "12px 16px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", textAlign: "center" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            For complex or edge-case rulings, use the <strong style={{ color: "var(--accent-purple)" }}>AI Judge</strong> tab — it has access to the full Comprehensive Rules and WotC official rulings.
          </p>
        </div>
      </div>
    </div>
  );
};
