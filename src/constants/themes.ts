/**
 * Nexus Judge — Theme Palette Definitions
 *
 * Each theme overrides the core CSS custom properties on <html>
 * so that all glass panels, gradients, and accent colours shift together.
 * The active theme id is persisted in localStorage (STORAGE_KEYS.THEME).
 */

export type ThemeId = "void" | "aether" | "forest" | "flame";

export interface ThemePalette {
  id:     ThemeId;
  label:  string;
  swatch: string;       // hex for the Settings colour dot
  emoji:  string;
  vars:   Record<string, string>;
}

export const THEMES: ThemePalette[] = [
  {
    id: "void",
    label: "Void",
    swatch: "#8b5cf6",
    emoji: "🌌",
    vars: {
      "--bg-deep":          "#08070b",
      "--bg-dark":          "#121019",
      "--bg-card":          "rgba(22,19,32,0.65)",
      "--bg-card-hover":    "rgba(30,26,44,0.80)",
      "--accent-purple":         "#8b5cf6",
      "--accent-purple-glow":    "rgba(139,92,246,0.40)",
      "--border-color-glow":     "rgba(139,92,246,0.25)",
      "--body-grad-1":      "rgba(139,92,246,0.08)",
      "--body-grad-2":      "rgba(6,182,212,0.05)",
    },
  },
  {
    id: "aether",
    label: "Aether",
    swatch: "#38bdf8",
    emoji: "🌊",
    vars: {
      "--bg-deep":          "#020b18",
      "--bg-dark":          "#05142a",
      "--bg-card":          "rgba(5,20,45,0.70)",
      "--bg-card-hover":    "rgba(8,30,62,0.85)",
      "--accent-purple":         "#38bdf8",
      "--accent-purple-glow":    "rgba(56,189,248,0.40)",
      "--border-color-glow":     "rgba(56,189,248,0.25)",
      "--body-grad-1":      "rgba(56,189,248,0.08)",
      "--body-grad-2":      "rgba(96,165,250,0.05)",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#10b981",
    emoji: "🌿",
    vars: {
      "--bg-deep":          "#020e06",
      "--bg-dark":          "#041a08",
      "--bg-card":          "rgba(4,20,8,0.70)",
      "--bg-card-hover":    "rgba(8,32,14,0.85)",
      "--accent-purple":         "#10b981",
      "--accent-purple-glow":    "rgba(16,185,129,0.40)",
      "--border-color-glow":     "rgba(16,185,129,0.25)",
      "--body-grad-1":      "rgba(16,185,129,0.08)",
      "--body-grad-2":      "rgba(6,182,212,0.04)",
    },
  },
  {
    id: "flame",
    label: "Flame",
    swatch: "#f97316",
    emoji: "🔥",
    vars: {
      "--bg-deep":          "#0e0603",
      "--bg-dark":          "#1c0b04",
      "--bg-card":          "rgba(26,10,4,0.70)",
      "--bg-card-hover":    "rgba(40,16,6,0.85)",
      "--accent-purple":         "#f97316",
      "--accent-purple-glow":    "rgba(249,115,22,0.40)",
      "--border-color-glow":     "rgba(249,115,22,0.25)",
      "--body-grad-1":      "rgba(249,115,22,0.09)",
      "--body-grad-2":      "rgba(239,68,68,0.06)",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "void";

/** Applies a theme by writing its CSS vars to the document root element. */
export function applyTheme(id: ThemeId): void {
  const palette = THEMES.find(t => t.id === id) ?? THEMES[0];
  const root    = document.documentElement;
  for (const [prop, value] of Object.entries(palette.vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-theme", id);
}
