import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  Play, SkipForward, Trophy, RotateCcw, Package,
} from "lucide-react";

type Phase         = "setup" | "drafting" | "pairings";
type PairingFormat = "1v1" | "3-way" | "4-way";

interface DraftConfig {
  playerCount:   number;
  packsEach:     number;
  picksPerPack:  number;
  timerSeconds:  number; // 0 = off
  rounds:        number;
  setName:       string;
  playerNames:   string[];
  pairingFormat: PairingFormat;
}

/** A match is any group of 2+ players. Byes are a solo entry with winner pre-set. */
interface MatchResult {
  round:   number;
  players: number[]; // indices into config.playerNames
  winner:  number | null;
}

// ── Pairing helpers ────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function calcPoints(playerCount: number, matches: MatchResult[]): number[] {
  const pts = Array(playerCount).fill(0);
  matches.forEach(m => {
    if (m.winner === null) return;
    pts[m.winner] += 3;
    m.players.filter(p => p !== m.winner).forEach(p => { pts[p] += 1; });
  });
  return pts;
}

function sortedByPoints(playerCount: number, matches: MatchResult[]): number[] {
  const pts = calcPoints(playerCount, matches);
  return shuffle(Array.from({ length: playerCount }, (_, i) => i))
    .sort((a, b) => pts[b] - pts[a]);
}

/** 1v1 Swiss — pairs by points, avoids rematches when possible. */
function gen1v1(order: number[], round: number, prev: MatchResult[]): MatchResult[] {
  const paired = new Set<number>();
  const out: MatchResult[] = [];

  for (let i = 0; i < order.length; i++) {
    const p1 = order[i];
    if (paired.has(p1)) continue;

    let p2 = -1;
    for (let j = i + 1; j < order.length; j++) {
      const c = order[j];
      if (paired.has(c)) continue;
      const rematch = prev.some(
        m => m.players.length === 2 && m.players.includes(p1) && m.players.includes(c)
      );
      if (!rematch) { p2 = c; break; }
      if (p2 === -1) p2 = c; // accept rematch as last resort
    }

    if (p2 === -1) {
      // Bye — automatic win for the odd player
      out.push({ round, players: [p1], winner: p1 });
      paired.add(p1);
    } else {
      out.push({ round, players: [p1, p2], winner: null });
      paired.add(p1);
      paired.add(p2);
    }
  }
  return out;
}

/**
 * Pod pairings — group players into pods of `podSize`.
 *
 * Odd-player handling:
 *   - 1 leftover  → add to the last pod (making it podSize+1)
 *   - 2 leftover with podSize 3 → one 2-player match (treated as normal 1v1)
 *   - 2 leftover with podSize 4 → add one to each of the last two pods
 *   - 0 leftover  → perfect split
 */
function genPods(order: number[], round: number, podSize: number): MatchResult[] {
  const out: MatchResult[] = [];
  const players = [...order];

  while (players.length > 0) {
    const rem = players.length;

    if (rem <= podSize) {
      // Last chunk — use whatever is left (could be 1 = bye, 2+ = match)
      if (rem === 1) {
        out.push({ round, players: [players[0]], winner: players[0] }); // bye
      } else {
        out.push({ round, players: players.splice(0), winner: null });
      }
      break;
    }

    // Special: podSize=3 with 4 left → one 4-way pod beats 3+1-bye
    if (podSize === 3 && rem === 4) {
      out.push({ round, players: players.splice(0, 4), winner: null });
      break;
    }

    // Special: podSize=4 with 5 left → one 5-way pod beats 4+1-bye
    if (podSize === 4 && rem === 5) {
      out.push({ round, players: players.splice(0, 5), winner: null });
      break;
    }

    out.push({ round, players: players.splice(0, podSize), winner: null });
  }

  return out;
}

function generatePairings(
  playerCount:   number,
  round:         number,
  prev:          MatchResult[],
  format:        PairingFormat,
): MatchResult[] {
  const order = sortedByPoints(playerCount, prev);
  if (format === "1v1")   return gen1v1(order, round, prev);
  if (format === "3-way") return genPods(order, round, 3);
  return                         genPods(order, round, 4);
}

// ── Shared styles ──────────────────────────────────────────────────────────

const PILL: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)",
  fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
};
const PILL_ACTIVE: React.CSSProperties = {
  ...PILL,
  background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.4)",
  color: "var(--accent-purple)",
};
const LABEL: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "10px",
};

// ── Setup Screen ───────────────────────────────────────────────────────────

