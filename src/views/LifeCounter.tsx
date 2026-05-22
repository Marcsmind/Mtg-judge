import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw, Users,
  Crown, Skull, Radiation, Swords, Star,
  Settings2, Check, Moon, Sun,
  Save, Menu, Undo2,
  Play, Square, RotateCcw, Timer, Wifi, WifiOff, Copy, Trophy
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { hapticHeavy } from "../utils/haptics";
import {
  generateRoomCode,
  createRoom,
  joinRoom as joinSyncRoom,
  broadcastState,
  leaveRoom,
  SYNC_SCHEMA_VERSION,
} from "../services/multiplayerSync";
import type { SyncState } from "../services/multiplayerSync";
import type { Player, ActiveCounters, DayNightState, TokenKey } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { GameHistoryLedger } from "./life-counter/GameHistoryLedger";
import { CommanderDamageModal } from "./life-counter/CommanderDamageModal";
import { SaveGameModal, MAX_SLOTS } from "./life-counter/SaveGameModal";
import type { GameSnapshot } from "./life-counter/SaveGameModal";
import { GameSummaryModal } from "./life-counter/GameSummaryModal";
import { PlayerCard } from "./life-counter/PlayerCard";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useToast } from "../components/Toast";

// ── Types ────────────────────────────────────────────────────────────────────
// Player, PlayerTokens, TokenKey, DayNightState, ActiveCounters are imported
// from src/types/game.ts — the single source of truth shared across all
// life-counter sub-components and multiplayerSync.

// ── Constants ─────────────────────────────────────────────────────────────────

const STARTING_LIFE_OPTIONS = [20, 25, 30, 40, 60];
const DEFAULT_LIFE = 40;

const colors = {
  white:  { bg: "linear-gradient(135deg, #1e1b18 0%, #3a352d 100%)", accent: "#d6ad60", border: "rgba(214,173,96,0.4)" },
  blue:   { bg: "linear-gradient(135deg, #091a3c 0%, #0d2a63 100%)", accent: "#38bdf8", border: "rgba(56,189,248,0.4)" },
  black:  { bg: "linear-gradient(135deg, #16121e 0%, #251e33 100%)", accent: "#a855f7", border: "rgba(168,85,247,0.4)" },
  red:    { bg: "linear-gradient(135deg, #3b0808 0%, #5d1212 100%)", accent: "#ef4444", border: "rgba(239,68,68,0.4)" },
  green:  { bg: "linear-gradient(135deg, #062310 0%, #0c3a1a 100%)", accent: "#10b981", border: "rgba(16,185,129,0.4)" },
  purple: { bg: "linear-gradient(135deg, #1f0c2a 0%, #341247 100%)", accent: "#ec4899", border: "rgba(236,72,153,0.4)" },
};
const colorKeys = Object.keys(colors) as Array<keyof typeof colors>;

const MECHANICS_CONFIG: { key: keyof ActiveCounters; label: string; Icon: React.ElementType; color: string; desc: string }[] = [
  { key: "monarch",      label: "Monarch",         Icon: Crown,     color: "#eab308", desc: "One player holds the crown" },
  { key: "initiative",   label: "The Initiative",  Icon: Swords,    color: "#06b6d4", desc: "Venture into the Undercity" },
  { key: "poison",       label: "Poison (Infect)",  Icon: Skull,     color: "#10b981", desc: "10 counters = loss" },
  { key: "rad",          label: "Radiation",        Icon: Radiation, color: "#f97316", desc: "Fallout rad counters" },
  { key: "cityBlessing", label: "City's Blessing",  Icon: Star,      color: "#eab308", desc: "Ascend: 10+ permanents" },
  { key: "dayNight",     label: "Day / Night",      Icon: Moon,      color: "#8b5cf6", desc: "Transform day/night cards" },
  // "tokens" removed — tokens are now per-player toggles, not a global mechanic
];

// ── Helper: safe-parse a saved player with all new fields defaulted ───────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSavedPlayer(raw: any, fallbackLife: number): Player {
  return {
    id:             raw.id,
    name:           raw.name ?? `Player ${raw.id}`,
    avatar:         raw.avatar ?? "",
    life:           typeof raw.life === "number" ? raw.life : fallbackLife,
    tax:            raw.tax ?? 0,
    taxPartner:     raw.taxPartner ?? 0,
    partnerMode:    raw.partnerMode ?? false,
    colorName:      raw.colorName ?? "purple",
    commanderDamage: raw.commanderDamage ?? {},
    isMonarch:      raw.isMonarch ?? false,
    hasInitiative:  raw.hasInitiative ?? false,
    cityBlessing:   raw.cityBlessing ?? false,
    poison:         typeof raw.poison === "number" ? raw.poison : 0,
    rad:            typeof raw.rad   === "number" ? raw.rad   : 0,
    tokens: {
      treasure: raw.tokens?.treasure ?? 0,
      food:     raw.tokens?.food     ?? 0,
      clue:     raw.tokens?.clue     ?? 0,
      blood:    raw.tokens?.blood    ?? 0,
    },
    enabledTokens: Array.isArray(raw.enabledTokens) ? raw.enabledTokens : [],
    tokensOpen:    raw.tokensOpen ?? false,
  };
}

