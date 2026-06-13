import React, { useState } from "react";
import { Save, FolderOpen, Trash2, X, Calendar, Users } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A complete point-in-time snapshot of the LifeCounter state. */
export interface GameSnapshot {
  id: string;
  savedAt: number;         // Date.now()
  playerCount: number;
  startingLife: number;
  playerNames: string[];
  lifeTotals: number[];
  /** Opaque blobs — LifeCounter casts these back to the real types on load */
  playersBlob: unknown;
  activeCountersBlob: unknown;
  dayNightState: string;
  historyBlob: unknown;
}

interface SaveGameModalProps {
  /** Up to MAX_SLOTS saved games (some entries may be null = empty slot) */
  slots: (GameSnapshot | null)[];
  /** Snapshot representing the current live game (used for saving) */
  currentSnapshot: GameSnapshot;
  onSave: (slotIndex: number) => void;
  onLoad: (slot: GameSnapshot) => void;
  onDelete: (slotIndex: number) => void;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_SLOTS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SaveGameModal: React.FC<SaveGameModalProps> = ({
  slots,
  currentSnapshot,
  onSave,
  onLoad,
  onDelete,
  onClose,
}) => {
  const [confirm, setConfirm] = useState<{ action: () => void; message: string } | null>(null);

  const requestConfirm = (message: string, action: () => void) => setConfirm({ message, action });
  const resolveConfirm = (ok: boolean) => { if (ok) confirm?.action(); setConfirm(null); };

  return (
    <BottomSheet onClose={onClose} zIndex={200} padding="0" maxWidth="520px">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 24px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Save size={20} color="var(--accent-purple)" />
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                Save / Load Game
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Up to {MAX_SLOTS} save slots — complete game state is preserved
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close save game modal"
            style={{
              background: "none", border: "none",
              color: "var(--text-secondary)", cursor: "pointer", padding: "4px",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <X size={20} />
          </button>
        </div>

        {/* Current game preview */}
        <div style={{
          margin: "16px 24px 4px",
          padding: "12px 16px",
          background: "rgba(139,92,246,0.07)",
          border: "1px solid rgba(139,92,246,0.18)",
          borderRadius: "10px",
        }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--accent-purple)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Current Game
          </p>
          <CurrentGameSummary snapshot={currentSnapshot} />
        </div>

        {/* Slots */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "8px",
          padding: "12px 24px 24px", overflowY: "auto", maxHeight: "55vh",
        }}>
          {confirm && (
            <div style={{ margin: "0 0 8px", padding: "12px 16px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{confirm.message}</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => resolveConfirm(true)} className="glass-button" style={{ flex: 1, justifyContent: "center", fontSize: "0.82rem", padding: "7px", background: "rgba(139,92,246,0.15)", borderColor: "rgba(139,92,246,0.4)" }}>Confirm</button>
                <button onClick={() => resolveConfirm(false)} className="glass-button" style={{ flex: 1, justifyContent: "center", fontSize: "0.82rem", padding: "7px" }}>Cancel</button>
              </div>
            </div>
          )}
          {Array.from({ length: MAX_SLOTS }, (_, i) => {
            const slot = slots[i] ?? null;
            return (
              <SlotRow
                key={i}
                index={i}
                slot={slot}
                onSave={() => {
                  if (slot) { requestConfirm(`Overwrite Save ${i + 1}?`, () => onSave(i)); } else { onSave(i); }
                }}
                onLoad={() => {
                  if (!slot) return;
                  requestConfirm(`Load Save ${i + 1}? Unsaved progress will be lost.`, () => onLoad(slot));
                }}
                onDelete={() => {
                  if (slot) requestConfirm(`Delete Save ${i + 1}?`, () => onDelete(i));
                }}
              />
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const CurrentGameSummary: React.FC<{ snapshot: GameSnapshot }> = ({ snapshot }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
    <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
      <Users size={13} color="var(--accent-cyan)" />
      {snapshot.playerCount}P · {snapshot.startingLife} life
    </span>
    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
      {snapshot.playerNames.map((name, i) => (
        <span key={i}>
          {name}{" "}
          <span style={{ color: snapshot.lifeTotals[i] <= 0 ? "var(--accent-rose)" : snapshot.lifeTotals[i] <= 10 ? "#f97316" : "var(--accent-emerald)", fontWeight: 700 }}>
            {snapshot.lifeTotals[i]}
          </span>
          {i < snapshot.playerNames.length - 1 ? " · " : ""}
        </span>
      ))}
    </span>
  </div>
);

interface SlotRowProps {
  index: number;
  slot: GameSnapshot | null;
  onSave: () => void;
  onLoad: () => void;
  onDelete: () => void;
}

const SlotRow: React.FC<SlotRowProps> = ({ index, slot, onSave, onLoad, onDelete }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: "10px",
    padding: "12px 14px",
    background: slot ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.01)",
    border: `1px solid ${slot ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`,
    borderRadius: "10px",
    transition: "background 0.15s ease",
  }}>
    {/* Slot number badge */}
    <div style={{
      width: "28px", height: "28px", borderRadius: "8px",
      background: slot ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${slot ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "0.75rem", fontWeight: 700,
      color: slot ? "var(--accent-purple)" : "var(--text-muted)",
      flexShrink: 0,
    }}>
      {index + 1}
    </div>

    {/* Slot content */}
    <div style={{ flex: 1, minWidth: 0 }}>
      {slot ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff" }}>
              {slot.playerCount}P · {slot.startingLife} life
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
              <Calendar size={10} />
              {formatDate(slot.savedAt)}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {slot.playerNames.map((name, i) => (
              <span key={i}>
                {name}{" "}
                <span style={{
                  fontWeight: 700,
                  color: slot.lifeTotals[i] <= 0 ? "var(--accent-rose)"
                    : slot.lifeTotals[i] <= 10 ? "#f97316"
                    : "var(--accent-emerald)",
                }}>
                  {slot.lifeTotals[i]}
                </span>
                {i < slot.playerNames.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        </>
      ) : (
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic" }}>
          Empty slot
        </span>
      )}
    </div>

    {/* Actions */}
    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
      {slot && (
        <button
          onClick={onLoad}
          title="Load this save"
          className="glass-button"
          style={{ padding: "5px 10px", fontSize: "0.75rem", background: "rgba(6,182,212,0.08)", borderColor: "rgba(6,182,212,0.2)", color: "var(--accent-cyan)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(6,182,212,0.18)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(6,182,212,0.08)")}
        >
          <FolderOpen size={13} />
          Load
        </button>
      )}
      <button
        onClick={onSave}
        title={slot ? "Overwrite this save" : "Save here"}
        className="glass-button"
        style={{ padding: "5px 10px", fontSize: "0.75rem", background: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.2)", color: "var(--accent-purple)" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.18)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(139,92,246,0.08)")}
      >
        <Save size={13} />
        {slot ? "Overwrite" : "Save"}
      </button>
      {slot && (
        <button
          onClick={onDelete}
          title="Delete this save"
          style={{
            padding: "5px 8px", border: "1px solid rgba(244,63,94,0.15)",
            borderRadius: "7px", background: "rgba(244,63,94,0.06)",
            color: "var(--accent-rose)", cursor: "pointer",
            display: "flex", alignItems: "center",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(244,63,94,0.16)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(244,63,94,0.06)")}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  </div>
);
