/**
 * useGameTimer — game clock extracted from LifeCounter.tsx
 *
 * Manages a count-up or count-down game timer.
 * Default countdown target: 45 minutes (2700 s).
 * Fires hapticHeavy() when the countdown reaches 0.
 */

import { useState, useEffect } from "react";
import { hapticHeavy } from "../utils/haptics";

/** Countdown starting point — 45 minutes in seconds. */
const COUNTDOWN_FROM = 2700;

export interface UseGameTimerReturn {
  timerSeconds:  number;
  timerRunning:  boolean;
  timerMode:     "up" | "down";
  timerColor:    string;
  formatTime:    (s: number) => string;
  toggleTimer:   () => void;
  resetTimer:    () => void;
  setTimerMode:  React.Dispatch<React.SetStateAction<"up" | "down">>;
}

export function useGameTimer(): UseGameTimerReturn {
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMode, setTimerMode]       = useState<"up" | "down">("up");

  // ── Tick ──
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev =>
        timerMode === "down" ? Math.max(0, prev - 1) : prev + 1
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerMode]);

  // ── Auto-stop countdown at 0 ──
  useEffect(() => {
    if (timerMode === "down" && timerRunning && timerSeconds === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimerRunning(false);
      hapticHeavy();
    }
  }, [timerSeconds, timerMode, timerRunning]);

  const formatTime = (s: number): string => {
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const toggleTimer = () => setTimerRunning(prev => !prev);

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(timerMode === "down" ? COUNTDOWN_FROM : 0);
  };

  const timerColor =
    timerMode === "down"
      ? timerSeconds < 60  ? "var(--accent-rose)"
      : timerSeconds < 300 ? "#f59e0b"
      : "var(--text-primary)"
      : "var(--text-primary)";

  return {
    timerSeconds,
    timerRunning,
    timerMode,
    timerColor,
    formatTime,
    toggleTimer,
    resetTimer,
    setTimerMode,
  };
}
