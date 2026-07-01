import React from "react";

interface DiceIconProps {
  sides: number;
  size?: number;
  color?: string;
  rolling?: boolean;
  className?: string;
}

// Hand-drawn polyhedron silhouettes (24x24 viewBox) — one distinct shape per die type,
// so dice are recognizable by outline alone instead of a single generic 🎲 glyph.
const SHAPE_PATHS: Record<number, string> = {
  4:  "M12 2 L22 20 L2 20 Z M12 2 L12 14 M2 20 L12 14 M22 20 L12 14",
  6:  "M4 4 H20 V20 H4 Z M4 4 L12 11 M20 4 L12 11 M4 20 L12 11 M20 20 L12 11",
  8:  "M12 1.5 L21 12 L12 22.5 L3 12 Z M12 1.5 L12 22.5 M3 12 L21 12",
  10: "M12 1.5 L19 9 L15.5 22 L8.5 22 L5 9 Z M12 1.5 L12 22 M5 9 L19 9",
  12: "M12 1.5 L21.5 8.5 L18 19.5 L6 19.5 L2.5 8.5 Z",
  20: "M12 1.5 L21 7.2 V16.8 L12 22.5 L3 16.8 V7.2 Z M12 1.5 L12 22.5 M3 7.2 L21 16.8 M21 7.2 L3 16.8",
};

export const DiceIcon: React.FC<DiceIconProps> = ({ sides, size = 22, color = "currentColor", rolling = false, className }) => {
  const path = SHAPE_PATHS[sides] ?? SHAPE_PATHS[6];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={["dice-icon", rolling ? "dice-icon-rolling" : "", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
};