function createPlayer(index: number, life: number): Player {
  return {
    id: index + 1,
    name: `Player ${index + 1}`,
    avatar: "",
    life,
    tax: 0,
    taxPartner: 0,
    partnerMode: false,
    colorName: colorKeys[index % colorKeys.length],
    commanderDamage: {},
    isMonarch: false,
    hasInitiative: false,
    cityBlessing: false,
    poison: 0,
    rad: 0,
    tokens: { treasure: 0, food: 0, clue: 0, blood: 0 },
    enabledTokens: [],
    tokensOpen: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LifeCounter: React.FC = () => {
  const { showToast } = useToast();

  // ── State ──
  const [startingLife, setStartingLifeState] = useState<number>(() => {
    const s = localStorage.getItem("nexus_judge_starting_life");
    return s ? parseInt(s, 10) : DEFAULT_LIFE;
  });

  const [playerCount, setPlayerCount] = useState<number>(() => {
    const s = localStorage.getItem("nexus_judge_player_count");
    return s ? parseInt(s, 10) : 4;
  });

  const [history, setHistory] = useState<string[]>(() => {
    const s = localStorage.getItem("nexus_judge_life_history");
    if (s) { try { return JSON.parse(s); } catch { /* corrupt localStorage — use default */ } }
    return [`Game started with ${DEFAULT_LIFE} Life!`];
  });

  const [activeCounters, setActiveCounters] = useState<ActiveCounters>(() => {
    const defaults: ActiveCounters = { monarch: false, poison: false, rad: false, dayNight: false, initiative: false, cityBlessing: false, tokens: false };
    const s = localStorage.getItem("nexus_judge_active_counters");
    if (s) { try { return { ...defaults, ...JSON.parse(s) }; } catch { /* corrupt localStorage — use defaults */ } }
    return defaults;
  });

  const [dayNightState, setDayNightState] = useState<DayNightState>(() => {
    return (localStorage.getItem("nexus_judge_day_night") as DayNightState) || "none";
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    const sl = parseInt(localStorage.getItem("nexus_judge_starting_life") || String(DEFAULT_LIFE), 10);
    const s = localStorage.getItem("nexus_judge_players");
    if (s) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && arr.length > 0) return arr.map(p => parseSavedPlayer(p, sl));
      } catch { /* corrupt localStorage — create fresh players */ }
    }
    const count = parseInt(localStorage.getItem("nexus_judge_player_count") || "4", 10);
    return Array.from({ length: count }, (_, i) => createPlayer(i, sl));
  });

  const [activeDamageEditor, setActiveDamageEditor] = useState<number | null>(null);
  const [showCountersMenu, setShowCountersMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Collapsible game history ──
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY_COLLAPSED);
      // Default collapsed on narrow screens
      if (saved !== null) return saved === "true";
      return window.innerWidth < 900;
    } catch { return false; }
  });
  const toggleHistory = () => setHistoryCollapsed(prev => {
    const next = !prev;
    localStorage.setItem(STORAGE_KEYS.HISTORY_COLLAPSED, String(next));
    return next;
  });

  // ── Collapsible control bar (START / player-count / mechanics row) ──
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONTROLS_COLLAPSED);
      if (saved !== null) return saved === "true";
      return window.innerWidth < 768; // default hidden on phone
    } catch { return false; }
  });
  const toggleControls = () => setControlsCollapsed(prev => {
    const next = !prev;
    localStorage.setItem(STORAGE_KEYS.CONTROLS_COLLAPSED, String(next));
    return next;
  });

  // ── Save-game modal + slots ──
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [savedGames, setSavedGames] = useState<(GameSnapshot | null)[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAVED_GAMES);
      if (!raw) return Array(MAX_SLOTS).fill(null);
      const arr = JSON.parse(raw) as (GameSnapshot | null)[];
      // Ensure we always have exactly MAX_SLOTS entries
      return Array.from({ length: MAX_SLOTS }, (_, i) => arr[i] ?? null);
    } catch {
      return Array(MAX_SLOTS).fill(null);
    }
  });

  // ── Undo stack (max 15 snapshots) ──
  const [undoStack, setUndoStack] = useState<Player[][]>([]);
  const pushUndo = (snapshot: Player[]) => {
    setUndoStack(prev => [snapshot.map(p => ({ ...p })), ...prev].slice(0, 15));
  };
  // handleUndo is declared after addLog (it calls addLog) — see below
  const handleUndoRef = useRef<() => void>(() => undefined);

  // ── Game Timer ──
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<"up" | "down">("up");
  const COUNTDOWN_FROM = 2700; // 45 minutes

  // ── Multiplayer ──
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomConnected, setRoomConnected] = useState(false);
  const [roomRole, setRoomRole] = useState<"host" | "guest" | null>(null);
  const [roomName, setRoomName] = useState("");          // Optional host-set display name
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomCopied, setRoomCopied] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const lastAppliedAt = useRef<number>(0);
  // Local-priority: tracks when the local user last made a game action
  const lastLocalChangeAt = useRef<number>(0);
  // Debounce timer for broadcasting state changes
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref for handleRemoteUpdate — avoids stale closure in Supabase callbacks
  const handleRemoteUpdateRef = useRef<(s: SyncState) => void>(() => undefined);
  // Stable ref for buildSyncState — the timer in scheduleBroadcast fires 150ms after
  // the action, by which time React has re-rendered with the NEW state values.
  // Without this ref the timer closes over the OLD players snapshot and broadcasts it.
  const buildSyncStateRef = useRef<() => SyncState>(() => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    players: [], activeCounters: {} as ActiveCounters,
    dayNightState: "none", updatedAt: 0, updatedBy: "",
  }));

  // ── Persistence ──
  const setPlayerNames = useAppStore(s => s.setPlayerNames);
  useEffect(() => {
    localStorage.setItem("nexus_judge_players", JSON.stringify(players));
    localStorage.setItem("nexus_judge_player_count", playerCount.toString());
    localStorage.setItem("nexus_judge_player_names", JSON.stringify(players.map(p => p.name)));
    setPlayerNames(players.map(p => p.name));
  }, [players, playerCount, setPlayerNames]);

  useEffect(() => { localStorage.setItem("nexus_judge_life_history", JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem("nexus_judge_active_counters", JSON.stringify(activeCounters)); }, [activeCounters]);
  useEffect(() => { localStorage.setItem("nexus_judge_starting_life", startingLife.toString()); }, [startingLife]);
  useEffect(() => {
    if (dayNightState !== "none") localStorage.setItem("nexus_judge_day_night", dayNightState);
    else localStorage.removeItem("nexus_judge_day_night");
  }, [dayNightState]);

  // Close Mechanics menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowCountersMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  // ── Actions ──
  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setHistory(prev => [`[${t}] ${msg}`, ...prev.slice(0, 49)]);
  };

  /** Build the current game state snapshot for broadcasting */
  const buildSyncState = (): SyncState => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    players,
    activeCounters,
    dayNightState,
    roomName: roomName || undefined,
    updatedAt: Date.now(),
    updatedBy: players[0]?.name ?? "Unknown",
  });
  // Keep the ref pointing at the latest version every render.
  // The setTimeout in scheduleBroadcast fires ~150ms after an action, AFTER React
  // has already re-rendered with the new state — so .current() returns the
  // updated values rather than the stale closure captured at call time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { buildSyncStateRef.current = buildSyncState; });

  /**
   * Debounced broadcast — batches rapid taps into one message (150ms).
   * Uses buildSyncStateRef so the timer always reads the POST-render state,
   * not the stale pre-setPlayers snapshot that the direct closure would capture.
   */
  const scheduleBroadcast = () => {
    if (!roomConnected || !roomCode) return;
    lastLocalChangeAt.current = Date.now();
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      broadcastState(roomCode, buildSyncStateRef.current());
    }, 150);
  };

  // ── Undo handler (declared after addLog + scheduleBroadcast so it can call both) ──
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    scheduleBroadcast();
    const [last, ...rest] = undoStack;
    setPlayers(last);
    setUndoStack(rest);
    addLog("↩️ Undone last action.");
  };
  // Keep ref fresh after every render (must be in an effect — can't write .current during render)
  useEffect(() => { handleUndoRef.current = handleUndo; });

  // Ctrl+Z / Cmd+Z — registers once; calls the always-fresh ref
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndoRef.current();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Timer interval — set up/torn down reactively ──
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => timerMode === "down" ? Math.max(0, prev - 1) : prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerMode]);

  // Auto-stop countdown when it reaches 0
  useEffect(() => {
    if (timerMode === "down" && timerRunning && timerSeconds === 0) {
      setTimerRunning(false);
      hapticHeavy();
    }
  }, [timerSeconds, timerMode, timerRunning]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const toggleTimer = () => setTimerRunning(prev => !prev);

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(timerMode === "down" ? COUNTDOWN_FROM : 0);
  };

  const timerColor = timerMode === "down"
    ? timerSeconds < 60 ? "var(--accent-rose)"
    : timerSeconds < 300 ? "#f59e0b"
    : "var(--text-primary)"
    : "var(--text-primary)";

  // ── Multiplayer helpers ──

  /**
   * Apply received remote state — last-write-wins via updatedAt.
   * Local-priority window: if the local player made a change in the last 500ms,
   * ignore incoming remote state to prevent their change from reverting.
   */
  const handleRemoteUpdate = (state: SyncState) => {
    // Discard payloads from a different schema version — prevents silent data
    // corruption when the Player shape changes in a future deploy.
    if (state.schemaVersion !== SYNC_SCHEMA_VERSION) return;
    if (state.updatedAt <= lastAppliedAt.current) return;
    if (Date.now() - lastLocalChangeAt.current < 500) return;
    lastAppliedAt.current = state.updatedAt;
    setPlayers(state.players);
    setActiveCounters(state.activeCounters);
    setDayNightState(state.dayNightState);
    if (state.roomName !== undefined) setRoomName(state.roomName);
  };
  // Keep the ref fresh every render so async Supabase callbacks always call the latest version
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleRemoteUpdateRef.current = handleRemoteUpdate; });

  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    const code = generateRoomCode();
    try {
      const ok = await createRoom(code, (s) => handleRemoteUpdateRef.current(s));
      if (ok) {
        setRoomCode(code);
        setRoomConnected(true);
        setRoomRole("host");
        localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
        localStorage.setItem("nexus_judge_room_role", "host");
      } else {
        setRoomError("Could not connect. Check your internet and try again.");
      }
    } catch {
      setRoomError("Could not connect. Check your internet and try again.");
    } finally {
      setRoomLoading(false);
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    const code = (overrideCode ?? joinCodeInput).trim().toUpperCase();
    if (!code || !isSupabaseConfigured) return;
    setRoomLoading(true);
    setRoomError(null);
    const ok = await joinSyncRoom(code, (s) => handleRemoteUpdateRef.current(s));
    if (ok) {
      const role = overrideCode
        ? (localStorage.getItem("nexus_judge_room_role") as "host" | "guest" | null ?? "guest")
        : "guest";
      setRoomCode(code);
      setRoomConnected(true);
      setRoomRole(role);
      localStorage.setItem(STORAGE_KEYS.ROOM_CODE, code);
      localStorage.setItem("nexus_judge_room_role", role);
    } else if (!overrideCode) {
      // Only show error for manual joins — silent failure is fine for auto-rejoin
      setRoomError("Room not found or connection failed. Check the code and try again.");
    }
    setRoomLoading(false);
    if (!overrideCode) setJoinCodeInput("");
  };

  const handleLeaveRoom = () => {
    if (roomCode) leaveRoom(roomCode);
    setRoomCode(null);
    setRoomConnected(false);
    setRoomRole(null);
    setRoomError(null);
    lastAppliedAt.current = 0;
    lastLocalChangeAt.current = 0;
    localStorage.removeItem(STORAGE_KEYS.ROOM_CODE);
    localStorage.removeItem("nexus_judge_room_role");
  };

  const copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).catch(() => undefined);
    setRoomCopied(true);
    showToast(`Room code ${roomCode} copied!`, "success");
    setTimeout(() => setRoomCopied(false), 2000);
  };

  // ── Auto-rejoin on mount (app reopened after close) ──
  useEffect(() => {
    const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
    if (!savedCode || !isSupabaseConfigured) return;
    handleJoinRoom(savedCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount only

  // ── Auto-rejoin on visibility change (phone screen on / tab refocus) ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const savedCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE);
      if (!savedCode || !isSupabaseConfigured || roomConnected) return;
      handleJoinRoom(savedCode);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomConnected]);

  // ── Save-game helpers ─────────────────────────────────────────────────────

  /** Build a display-only snapshot of the current live game state.
   *  id/savedAt are left as defaults — handleSaveGame stamps them at save time
   *  so Date.now() is never called during render. */
  const buildCurrentSnapshot = (): GameSnapshot => ({
    id: "",
    savedAt: 0,
    playerCount,
    startingLife,
    playerNames: players.map(p => p.name),
    lifeTotals:  players.map(p => p.life),
    playersBlob:        players,
    activeCountersBlob: activeCounters,
    dayNightState,
    historyBlob:        history,
  });

  const persistSlots = (next: (GameSnapshot | null)[]) => {
    setSavedGames(next);
    localStorage.setItem(STORAGE_KEYS.SAVED_GAMES, JSON.stringify(next));
  };

  const handleSaveGame = (slotIndex: number) => {
    // Date.now() called from an event handler — not during render, so it's pure
    const ts = Date.now();
    const next = [...savedGames];
    next[slotIndex] = { ...buildCurrentSnapshot(), id: ts.toString(), savedAt: ts };
    persistSlots(next);
  };

  const handleLoadGame = (slot: GameSnapshot) => {
    scheduleBroadcast();
    setStartingLifeState(slot.startingLife);
    setPlayerCount(slot.playerCount);
    setPlayers((slot.playersBlob as Player[]).map(p => parseSavedPlayer(p, slot.startingLife)));
    setActiveCounters(slot.activeCountersBlob as ActiveCounters);
    setDayNightState(slot.dayNightState as DayNightState);
    setHistory(slot.historyBlob as string[]);
    setShowSaveModal(false);
  };

  const handleDeleteGame = (slotIndex: number) => {
    const next = [...savedGames];
    next[slotIndex] = null;
    persistSlots(next);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const handlePlayerCountChange = (count: number) => {
    scheduleBroadcast();
    setPlayerCount(count);
    setPlayers(Array.from({ length: count }, (_, i) => createPlayer(i, startingLife)));
    setHistory([`New game! ${count} players, ${startingLife} starting life.`]);
  };

  const handleStartingLifeChange = (life: number) => {
    scheduleBroadcast();
    setStartingLifeState(life);
    setPlayers(prev => prev.map(p => ({ ...p, life })));
    addLog(`Starting life changed to ${life}. All players updated.`);
  };

  /** Apply the Turn Order's current player roster (names + chosen colors) to the Life Counter */
  const handleSyncFromTurnOrder = () => {
    try {
      const savedNames  = JSON.parse(localStorage.getItem(STORAGE_KEYS.TURN_PLAYERS)  || "[]") as string[];
      const savedColors = JSON.parse(localStorage.getItem(STORAGE_KEYS.TURN_COLORS)   || "{}") as Record<string, string>;
      if (savedNames.length === 0) return;
      scheduleBroadcast();
      setPlayerCount(savedNames.length);
      setPlayers(savedNames.map((name, i) => {
        const colorName = (savedColors[name] && colorKeys.includes(savedColors[name] as keyof typeof colors))
          ? savedColors[name] as keyof typeof colors
          : colorKeys[i % colorKeys.length];
        return { ...createPlayer(i, startingLife), name, colorName };
      }));
      setHistory([`Synced ${savedNames.length} players from Turn Order.`]);
    } catch { /* ignore corrupt data */ }
  };

  const resetGame = () => {
    if (window.confirm(`Reset all players to ${startingLife} life and clear all counters?`)) {
      scheduleBroadcast();
      setPlayers(prev => prev.map(p => ({
        ...p, life: startingLife, tax: 0, taxPartner: 0,
        commanderDamage: {}, isMonarch: false, hasInitiative: false,
        cityBlessing: false, poison: 0, rad: 0,
        tokens: { treasure: 0, food: 0, clue: 0, blood: 0 },
      })));
      setHistory([`Game reset! All life set to ${startingLife}.`]);
    }
  };

  // ── NOTE: all action functions call addLog BEFORE setPlayers (never inside
  //    the updater), because React 18 StrictMode invokes updater functions
  //    twice — putting addLog inside would double every history entry. ────────

  const adjustLife = (playerId: number, amount: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    pushUndo(players);
    const next = player.life + amount;
    addLog(`${player.name}: ${amount > 0 ? "+" : ""}${amount} life → ${next}`);
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, life: next }));
  };

  const cycleColor = (playerId: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const next = (colorKeys.indexOf(p.colorName) + 1) % colorKeys.length;
      return { ...p, colorName: colorKeys[next] };
    }));
  };

  const renamePlayer = (playerId: number, name: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name: name || `Player ${playerId}` } : p));
  };

  const setAvatar = (playerId: number, emoji: string) => {
    scheduleBroadcast();
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, avatar: emoji } : p));
  };

  const revivePlayer = (playerId: number) => {
    scheduleBroadcast();
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, life: startingLife, commanderDamage: {}, poison: 0 } : p
    ));
  };

  const adjustTax = (playerId: number, isPartner: boolean, amount: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    pushUndo(players);
    if (isPartner) {
      const next = Math.max(0, player.taxPartner + amount);
      addLog(`${player.name} Partner Tax → ${next}`);
      setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, taxPartner: next }));
    } else {
      const next = Math.max(0, player.tax + amount);
      addLog(`${player.name} Cmd Tax → ${next}`);
      setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, tax: next }));
    }
  };

  const togglePartner = (playerId: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    addLog(`${player.name}: ${!player.partnerMode ? "Enabled" : "Disabled"} Partner mode.`);
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, partnerMode: !p.partnerMode, taxPartner: 0 }));
  };

  const assignMonarch = (playerId: number) => {
    scheduleBroadcast();
    pushUndo(players);
    const name = players.find(p => p.id === playerId)?.name;
    addLog(`👑 ${name} is now the Monarch!`);
    setPlayers(prev => prev.map(p => ({ ...p, isMonarch: p.id === playerId })));
  };

  /** Remove the monarch crown from everyone — no player holds it */
  const releaseMonarch = () => {
    scheduleBroadcast();
    pushUndo(players);
    addLog("👑 Monarch crown released — no one holds it.");
    setPlayers(prev => prev.map(p => ({ ...p, isMonarch: false })));
  };

  const assignInitiative = (playerId: number) => {
    scheduleBroadcast();
    pushUndo(players);
    const name = players.find(p => p.id === playerId)?.name;
    addLog(`⚔️ ${name} took the Initiative!`);
    setPlayers(prev => prev.map(p => ({ ...p, hasInitiative: p.id === playerId })));
  };

  /** Remove the initiative from everyone — no player holds it */
  const releaseInitiative = () => {
    scheduleBroadcast();
    pushUndo(players);
    addLog("⚔️ Initiative released — no one holds it.");
    setPlayers(prev => prev.map(p => ({ ...p, hasInitiative: false })));
  };

  const toggleCityBlessing = (playerId: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    pushUndo(players);
    addLog(`${player.name}: ${!player.cityBlessing ? "Gained" : "Lost"} the City's Blessing.`);
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, cityBlessing: !p.cityBlessing }));
  };

  const adjustPoison = (playerId: number, amount: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    pushUndo(players);
    const next = Math.max(0, (player.poison ?? 0) + amount);
    addLog(`${player.name} Poison: ${amount > 0 ? "+" : ""}${amount} → ${next}/10`);
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, poison: next }));
  };

  const adjustRad = (playerId: number, amount: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    scheduleBroadcast();
    pushUndo(players);
    const next = Math.max(0, (player.rad ?? 0) + amount);
    addLog(`${player.name} Rad: ${amount > 0 ? "+" : ""}${amount} → ${next}`);
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, rad: next }));
  };

  const adjustToken = (playerId: number, key: TokenKey, amount: number) => {
    scheduleBroadcast();
    pushUndo(players);
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const next = Math.max(0, (p.tokens[key] ?? 0) + amount);
      return { ...p, tokens: { ...p.tokens, [key]: next } };
    }));
  };

  const adjustCommanderDamage = (targetId: number, sourceId: number, suffix: string, amount: number) => {
    const target = players.find(p => p.id === targetId);
    const src    = players.find(p => p.id === sourceId);
    if (!target || !src) return;
    scheduleBroadcast();
    pushUndo(players);
    const key  = `${sourceId}${suffix}`;
    const next = Math.max(0, (target.commanderDamage[key] ?? 0) + amount);
    const label = suffix ? `${src.name}'s Partner` : `${src.name}'s Commander`;
    addLog(`${target.name} took ${amount > 0 ? "+" : ""}${amount} from ${label} (${next}/21)`);
    setPlayers(prev => prev.map(p =>
      p.id !== targetId ? p :
      { ...p, life: p.life - amount, commanderDamage: { ...p.commanderDamage, [key]: next } }
    ));
  };

  const cycleDayNight = () => {
    scheduleBroadcast();
    const next: DayNightState = dayNightState === "day" ? "night" : "day";
    setDayNightState(next);
    addLog(next === "day" ? "☀️ It is now Day." : "🌙 It is now Night.");
  };

  const toggleMechanic = (key: keyof ActiveCounters) => {
    scheduleBroadcast();
    setActiveCounters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === "dayNight") setDayNightState(next.dayNight ? "day" : "none");
      return next;
    });
  };

  // ── Per-player token actions ──
  const togglePlayerTokenType = (playerId: number, key: TokenKey) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const enabled = p.enabledTokens.includes(key)
        ? p.enabledTokens.filter(k => k !== key)
        : [...p.enabledTokens, key];
      return { ...p, enabledTokens: enabled };
    }));
  };

  const togglePlayerTokensPanel = (playerId: number) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, tokensOpen: !p.tokensOpen } : p
    ));
  };

  const getGridStyle = () => {
    if (playerCount === 2) return { gridTemplateColumns: "1fr 1fr" };
    if (playerCount <= 4) return { gridTemplateColumns: "1fr 1fr" };
    if (playerCount <= 6) return { gridTemplateColumns: "1fr 1fr 1fr" };
    return { gridTemplateColumns: "1fr 1fr 1fr 1fr" };
  };

  const hasAnyActive = Object.values(activeCounters).some(Boolean);
  const activeCount  = Object.values(activeCounters).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 48px)", overflow: "hidden" }}>

      {/* ── Main Column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden", minWidth: 0 }}>

        {/* ── Title Row (always visible) ── */}
        <div style={{ display: "flex", alignItems: "center", paddingBottom: "8px", borderBottom: controlsCollapsed ? "1px solid var(--border-color)" : "none", flexShrink: 0, gap: "8px" }}>
          {/* Heading — takes remaining space */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <Users size={20} color="var(--accent-purple)" />
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.1 }}>Life Counter</h2>
              {!controlsCollapsed && <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Commander &amp; variant formats</p>}
            </div>
          </div>

          {/* Live badge — shown when multiplayer is active */}
          {roomConnected && roomCode && (
            <div style={{
              display: "flex", alignItems: "center", gap: "4px",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "20px", padding: "3px 8px", flexShrink: 0,
            }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-emerald)", animation: "pulse-glow 1.5s infinite" }} />
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--accent-emerald)", letterSpacing: "0.5px" }}>
                {roomCode}
              </span>
            </div>
          )}

          {/* ── Game Timer widget ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
            {/* Mode toggle */}
            <button
              onClick={() => { resetTimer(); setTimerMode(prev => prev === "up" ? "down" : "up"); }}
              title={timerMode === "up" ? "Switch to countdown (45 min)" : "Switch to count up"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: timerMode === "down" ? "var(--accent-purple)" : "var(--text-muted)",
                display: "flex", alignItems: "center", padding: "4px",
                transition: "color 0.15s ease",
              }}
            >
              <Timer size={13} />
            </button>
            {/* Time display */}
            <span
              style={{
                fontSize: "0.82rem", fontWeight: 700, fontFamily: "'Outfit', monospace",
                minWidth: "42px", textAlign: "center",
                color: timerColor,
                transition: "color 0.3s ease",
              }}
            >
              {formatTime(timerSeconds)}
            </span>
            {/* Play / Stop */}
            <button
              onClick={toggleTimer}
              aria-label={timerRunning ? "Stop timer" : "Start timer"}
              title={timerRunning ? "Stop timer" : "Start timer"}
              style={{
                background: timerRunning ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${timerRunning ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "6px", padding: "5px 7px",
                color: timerRunning ? "var(--accent-rose)" : "var(--text-secondary)",
                cursor: "pointer", display: "flex", alignItems: "center",
                transition: "all 0.15s ease",
              }}
            >
              {timerRunning ? <Square size={11} /> : <Play size={11} />}
            </button>
            {/* Reset */}
            <button
              onClick={resetTimer}
              aria-label="Reset timer"
              title="Reset timer"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", display: "flex", alignItems: "center", padding: "5px 4px",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--text-secondary)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
            >
              <RotateCcw size={11} />
            </button>
          </div>

          {/* Undo button */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            aria-label="Undo last action"
            title={undoStack.length > 0 ? `Undo last action (Ctrl+Z) — ${undoStack.length} step${undoStack.length > 1 ? "s" : ""} available` : "Nothing to undo"}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", padding: "7px 10px",
              color: undoStack.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
              cursor: undoStack.length > 0 ? "pointer" : "not-allowed",
              fontSize: "0.72rem", fontWeight: 600,
              opacity: undoStack.length > 0 ? 1 : 0.4,
              transition: "all 0.15s ease", flexShrink: 0,
            }}
          >
            <Undo2 size={14} />
            <span className="lc-controls-label">Undo</span>
          </button>

          {/* Controls toggle — hamburger, top-right */}
          <button
            onClick={toggleControls}
            aria-label={controlsCollapsed ? "Show game controls" : "Hide game controls"}
            title={controlsCollapsed ? "Show controls" : "Hide controls"}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: controlsCollapsed ? "rgba(139,92,246,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${controlsCollapsed ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: "8px", padding: "7px 10px",
              color: controlsCollapsed ? "var(--accent-purple)" : "var(--text-muted)",
              cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
              transition: "all 0.15s ease", flexShrink: 0,
            }}
          >
            <Menu size={14} />
            <span className="lc-controls-label">{controlsCollapsed ? "Controls" : "Hide"}</span>
          </button>
        </div>

        {/* ── Collapsible Control Bar ── */}
        {!controlsCollapsed && (
          <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", flexShrink: 0, gap: "10px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center" }}>

              {/* Starting Life Selector */}
              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "3px", gap: "1px" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", padding: "0 7px", fontWeight: 600, whiteSpace: "nowrap" }}>START:</span>
                {STARTING_LIFE_OPTIONS.map(life => (
                  <button
                    key={life}
                    onClick={() => handleStartingLifeChange(life)}
                    style={{
                      background: startingLife === life ? "var(--accent-emerald)" : "transparent",
                      color: startingLife === life ? "#fff" : "var(--text-secondary)",
                      border: "none", borderRadius: "5px", padding: "5px 9px",
                      fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >
                    {life}
                  </button>
                ))}
              </div>

              {/* Player Count Selector */}
              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "3px", gap: "1px" }}>
                {[2, 3, 4, 5, 6, 8].map(num => (
                  <button
                    key={num}
                    onClick={() => handlePlayerCountChange(num)}
                    style={{
                      background: playerCount === num ? "var(--accent-purple)" : "transparent",
                      color: playerCount === num ? "#fff" : "var(--text-secondary)",
                      border: "none", borderRadius: "5px", padding: "5px 10px",
                      fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >
                    {num}P
                  </button>
                ))}
              </div>

              {/* Mechanics Menu */}
              <div style={{ position: "relative" }} ref={menuRef}>
                <button
                  onClick={() => setShowCountersMenu(!showCountersMenu)}
                  className="glass-button"
                  style={{
                    padding: "7px 13px", fontSize: "0.82rem",
                    background: hasAnyActive ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.02)",
                    borderColor: hasAnyActive ? "var(--accent-purple)" : "rgba(255,255,255,0.1)",
                  }}
                >
                  <Settings2 size={14} color={hasAnyActive ? "var(--accent-purple)" : "var(--text-secondary)"} />
                  <span>Mechanics</span>
                  {hasAnyActive && (
                    <span style={{ background: "var(--accent-purple)", borderRadius: "50%", width: "17px", height: "17px", fontSize: "0.65rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {activeCount}
                    </span>
                  )}
                </button>

                {showCountersMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", left: 0, width: "250px",
                    background: "rgba(12,9,20,0.99)", border: "1px solid var(--border-color)",
                    borderRadius: "14px", boxShadow: "0 16px 48px rgba(0,0,0,0.7)", padding: "14px",
                    zIndex: 100, display: "flex", flexDirection: "column", gap: "4px",
                  }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                      Enable Game Mechanics
                    </div>
                    {MECHANICS_CONFIG.map(({ key, label, Icon, color, desc }) => {
                      const isActive = activeCounters[key];
                      return (
                        <button
                          key={key}
                          onClick={() => toggleMechanic(key)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            background: isActive ? `${color}18` : "transparent",
                            border: `1px solid ${isActive ? `${color}40` : "transparent"}`,
                            color: "#fff", cursor: "pointer",
                            padding: "8px 10px", borderRadius: "9px", textAlign: "left",
                            transition: "all 0.15s ease", width: "100%",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{
                              width: "30px", height: "30px", borderRadius: "8px",
                              background: isActive ? `${color}28` : "rgba(255,255,255,0.05)",
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                              <Icon size={15} color={isActive ? color : "var(--text-muted)"} />
                            </div>
                            <div>
                              <div style={{ fontSize: "0.87rem", fontWeight: 600, color: isActive ? "#fff" : "var(--text-secondary)" }}>{label}</div>
                              <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{desc}</div>
                            </div>
                          </div>
                          {isActive && <Check size={14} color={color} style={{ flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sync from Turn Order */}
              <button
                onClick={handleSyncFromTurnOrder}
                className="glass-button"
                title="Import player names and colors from the Turn Order tab"
                style={{ padding: "7px 13px", fontSize: "0.82rem", background: "rgba(255,255,255,0.02)" }}
              >
                <RefreshCw size={14} />
                <span>Sync Turn Order</span>
              </button>

              {/* Save / Load Game */}
              <button
                onClick={() => setShowSaveModal(true)}
                className="glass-button"
                style={{ padding: "7px 13px", fontSize: "0.82rem", background: "rgba(255,255,255,0.02)" }}
              >
                <Save size={14} />
                <span>Games</span>
              </button>

              {/* Game Summary */}
              <button
                onClick={() => setShowSummary(true)}
                className="glass-button"
                style={{ padding: "7px 13px", fontSize: "0.82rem", background: "rgba(234,179,8,0.06)", borderColor: "rgba(234,179,8,0.2)" }}
              >
                <Trophy size={14} color="#eab308" />
                <span>Summary</span>
              </button>

              {/* Reset */}
              <button onClick={resetGame} className="glass-button" style={{ padding: "7px 13px", fontSize: "0.82rem", background: "rgba(255,255,255,0.02)" }}>
                <RefreshCw size={14} />
                <span>Reset</span>
              </button>
            </div>

            {/* ── Multiplayer Section ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", flexShrink: 0 }}>
                Multiplayer:
              </span>

              {roomError && (
                <span style={{ fontSize: "0.75rem", color: "var(--accent-rose)", fontWeight: 600 }}>
                  ⚠️ {roomError}
                </span>
              )}

              {!isSupabaseConfigured ? (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Configure Supabase in .env to enable live sync
                </span>
              ) : !roomConnected ? (
                <>
                  {/* Optional room name */}
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Room name (optional)"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value.slice(0, 24))}
                    style={{ width: "130px", padding: "5px 9px", fontSize: "0.75rem" }}
                  />

                  {/* Create Room */}
                  <button
                    onClick={handleCreateRoom}
                    disabled={roomLoading}
                    className="glass-button"
                    style={{ padding: "6px 12px", fontSize: "0.8rem", background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)" }}
                  >
                    <Wifi size={13} color="var(--accent-purple)" />
                    <span>{roomLoading ? "Connecting…" : "Create Room"}</span>
                  </button>

                  {/* Join Room */}
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Room code…"
                      value={joinCodeInput}
                      onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                      onKeyDown={e => { if (e.key === "Enter") handleJoinRoom(); }}
                      style={{ width: "96px", padding: "6px 10px", fontSize: "0.8rem", letterSpacing: "1px", fontWeight: 700 }}
                    />
                    <button
                      onClick={() => handleJoinRoom()}
                      disabled={joinCodeInput.trim().length < 4 || roomLoading}
                      className="glass-button"
                      style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                    >
                      Join
                    </button>
                  </div>
                </>
              ) : (
                /* Connected state */
                <>
                  {/* Status badge */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                    borderRadius: "20px", padding: "4px 10px",
                  }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--accent-emerald)", animation: "pulse-glow 1.5s infinite" }} />
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-emerald)" }}>LIVE</span>
                    {roomName && <span style={{ fontSize: "0.75rem", color: "var(--accent-emerald)", fontWeight: 600, maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roomName}</span>}
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, letterSpacing: "1px" }}>{roomCode}</span>
                    <button
                      onClick={copyRoomCode}
                      title={roomCopied ? "Copied!" : "Copy room code"}
                      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 2px", color: roomCopied ? "var(--accent-emerald)" : "var(--text-muted)" }}
                    >
                      {roomCopied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>

                  {/* Role label */}
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                    {roomRole === "host" ? "👑 Host" : "🎮 Guest"}
                  </span>

                  {/* Leave */}
                  <button
                    onClick={handleLeaveRoom}
                    className="glass-button"
                    style={{ padding: "6px 12px", fontSize: "0.8rem", background: "rgba(244,63,94,0.1)", borderColor: "rgba(244,63,94,0.25)", color: "var(--accent-rose)" }}
                  >
                    <WifiOff size={13} />
                    <span>Leave</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Day / Night Global Banner */}
        {activeCounters.dayNight && dayNightState !== "none" && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "16px",
            padding: "10px 24px", borderRadius: "10px", flexShrink: 0,
            background: dayNightState === "day"
              ? "linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(251,191,36,0.06) 100%)"
              : "linear-gradient(135deg, rgba(139,92,246,0.14) 0%, rgba(99,102,241,0.07) 100%)",
            border: `1px solid ${dayNightState === "day" ? "rgba(234,179,8,0.3)" : "rgba(139,92,246,0.3)"}`,
          }}>
            {dayNightState === "day" ? <Sun size={20} color="#eab308" /> : <Moon size={20} color="#8b5cf6" />}
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              It is currently&nbsp;
              <span style={{ color: dayNightState === "day" ? "#eab308" : "#8b5cf6" }}>
                {dayNightState === "day" ? "Day ☀️" : "Night 🌙"}
              </span>
            </span>
            <button
              onClick={cycleDayNight}
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "8px", padding: "5px 14px", color: "#fff", cursor: "pointer",
                fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              {dayNightState === "day" ? <Moon size={13} /> : <Sun size={13} />}
              Flip to {dayNightState === "day" ? "Night" : "Day"}
            </button>
          </div>
        )}

        {/* Player Grid */}
        <div className="life-counter-player-grid" style={{ flex: 1, display: "grid", gap: "12px", ...getGridStyle(), minHeight: 0, overflow: "hidden" }}>
          {players.map(p => {
            const playerTheme = colors[p.colorName] || colors.purple;
            return (
              <PlayerCard
                key={p.id}
                p={p}
                players={players}
                playerTheme={playerTheme}
                activeCounters={activeCounters}
                colors={colors}
                adjustLife={adjustLife}
                adjustPoison={adjustPoison}
                adjustRad={adjustRad}
                adjustToken={adjustToken}
                adjustTax={adjustTax}
                togglePartner={togglePartner}
                renamePlayer={renamePlayer}
                cycleColor={cycleColor}
                setAvatar={setAvatar}
                assignMonarch={assignMonarch}
                releaseMonarch={releaseMonarch}
                assignInitiative={assignInitiative}
                releaseInitiative={releaseInitiative}
                toggleCityBlessing={toggleCityBlessing}
                togglePlayerTokenType={togglePlayerTokenType}
                togglePlayerTokensPanel={togglePlayerTokensPanel}
                setActiveDamageEditor={setActiveDamageEditor}
                revivePlayer={revivePlayer}
              />
            );
          })}
        </div>

      </div>

      {/* ── Commander Damage Modal ── */}
      {activeDamageEditor !== null && (() => {
        const target = players.find(p => p.id === activeDamageEditor);
        if (!target) return null;
        return (
          <CommanderDamageModal
            targetPlayer={target}
            allPlayers={players}
            colors={colors}
            onAdjust={adjustCommanderDamage}
            onClose={() => setActiveDamageEditor(null)}
          />
        );
      })()}

      {/* ── Side Ledger ── */}
      <GameHistoryLedger history={history} collapsed={historyCollapsed} onToggle={toggleHistory} />

      {/* ── Save / Load Game Modal ── */}
      {showSaveModal && (
        <SaveGameModal
          slots={savedGames}
          currentSnapshot={buildCurrentSnapshot()}
          onSave={handleSaveGame}
          onLoad={handleLoadGame}
          onDelete={handleDeleteGame}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* ── Game Summary Modal ── */}
      {showSummary && (
        <GameSummaryModal players={players} onClose={() => setShowSummary(false)} />
      )}

    </div>
  );
};
