import { useState } from "react";
import { Gavel, Users, BookOpen, ChevronRight, X } from "lucide-react";

interface OnboardingFlowProps {
  onDone: () => void;
}

const SLIDES = [
  {
    icon: Gavel,
    iconColor: "var(--accent-purple)",
    iconBg: "color-mix(in srgb, var(--accent-purple) 15%, transparent)",
    title: "AI Rules Judge",
    body: "Got a rules dispute? Ask the AI Judge. It reads the actual oracle text and rulings for every card you mention — just type @CardName to pull it in.",
    hint: "Powered by Google Gemini · Free 5 questions/day",
  },
  {
    icon: Users,
    iconColor: "#06b6d4",
    iconBg: "rgba(6,182,212,0.15)",
    title: "Life Counter + Multiplayer",
    body: "Track life, Commander damage, poison, Monarch, Initiative, and more. Create a room code and sync your whole pod's life totals in real time — no account needed.",
    hint: "Up to 6 players · Works on any device",
  },
  {
    icon: BookOpen,
    iconColor: "#10b981",
    iconBg: "rgba(16,185,129,0.15)",
    title: "Deck Builder & Card Codex",
    body: "Search any card via the Codex icon in the sidebar. Build and save Commander decks, or let AI generate a deck from a commander name and a short description.",
    hint: "Powered by Scryfall · No API key required",
  },
];

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const [slide, setSlide] = useState(0);
  const isLast = slide === SLIDES.length - 1;
  const { icon: Icon, iconColor, iconBg, title, body, hint } = SLIDES[slide];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(8,7,11,0.96)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        paddingTop: "calc(24px + env(safe-area-inset-top))",
        paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Skip */}
      <button
        onClick={onDone}
        style={{
          position: "absolute",
          top: "calc(16px + env(safe-area-inset-top))",
          right: "20px",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "0.85rem",
          padding: "8px",
        }}
      >
        Skip <X size={14} />
      </button>

      {/* Slide content */}
      <div
        key={slide}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: "340px",
          animation: "slideInUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      >
        {/* Icon badge */}
        <div
          style={{
            width: "88px",
            height: "88px",
            borderRadius: "24px",
            background: iconBg,
            border: iconColor.startsWith("var(")
              ? `1px solid color-mix(in srgb, ${iconColor} 25%, transparent)`
              : `1px solid ${iconColor}40`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
            boxShadow: iconColor.startsWith("var(")
              ? `0 0 40px color-mix(in srgb, ${iconColor} 13%, transparent)`
              : `0 0 40px ${iconColor}20`,
          }}
        >
          <Icon size={40} color={iconColor} strokeWidth={1.5} />
        </div>

        <h2
          style={{
            fontSize: "1.6rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "14px",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>

        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            marginBottom: "16px",
          }}
        >
          {body}
        </p>

        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px",
            padding: "4px 12px",
          }}
        >
          {hint}
        </span>
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", gap: "8px", marginTop: "40px" }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            onClick={() => setSlide(i)}
            style={{
              width: i === slide ? "20px" : "8px",
              height: "8px",
              borderRadius: "4px",
              background: i === slide ? "var(--accent-purple)" : "rgba(255,255,255,0.15)",
              transition: "all 0.3s ease",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* CTA button */}
      <button
        onClick={() => (isLast ? onDone() : setSlide(s => s + 1))}
        style={{
          marginTop: "24px",
          padding: "14px 36px",
          background: "linear-gradient(135deg, var(--accent-purple), #6d28d9)",
          border: "none",
          borderRadius: "12px",
          color: "#fff",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxShadow: "0 4px 20px color-mix(in srgb, var(--accent-purple) 40%, transparent)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
        onMouseUp={e => (e.currentTarget.style.transform = "")}
      >
        {isLast ? "Get Started" : "Next"}
        {!isLast && <ChevronRight size={18} />}
      </button>
    </div>
  );
}
