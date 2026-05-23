/**
 * DayNightBanner — compact bar showing current day/night phase
 * with a one-tap "Flip" button.
 *
 * Only rendered when the day/night counter is active AND
 * the phase is not "none". That guard lives in LifeCounter.tsx:
 *   {activeCounters.dayNight && dayNightState !== "none" && (
 *     <DayNightBanner state={dayNightState} onCycle={cycleDayNight} />
 *   )}
 */

import { Sun, Moon } from "lucide-react";
import type { DayNightState } from "../../types/game";

interface DayNightBannerProps {
  state:   Exclude<DayNightState, "none">;
  onCycle: () => void;
}

export function DayNightBanner({ state, onCycle }: DayNightBannerProps) {
  const isDay = state === "day";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: "16px",
      padding: "10px 24px", borderRadius: "10px", flexShrink: 0,
      background: isDay
        ? "linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(251,191,36,0.06) 100%)"
        : "linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(99,102,241,0.07) 100%)",
      border: `1px solid ${isDay ? "rgba(234,179,8,0.3)" : "rgba(139,92,246,0.3)"}`,
    }}>
      {isDay ? <Sun size={20} color="#eab308" /> : <Moon size={20} color="#8b5cf6" />}
      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
        It is currently&nbsp;
        <span style={{ color: isDay ? "#eab308" : "#8b5cf6" }}>
          {isDay ? "Day ☀️" : "Night 🌙"}
        </span>
      </span>
      <button
        onClick={onCycle}
        style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "8px", padding: "5px 14px", color: "#fff", cursor: "pointer",
          fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px",
        }}
      >
        {isDay ? <Moon size={13} /> : <Sun size={13} />}
        Flip to {isDay ? "Night" : "Day"}
      </button>
    </div>
  );
}