interface SetupProps { onStart: (cfg: DraftConfig) => void; }

const FORMAT_INFO: Record<PairingFormat, { label: string; desc: string }> = {
  "1v1":   { label: "1v1 Swiss",      desc: "Traditional Swiss pairings. Players are matched by record each round." },
  "3-way": { label: "3-Way Pods",     desc: "Players compete in 3-person pods. One winner per pod. Great for small Commander drafts." },
  "4-way": { label: "4-Way Pods",     desc: "Players compete in 4-person Commander pods. One winner per pod per round." },
};

const DEFAULT_ROUNDS: Record<PairingFormat, number> = { "1v1": 3, "3-way": 3, "4-way": 2 };

function SetupScreen({ onStart }: SetupProps) {
  const [playerCount,    setPlayerCount]    = useState(8);
  const [packsEach,      setPacksEach]      = useState(3);
  const [picksEach,      setPicksEach]      = useState(15);
  const [timer,          setTimer]          = useState(75);
  const [pairingFormat,  setPairingFormat]  = useState<PairingFormat>("1v1");
  const [rounds,         setRounds]         = useState(3);
  const [setName,        setSetName]        = useState("");
  const [names,          setNames]          = useState<string[]>(
    Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNames(prev => {
      const next = [...prev];
      while (next.length < playerCount) next.push(`Player ${next.length + 1}`);
      return next.slice(0, playerCount);
    });
  }, [playerCount]);

  const handleFormatChange = (f: PairingFormat) => {
    setPairingFormat(f);
    setRounds(DEFAULT_ROUNDS[f]);
  };

  const stepper = (label: string, val: number, set: (v: number) => void, min: number, max: number) => (
    <div>
      <label style={LABEL}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={() => set(Math.max(min, val - 1))} style={{ ...PILL, padding: "6px 12px" }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: "1.2rem", fontWeight: 800, minWidth: "28px", textAlign: "center" }}>{val}</span>
        <button onClick={() => set(Math.min(max, val + 1))} style={{ ...PILL, padding: "6px 12px" }}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "520px", margin: "0 auto" }}>

      {/* Player count */}
      <div>
        <label style={LABEL}>Players</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[4, 5, 6, 7, 8, 10, 12].map(n => (
            <button key={n} style={playerCount === n ? PILL_ACTIVE : PILL} onClick={() => setPlayerCount(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Packs + picks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {stepper("Packs each",    packsEach, setPacksEach, 1, 6)}
        {stepper("Picks per pack", picksEach, setPicksEach, 5, 20)}
      </div>

      {/* Timer */}
      <div>
        <label style={LABEL}>Pick timer</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[0, 45, 60, 75, 90].map(s => (
            <button key={s} style={timer === s ? PILL_ACTIVE : PILL} onClick={() => setTimer(s)}>
              {s === 0 ? "Off" : `${s}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Pairing format */}
      <div>
        <label style={LABEL}>Pairing format</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          {(Object.keys(FORMAT_INFO) as PairingFormat[]).map(f => (
            <button key={f} style={pairingFormat === f ? PILL_ACTIVE : PILL} onClick={() => handleFormatChange(f)}>
              {FORMAT_INFO[f].label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5, wordBreak: "break-word" }}>
          {FORMAT_INFO[pairingFormat].desc}
          {pairingFormat !== "1v1" && playerCount % (pairingFormat === "3-way" ? 3 : 4) !== 0 && (
            <span style={{ color: "var(--accent-gold)" }}>
              {" "}With {playerCount} players, one pod will be adjusted for the odd count.
            </span>
          )}
        </p>
      </div>

      {/* Rounds */}
      <div>
        {stepper("Rounds", rounds, setRounds, 1, 8)}
      </div>

      {/* Set name */}
      <div>
        <label style={LABEL}>
          Set name{" "}
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </label>
        <input
          type="text"
          className="glass-input"
          placeholder="e.g. Bloomburrow, Duskmourn…"
          value={setName}
          onChange={e => setSetName(e.target.value)}
          style={{ width: "100%", fontSize: "16px" }}
        />
      </div>

      {/* Player names */}
      <div>
        <label style={LABEL}>Player names</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {names.map((name, i) => (
            <input
              key={i}
              type="text"
              className="glass-input"
              value={name}
              onChange={e => setNames(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
              style={{ fontSize: "16px", minWidth: 0, width: "100%", boxSizing: "border-box" }}
            />
          ))}
        </div>
      </div>

      <button
        className="glass-button"
        style={{
          width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700,
          background: "rgba(139,92,246,0.2)", borderColor: "rgba(139,92,246,0.4)",
          color: "var(--accent-purple)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        }}
        onClick={() => onStart({
          playerCount, packsEach, picksPerPack: picksEach,
          timerSeconds: timer, rounds, setName, playerNames: names, pairingFormat,
        })}
      >
        <Play size={18} /> Start Draft
      </button>
    </div>
  );
}

// ── Drafting Screen ────────────────────────────────────────────────────────

interface DraftingProps {
  config:           DraftConfig;
  onDraftComplete:  () => void;
  onReset:          () => void;
}

function DraftingScreen({ config, onDraftComplete, onReset }: DraftingProps) {
  const totalPicks   = config.packsEach * config.picksPerPack;
  const [globalPick,  setGlobalPick]  = useState(0);
  const [timerLeft,   setTimerLeft]   = useState(config.timerSeconds);
  const [timerActive, setTimerActive] = useState(config.timerSeconds > 0);

  const currentPack = Math.floor(globalPick / config.picksPerPack) + 1;
  const pickInPack  = (globalPick % config.picksPerPack) + 1;
  const passLeft    = currentPack % 2 === 1;
  const done        = globalPick >= totalPicks;

  const advancePick = useCallback(() => {
    if (done) return;
    setGlobalPick(g => g + 1);
    setTimerLeft(config.timerSeconds);
    if (config.timerSeconds > 0) setTimerActive(true);
  }, [done, config.timerSeconds]);

  useEffect(() => {
    if (!timerActive || done || config.timerSeconds === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (timerLeft <= 0) { advancePick(); return; }
    const id = setInterval(() => setTimerLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [timerActive, timerLeft, done, advancePick]);

  const timerPct   = config.timerSeconds > 0 ? (timerLeft / config.timerSeconds) * 100 : 100;
  const timerColor = timerLeft <= 5 ? "#f43f5e" : timerLeft <= 15 ? "#f59e0b" : "#8b5cf6";
  const overallPct = (globalPick / totalPicks) * 100;

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "32px 0" }}>
        <div style={{ fontSize: "3rem" }}>🎉</div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Draft Complete!</h2>
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
          All picks done.{config.setName ? ` Good luck building your ${config.setName} deck!` : " Good luck building!"}
        </p>
        <button
          className="glass-button"
          style={{
            padding: "14px 28px", fontSize: "1rem", fontWeight: 700,
            background: "rgba(139,92,246,0.2)", borderColor: "rgba(139,92,246,0.4)",
            color: "var(--accent-purple)", display: "flex", alignItems: "center", gap: "8px",
          }}
          onClick={onDraftComplete}
        >
          <Trophy size={18} /> View Pairings
        </button>
        <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem" }} onClick={onReset}>
          New draft
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "480px", margin: "0 auto" }}>

      {/* Pack pills */}
      <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
        {Array.from({ length: config.packsEach }, (_, i) => {
          const n = i + 1;
          const cur  = n === currentPack;
          const done = n < currentPack;
          return (
            <div key={i} style={{
              padding: "5px 14px", borderRadius: "20px", fontSize: "0.78rem", fontWeight: 700,
              background: cur ? "rgba(139,92,246,0.2)" : done ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${cur ? "rgba(139,92,246,0.5)" : done ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: cur ? "var(--accent-purple)" : done ? "var(--accent-emerald)" : "var(--text-muted)",
            }}>
              Pack {n}
            </div>
          );
        })}
      </div>

      {/* Main card */}
      <div className="glass-panel" style={{ padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        {config.setName && (
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
            {config.setName}
          </span>
        )}
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
          Pack {currentPack} of {config.packsEach}
        </div>
        <div style={{ fontSize: "4.5rem", fontWeight: 900, lineHeight: 1, color: "#fff" }}>{pickInPack}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>pick {pickInPack} of {config.picksPerPack}</div>

        {/* Direction */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "8px 20px", borderRadius: "20px",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {passLeft  ? <ArrowLeft  size={16} color="var(--accent-cyan)" /> : <span style={{ width: 16 }} />}
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            Pass {passLeft ? "left" : "right"}
          </span>
          {!passLeft ? <ArrowRight size={16} color="var(--accent-cyan)" /> : <span style={{ width: 16 }} />}
        </div>

        {/* Timer */}
        {config.timerSeconds > 0 && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: timerColor, fontVariantNumeric: "tabular-nums", transition: "color 0.3s" }}>
              {timerLeft}s
            </div>
            <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "3px", background: timerColor, width: `${timerPct}%`, transition: "width 1s linear, background 0.3s" }} />
            </div>
            <button style={{ ...PILL, padding: "5px 14px", fontSize: "0.8rem" }} onClick={() => setTimerActive(a => !a)}>
              {timerActive ? "Pause" : "Resume"}
            </button>
          </div>
        )}
      </div>

      {/* Overall progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Overall progress</span>
          <span>{globalPick} / {totalPicks} picks</span>
        </div>
        <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "2px", background: "var(--accent-purple)", width: `${overallPct}%`, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          className="glass-button"
          style={{
            flex: 1, padding: "14px", fontSize: "1rem", fontWeight: 700,
            background: "rgba(139,92,246,0.18)", borderColor: "rgba(139,92,246,0.4)",
            color: "var(--accent-purple)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
          onClick={advancePick}
        >
          <SkipForward size={18} /> Next Pick
        </button>
        <button className="glass-button" style={{ padding: "14px 16px" }} onClick={onReset} title="Reset draft">
          <RotateCcw size={18} color="var(--text-muted)" />
        </button>
      </div>

      {/* Players reminder */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
        {config.playerNames.map((name, i) => (
          <span key={i} style={{
            padding: "3px 10px", borderRadius: "12px", fontSize: "0.72rem",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            color: "var(--text-muted)",
          }}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Pairings Screen ────────────────────────────────────────────────────────

interface PairingsProps { config: DraftConfig; onReset: () => void; }

function PairingsScreen({ config, onReset }: PairingsProps) {
  const totalRounds  = config.rounds;
  const [currentRound, setCurrentRound] = useState(1);
  const [allMatches,   setAllMatches]   = useState<MatchResult[]>(() =>
    generatePairings(config.playerCount, 1, [], config.pairingFormat)
  );

  const roundMatches  = (r: number) => allMatches.filter(m => m.round === r);
  const roundComplete = (r: number) => roundMatches(r).every(m => m.winner !== null);

  const recordWin = (match: MatchResult, winner: number) => {
    setAllMatches(prev => prev.map(m =>
      m === match ? { ...m, winner } : m
    ));
  };

  const startNextRound = () => {
    const next = currentRound + 1;
    setAllMatches(prev => [
      ...prev,
      ...generatePairings(config.playerCount, next, prev, config.pairingFormat),
    ]);
    setCurrentRound(next);
  };

  // Standings
  const pts   = calcPoints(config.playerCount, allMatches);
  const order = Array.from({ length: config.playerCount }, (_, i) => i).sort((a, b) => pts[b] - pts[a]);
  const wins  = (pi: number) => allMatches.filter(m => m.winner === pi).length;
  const losses= (pi: number) => allMatches.filter(m => m.players.includes(pi) && m.winner !== null && m.winner !== pi && m.players.length > 1).length;

  const allDone = currentRound === totalRounds && roundComplete(totalRounds);
  const isLastGenerated = currentRound === Math.max(...allMatches.map(m => m.round));

  const isBye   = (m: MatchResult) => m.players.length === 1;
  const isPod   = (m: MatchResult) => m.players.length > 2;
  const matchLabel = (idx: number) =>
    config.pairingFormat === "1v1" ? `Match ${idx + 1}` : `Pod ${idx + 1}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "520px", margin: "0 auto" }}>

      {/* Round tabs */}
      <div style={{ display: "flex", gap: "8px" }}>
        {Array.from({ length: totalRounds }, (_, i) => {
          const r = i + 1;
          const accessible = r <= currentRound;
          return (
            <button
              key={r}
              disabled={!accessible}
              style={r === currentRound ? PILL_ACTIVE : { ...PILL, opacity: accessible ? 1 : 0.35 }}
              onClick={() => accessible && setCurrentRound(r)}
            >
              Round {r}
            </button>
          );
        })}
      </div>

      {/* Matches */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {roundMatches(currentRound).map((match, idx) => {
          if (isBye(match)) {
            return (
              <div key={idx} className="glass-panel" style={{
                padding: "12px 18px", display: "flex", alignItems: "center", gap: "12px",
                border: "1px solid rgba(255,255,255,0.05)", opacity: 0.7,
              }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", minWidth: "48px" }}>BYE</span>
                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                  {config.playerNames[match.players[0]]}
                </span>
                <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--accent-emerald)" }}>
                  ✓ automatic win
                </span>
              </div>
            );
          }

          return (
            <div key={idx} className="glass-panel" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Pod/Match header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  {matchLabel(idx)}
                  {isPod(match) && (
                    <span style={{ marginLeft: "6px", color: "var(--accent-cyan)" }}>
                      {match.players.length}-player
                    </span>
                  )}
                </span>
                {match.winner !== null && (
                  <span style={{ fontSize: "0.72rem", color: "var(--accent-emerald)", fontWeight: 600 }}>
                    ✓ {config.playerNames[match.winner]}
                  </span>
                )}
              </div>

              {/* Player buttons */}
              <div style={{
                display: "flex",
                flexDirection: isPod(match) ? "column" : "row",
                gap: "8px",
              }}>
                {match.players.map(p => (
                  <button
                    key={p}
                    onClick={() => recordWin(match, p)}
                    style={{
                      flex: 1, padding: isPod(match) ? "10px 14px" : "8px 10px",
                      borderRadius: "8px", border: "1px solid",
                      cursor: "pointer", textAlign: "left",
                      background: match.winner === p ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.03)",
                      borderColor: match.winner === p ? "rgba(139,92,246,0.45)" : "rgba(255,255,255,0.08)",
                      color: match.winner === p ? "var(--accent-purple)" : "var(--text-primary)",
                      fontWeight: match.winner === p ? 700 : 500, fontSize: "0.9rem",
                      transition: "all 0.15s",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <span>{config.playerNames[p]}</span>
                    {match.winner === p && <span style={{ fontSize: "0.7rem" }}>✓ Winner</span>}
                  </button>
                ))}
              </div>

              {/* VS divider for 1v1 only */}
              {!isPod(match) && match.players.length === 2 && match.winner === null && (
                <div style={{ display: "none" }} /> /* spacer already handled by flex gap */
              )}
            </div>
          );
        })}
      </div>

      {/* Advance round button */}
      {roundComplete(currentRound) && !allDone && currentRound < totalRounds && isLastGenerated && (
        <button
          className="glass-button"
          style={{
            width: "100%", padding: "13px", fontSize: "0.95rem", fontWeight: 700,
            background: "rgba(139,92,246,0.18)", borderColor: "rgba(139,92,246,0.4)",
            color: "var(--accent-purple)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
          onClick={startNextRound}
        >
          Generate Round {currentRound + 1} Pairings →
        </button>
      )}

      {/* Standings */}
      {(allDone || currentRound > 1 || roundComplete(1)) && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {allDone ? "🏆 Final Standings" : "Current Standings"}
          </h3>
          {order.map((pi, rank) => (
            <div key={pi} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "10px 16px", borderRadius: "10px",
              background: rank === 0 && allDone ? "rgba(234,179,8,0.07)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${rank === 0 && allDone ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.05)"}`,
            }}>
              <span style={{
                fontWeight: 800, fontSize: "0.9rem", width: "28px",
                color: rank === 0 ? "#eab308" : rank === 1 ? "#94a3b8" : "var(--text-muted)",
              }}>
                #{rank + 1}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{config.playerNames[pi]}</span>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--accent-emerald)" }}>{wins(pi)}W</span>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>{losses(pi)}L</span>
              <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--accent-purple)" }}>{pts[pi]}pts</span>
            </div>
          ))}
        </div>
      )}

      <button
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem", paddingTop: "4px" }}
        onClick={onReset}
      >
        ← New draft
      </button>
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────

export const DraftMode: React.FC = () => {
  const [phase,  setPhase]  = useState<Phase>("setup");
  const [config, setConfig] = useState<DraftConfig | null>(null);

  const handleStart = (cfg: DraftConfig) => { setConfig(cfg); setPhase("drafting"); };
  const handleReset = () => { setConfig(null); setPhase("setup"); };

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "20px 16px 32px", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <Package size={22} color="var(--accent-purple)" />
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800 }}>Draft Mode</h1>
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {phase === "setup"    && "Configure your draft pod and pairing format."}
          {phase === "drafting" && (config ? `${config.playerCount}-player · ${FORMAT_INFO[config.pairingFormat].label}${config.setName ? ` · ${config.setName}` : ""}` : "")}
          {phase === "pairings" && `${config ? FORMAT_INFO[config.pairingFormat].label : ""} — tap a player to record their win.`}
        </p>
      </div>

      {phase === "setup"    && <SetupScreen onStart={handleStart} />}
      {phase === "drafting" && config && <DraftingScreen config={config} onDraftComplete={() => setPhase("pairings")} onReset={handleReset} />}
      {phase === "pairings" && config && <PairingsScreen config={config} onReset={handleReset} />}
    </div>
  );
};
