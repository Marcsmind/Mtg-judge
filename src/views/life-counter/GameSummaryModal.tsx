import React, { useState } from "react";
import { X, Trophy, Skull, Swords, Shield, Crown, Share2, Check, Image } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import type { Player } from "../../types/game";

interface GameSummaryModalProps {
  players: Player[];
  onClose: () => void;
}

const PLAYER_COLORS: Record<string, string> = {
  white:  "#d6ad60",
  blue:   "#38bdf8",
  black:  "#a855f7",
  red:    "#ef4444",
  green:  "#10b981",
  purple: "#ec4899",
};

export const GameSummaryModal: React.FC<GameSummaryModalProps> = ({ players, onClose }) => {
  const [shared, setShared] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Computed stats ──
  const damageDealtBy: Record<number, number> = {};
  players.forEach(srcPlayer => {
    let total = 0;
    players.forEach(target => {
      Object.entries(target.commanderDamage).forEach(([key, dmg]) => {
        const srcId = parseInt(key.split("_")[0], 10);
        if (srcId === srcPlayer.id) total += dmg;
      });
    });
    damageDealtBy[srcPlayer.id] = total;
  });

  const sorted = [...players].sort((a, b) => b.life - a.life);
  const mvp = players.reduce<Player | null>((best, p) =>
    best === null || damageDealtBy[p.id] > damageDealtBy[best.id] ? p : best, null);
  const survivor = sorted[0];

  // ── Plain-text fallback ──
  const buildShareText = () => {
    const awards = [
      survivor ? `👑 Survivor: ${survivor.name} (${survivor.life} life)` : null,
      mvp && damageDealtBy[mvp.id] > 0 ? `⚔️ MVP: ${mvp.name} (${damageDealtBy[mvp.id]} cmd dmg)` : null,
    ].filter(Boolean).join("\n");
    const standings = sorted.map((p, i) => {
      const dead = p.life <= 0 || (p.poison ?? 0) >= 10
        || Object.values(p.commanderDamage).reduce((s, v) => s + v, 0) >= 21;
      return `${i + 1}. ${p.name} — ${p.life} life${dead ? " (Defeated)" : ""}`;
    }).join("\n");
    return `🏆 Commander Game Summary\n\n${awards}\n\nFinal Standings:\n${standings}\n\nTracked with Arbiter`;
  };

  // ── Canvas image generator ──
  const generateSummaryImage = (): Promise<Blob | null> => {
    return new Promise(resolve => {
      try {
        const SCALE  = 2;
        const W      = 600;
        const PAD    = 28;
        const ROW_H  = 68;
        const FONT   = "-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif";

        const hasAwards = !!(survivor || (mvp && damageDealtBy[mvp.id] > 0));
        const H = PAD + 54 + 18 + (hasAwards ? 50 : 0) + 32 + sorted.length * ROW_H + 14 + 18 + 32 + PAD;

        const canvas  = document.createElement("canvas");
        canvas.width  = W * SCALE;
        canvas.height = H * SCALE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.scale(SCALE, SCALE);

        // ── rounded-rect helper ──
        const rr = (x: number, y: number, w: number, h: number, r: number) => {
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
        };

        // ── divider helper ──
        const divider = (dy: number) => {
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.moveTo(PAD, dy);
          ctx.lineTo(W - PAD, dy);
          ctx.stroke();
        };

        // Background
        ctx.fillStyle = "#0d0b14";
        ctx.fillRect(0, 0, W, H);

        // Subtle gradient
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, "rgba(139,92,246,0.07)");
        grad.addColorStop(1, "rgba(6,182,212,0.05)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // ── HEADER ──
        let y = PAD;

        ctx.font = `24px ${FONT}`;
        ctx.fillText("🏆", PAD, y + 26);

        ctx.fillStyle = "#f3f1f6";
        ctx.font      = `bold 20px ${FONT}`;
        ctx.fillText("COMMANDER GAME SUMMARY", PAD + 34, y + 26);

        ctx.textAlign = "right";
        ctx.fillStyle = "#8b5cf6";
        ctx.font      = `bold 13px ${FONT}`;
        ctx.fillText("ARBITER", W - PAD, y + 18);
        ctx.fillStyle = "#6e6b75";
        ctx.font      = `11px ${FONT}`;
        ctx.fillText(
          new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          W - PAD, y + 34,
        );
        ctx.textAlign = "left";

        y += 54;
        divider(y);
        y += 18;

        // ── AWARDS ──
        if (hasAwards) {
          let bx = PAD;

          const badge = (label: string, bg: string, border: string, text: string) => {
            ctx.font = `bold 12px ${FONT}`;
            const tw = ctx.measureText(label).width;
            const bw = tw + 26;
            rr(bx, y, bw, 28, 14);
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = text;
            ctx.fillText(label, bx + 13, y + 18);
            bx += bw + 10;
          };

          if (survivor) {
            badge(
              `👑 ${survivor.name} survived`,
              "rgba(16,185,129,0.15)", "rgba(16,185,129,0.4)", "#10b981",
            );
          }
          if (mvp && damageDealtBy[mvp.id] > 0) {
            badge(
              `⚔️ ${mvp.name}  ${damageDealtBy[mvp.id]} cmd dmg`,
              "rgba(239,68,68,0.15)", "rgba(239,68,68,0.4)", "#ef4444",
            );
          }
          y += 50;
        }

        // ── STANDINGS LABEL ──
        ctx.fillStyle = "#6e6b75";
        ctx.font      = `bold 10px ${FONT}`;
        ctx.fillText("FINAL STANDINGS", PAD, y + 14);
        y += 32;

        // ── PLAYER ROWS ──
        sorted.forEach((p, rank) => {
          const accent       = PLAYER_COLORS[p.colorName] ?? "#ec4899";
          const cmdDmgDealt  = damageDealtBy[p.id];
          const cmdDmgTaken  = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
          const isDead       = p.life <= 0 || (p.poison ?? 0) >= 10 || cmdDmgTaken >= 21;
          const isWinner     = rank === 0;
          const RH           = ROW_H - 8;
          const midY         = y + RH / 2;

          rr(PAD, y, W - PAD * 2, RH, 10);
          ctx.fillStyle   = isWinner ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.025)";
          ctx.fill();
          ctx.strokeStyle = isWinner ? "rgba(234,179,8,0.3)" : "rgba(255,255,255,0.06)";
          ctx.lineWidth   = 1;
          ctx.stroke();

          let cx = PAD + 16;

          // Rank number
          ctx.fillStyle = isWinner ? "#eab308" : rank === 1 ? "#94a3b8" : "#6e6b75";
          ctx.font      = `bold 15px ${FONT}`;
          ctx.fillText(`#${rank + 1}`, cx, midY + 5);
          cx += 38;

          // Color dot
          ctx.beginPath();
          ctx.arc(cx + 5, midY, 6, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
          cx += 22;

          // Name (truncate if needed)
          const lifeZoneW = 80;
          const maxNameW  = W - PAD * 2 - cx - PAD - lifeZoneW;
          ctx.font = `bold 15px ${FONT}`;
          let name = p.name;
          while (ctx.measureText(name).width > maxNameW && name.length > 1)
            name = name.slice(0, -1);
          if (name !== p.name) name += "…";

          ctx.fillStyle = isDead ? "#6e6b75" : "#f3f1f6";
          ctx.fillText(name, cx, midY + 5);

          if (isDead) {
            const nx = cx + ctx.measureText(name).width + 8;
            ctx.fillStyle = "#f43f5e";
            ctx.font      = `bold 9px ${FONT}`;
            ctx.fillText("DEFEATED", nx, midY + 5);
          }

          // Life total (right side)
          ctx.textAlign   = "right";
          const lifeX     = W - PAD - 16;

          ctx.fillStyle   = p.life <= 0 ? "#f43f5e" : "#ffffff";
          ctx.font        = `bold 22px ${FONT}`;
          ctx.fillText(`${p.life}`, lifeX, midY + 8);

          ctx.fillStyle   = "#6e6b75";
          ctx.font        = `10px ${FONT}`;
          ctx.fillText("life", lifeX, midY - 7);

          // Commander damage dealt (small, below life)
          if (cmdDmgDealt > 0) {
            ctx.fillStyle = accent;
            ctx.font      = `bold 10px ${FONT}`;
            ctx.fillText(`⚔️ ${cmdDmgDealt}`, lifeX, midY + 22);
          }

          ctx.textAlign = "left";
          y += ROW_H;
        });

        // ── FOOTER ──
        y += 14;
        divider(y);
        y += 18;

        ctx.fillStyle = "#8b5cf6";
        ctx.font      = `bold 13px ${FONT}`;
        ctx.fillText("Arbiter", PAD, y + 14);

        ctx.fillStyle = "#6e6b75";
        ctx.font      = `12px ${FONT}`;
        ctx.fillText("  —  Your Commander Companion", PAD + ctx.measureText("Arbiter").width, y + 14);

        canvas.toBlob(resolve, "image/png");
      } catch (err) {
        console.error("[GameSummaryModal] canvas error:", err);
        resolve(null);
      }
    });
  };

  // ── Share handler ──
  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await generateSummaryImage();
      if (blob) {
        const file = new File([blob], "arbiter-game-summary.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Commander Game Summary" });
          setShared(true);
          setTimeout(() => setShared(false), 2000);
          return;
        }
      }
      // Fallback: text share or clipboard
      const text = buildShareText();
      if (navigator.share) {
        await navigator.share({ title: "Game Summary", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // dismissed
    } finally {
      setGenerating(false);
    }
  };

  return (
    <BottomSheet onClose={onClose} zIndex={200} maxWidth="560px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Trophy size={22} color="#eab308" />
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Game Summary</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleShare}
              disabled={generating}
              aria-label="Share game summary"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 12px", borderRadius: "8px", cursor: generating ? "default" : "pointer",
                background: shared
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(139,92,246,0.1)",
                border: `1px solid ${shared ? "rgba(16,185,129,0.3)" : "rgba(139,92,246,0.25)"}`,
                color: shared ? "var(--accent-emerald)" : "var(--accent-purple)",
                fontSize: "0.78rem", fontWeight: 700, transition: "all 0.2s ease",
                opacity: generating ? 0.6 : 1,
              }}
            >
              {shared
                ? <Check size={13} />
                : generating
                  ? <Image size={13} />
                  : <Share2 size={13} />
              }
              {shared ? "Shared!" : generating ? "Generating…" : "Share"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close game summary"
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "4px" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary)"}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Award badges */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {survivor && (
            <div style={{
              display: "flex", alignItems: "center", gap: "7px",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "20px", padding: "5px 12px",
            }}>
              <Crown size={14} color="var(--accent-emerald)" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
                Survivor: {survivor.name}
              </span>
            </div>
          )}
          {mvp && damageDealtBy[mvp.id] > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: "7px",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "20px", padding: "5px 12px",
            }}>
              <Swords size={14} color="var(--accent-rose)" />
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-rose)" }}>
                MVP: {mvp.name} ({damageDealtBy[mvp.id]} cmd dmg)
              </span>
            </div>
          )}
        </div>

        {/* Player rankings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3 style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Final Standings
          </h3>
          {sorted.map((p, rank) => {
            const accent = PLAYER_COLORS[p.colorName] ?? "#ec4899";
            const totalTax = p.tax + (p.partnerMode ? p.taxPartner : 0);
            const cmdDmgDealt = damageDealtBy[p.id];
            const cmdDmgTaken = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
            const isDead = p.life <= 0 || (p.poison ?? 0) >= 10 || cmdDmgTaken >= 21;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  background: rank === 0 ? "rgba(234,179,8,0.07)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${rank === 0 ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: "10px", padding: "10px 14px",
                }}
              >
                <span style={{
                  width: "22px", textAlign: "center",
                  fontSize: "0.9rem", fontWeight: 800,
                  color: rank === 0 ? "#eab308" : rank === 1 ? "#94a3b8" : "var(--text-muted)",
                }}>
                  #{rank + 1}
                </span>
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: "0.9rem", color: isDead ? "var(--text-muted)" : "var(--text-primary)" }}>
                  {p.name}
                  {isDead && <span style={{ fontSize: "0.65rem", color: "var(--accent-rose)", marginLeft: "6px" }}>DEFEATED</span>}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, color: p.life <= 0 ? "var(--accent-rose)" : "#fff" }}>{p.life}</span>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>life</span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {totalTax > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <Shield size={11} color="var(--text-muted)" />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Tax {totalTax}</span>
                    </div>
                  )}
                  {cmdDmgDealt > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <Swords size={11} color={accent} />
                      <span style={{ fontSize: "0.72rem", color: accent }}>{cmdDmgDealt}</span>
                    </div>
                  )}
                  {(p.poison ?? 0) > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <Skull size={11} color="#10b981" />
                      <span style={{ fontSize: "0.72rem", color: "#10b981" }}>{p.poison}/10</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
};
