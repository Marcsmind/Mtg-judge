import { useRef, useState } from "react";
import { hapticLight, hapticMedium, hapticHeavy } from "../utils/haptics";
import type { Player } from "../types/game";

export interface RollLog {
  id: string;
  time: string;
  type: "coin" | "dice" | "player";
  label: string;
  result: string;
}

export type DiceLastResult =
  | { kind: "coin"; outcome: "Heads" | "Tails" }
  | { kind: "dice"; name: string; sides: number; count: number; value: number; breakdown: number[] }
  | { kind: "player"; name: string; mode: "any" | "opponent" };

const randomId = () => Math.random().toString(36).slice(2, 11);

// Brief "in progress" delay before a result lands, so taps feel like a genuine
// roll/flip rather than an instant lookup — UI reads this via `rollingKeys`.
const ROLL_DELAY_MS = 600;

export function useDiceActions(players: Player[], myPlayerIndex: number | null) {
  const [history, setHistory] = useState<RollLog[]>([]);
  const [lastResult, setLastResult] = useState<DiceLastResult | null>(null);
  const [rollingKeys, setRollingKeys] = useState<Set<string>>(new Set());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const addLog = (type: RollLog["type"], label: string, result: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setHistory(prev => [{ id: randomId(), time, type, label, result }, ...prev].slice(0, 50));
  };

  const startRolling = (key: string) => {
    hapticLight();
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    setRollingKeys(prev => new Set(prev).add(key));
  };

  const stopRolling = (key: string) => {
    setRollingKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const flipCoin = () => {
    const key = "coin";
    startRolling(key);
    timersRef.current[key] = setTimeout(() => {
      const outcome: "Heads" | "Tails" = Math.random() < 0.5 ? "Heads" : "Tails";
      setLastResult({ kind: "coin", outcome });
      hapticMedium();
      addLog("coin", "Coin Flip", outcome);
      stopRolling(key);
    }, ROLL_DELAY_MS);
  };

  const rollDie = (name: string, sides: number, count = 1) => {
    const key = `dice:${name}:${count}`;
    startRolling(key);
    timersRef.current[key] = setTimeout(() => {
      const rolls: number[] = [];
      let sum = 0;
      for (let i = 0; i < count; i++) {
        const val = Math.floor(Math.random() * sides) + 1;
        rolls.push(val);
        sum += val;
      }
      setLastResult({ kind: "dice", name, sides, count, value: sum, breakdown: rolls });
      if (rolls.length === 1 && (sum === sides || (sum === 1 && sides === 20))) hapticHeavy();
      else hapticMedium();
      const label = count > 1 ? `${count}${name}` : name;
      const resultText = count > 1 ? `${sum} [${rolls.join(", ")}]` : `${sum}`;
      addLog("dice", label, resultText);
      stopRolling(key);
    }, ROLL_DELAY_MS);
  };

  const randomizePlayer = (mode: "any" | "opponent" = "any") => {
    const pool = mode === "opponent" && myPlayerIndex !== null
      ? players.filter((_, idx) => idx !== myPlayerIndex)
      : players;
    if (pool.length === 0) return;
    const key = `player:${mode}`;
    startRolling(key);
    timersRef.current[key] = setTimeout(() => {
      const choice = pool[Math.floor(Math.random() * pool.length)];
      setLastResult({ kind: "player", name: choice.name, mode });
      hapticMedium();
      addLog("player", mode === "opponent" ? "Random Opponent" : "Random Player", choice.name);
      stopRolling(key);
    }, ROLL_DELAY_MS);
  };

  const clearHistory = () => setHistory([]);

  return { history, lastResult, setLastResult, rollingKeys, flipCoin, rollDie, randomizePlayer, clearHistory };
}
