import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Minus, ShieldAlert, RefreshCw, Users, Shield,
  Crown, Skull, Radiation, Settings2, Check, Moon, Sun,
  Swords, Star, Coins, Save, Menu, Undo2,
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
} from "../services/multiplayerSync";
import type { SyncState } from "../services/multiplayerSync";
import { isSupabaseConfigured } from "../services/supabase";
import { GameHistoryLedger } from "./life-counter/GameHistoryLedger";
import { CommanderDamageModal } from "./life-counter/CommanderDamageModal";
import { SaveGameModal, MAX_SLOTS } from "./life-counter/SaveGameModal";
import type { GameSnapshot } from "./life-counter/SaveGameModal";
import { GameSummaryModal } from "./life-counter/GameSummaryModal";
import { STORAGE_KEYS } from "../constants/storageKeys";

// ── Types ────────────────────────────────────────────────────────────────────

type TokenKey = "treasure" | "food" | "clue" | "blood";
interface PlayerTokens { treasure: number; food: number; clue: number; blood: number; }

interface Player {
  id: number;
  name: string;
  life: number;
  tax: number;
  taxPartner: number;
  partnerMode: boolean;
  colorName: "white" | "blue" | "black" | "red" | "green" | "purple";
  commanderDamage: Record<string, number>;
  isMonarch: boolean;
  hasInitiative: boolean;
  cityBlessing: boolean;
  poison: number;
  rad: number;
  tokens: PlayerTokens;
  enabledTokens: TokenKey[];   // Which token types this player has enabled (per-player)
  tokensOpen: boolean;         // Whether this player's token panel is expanded
}

type DayNightState = "none" | "day" | "night";

interface ActiveCounters {
  monarch: boolean;
  poison: boolean;
  rad: boolean;
  dayNight: boolean;
  initiative: boolean;
  cityBlessing: boolean;
  tokens: boolean;
}

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

const TOKEN_TYPES: { key: TokenKey; label: string; emoji: string; color: string }[] = [
  { key: "treasure", label: "Treasure", emoji: "🪙", color: "#eab308" },
  { key: "food",     label: "Food",     emoji: "🍎", color: "#10b981" },
  { key: "clue",     label: "Clue",     emoji: "🔍", color: "#06b6d4" },
  { key: "blood",    label: "Blood",    emoji: "🩸", color: "#f43f5e" },
];

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
    players,
    activeCounters,
    dayNightState,
    updatedAt: Date.now(),
    updatedBy: players[0]?.name ?? "Unknown",
  });

  /**
   * Debounced broadcast — batches rapid taps into one message (150ms).
   * Also stamps `lastLocalChangeAt` so handleRemoteUpdate knows a local change just happened.
   */
  const scheduleBroadcast = () => {
    if (!roomConnected || !roomCode) return;
    lastLocalChangeAt.current = Date.now();
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      broadcastState(roomCode, buildSyncState());
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
    if (state.updatedAt <= lastAppliedAt.current) return;
    if (Date.now() - lastLocalChangeAt.current < 500) return;
    lastAppliedAt.current = state.updatedAt;
    setPlayers(state.players);
    setActiveCounters(state.activeCounters);
    setDayNightState(state.dayNightState as typeof dayNightState);
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

  // ── Helpers ──
  const isDeadGeneral  = (p: Player) => p.life <= 0;
  const isPoisonDead   = (p: Player) => (p.poison ?? 0) >= 10;

  const getCmdDeathReason = (p: Player): string | null => {
    for (const [key, dmg] of Object.entries(p.commanderDamage)) {
      if (dmg >= 21) {
        const srcId = parseInt(key.split("_")[0]);
        const isPartner = key.includes("_B");
        const src = players.find(s => s.id === srcId);
        return `${src?.name ?? `P${srcId}`}'s ${isPartner ? "Partner" : "Commander"} (${dmg}/21)`;
      }
    }
    return null;
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
                      onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6))}
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
            const cmdDeath = getCmdDeathReason(p);
            const poisonDead = isPoisonDead(p);
            const isDefeated = isDeadGeneral(p) || !!cmdDeath || poisonDead;

            return (
              <div
                key={p.id}
                style={{
                  background: playerTheme.bg, borderRadius: "14px",
                  border: `1.5px solid ${p.isMonarch ? "#eab308" : isDefeated ? "rgba(239,68,68,0.6)" : playerTheme.border}`,
                  padding: "12px 14px", display: "flex", flexDirection: "column", gap: "4px",
                  boxShadow: p.isMonarch
                    ? "0 0 24px rgba(234,179,8,0.18), 0 4px 20px rgba(0,0,0,0.3)"
                    : isDefeated
                      ? "0 0 20px rgba(239,68,68,0.2) inset, 0 4px 20px rgba(0,0,0,0.3)"
                      : "0 4px 20px rgba(0,0,0,0.3)",
                  position: "relative", overflow: "hidden",
                  transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                }}
              >

                {/* ── Monarch Badge ── click uncrowned player to crown them;
                     click the current monarch to release the crown entirely */}
                {activeCounters.monarch && (
                  <button
                    onClick={() => p.isMonarch ? releaseMonarch() : assignMonarch(p.id)}
                    aria-label={p.isMonarch ? "Release Monarch crown" : "Crown this player as Monarch"}
                    title={p.isMonarch ? "Click to release the crown (no one becomes Monarch)" : "Click to crown this player"}
                    style={{
                      position: "absolute", top: "40px", right: activeCounters.initiative ? "52px" : "10px",
                      zIndex: 10, width: "36px", height: "36px", borderRadius: "50%",
                      background: p.isMonarch ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.05)",
                      border: `1.5px solid ${p.isMonarch ? "#eab308" : "rgba(255,255,255,0.1)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: p.isMonarch ? "0 0 14px rgba(234,179,8,0.55)" : "none",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Crown size={18} color={p.isMonarch ? "#eab308" : "rgba(255,255,255,0.2)"} />
                  </button>
                )}

                {/* ── Initiative Badge ── click holder to release; click others to assign */}
                {activeCounters.initiative && (
                  <button
                    onClick={() => p.hasInitiative ? releaseInitiative() : assignInitiative(p.id)}
                    aria-label={p.hasInitiative ? "Release the Initiative" : "Assign the Initiative to this player"}
                    title={p.hasInitiative ? "Click to release the Initiative (no one holds it)" : "Click to assign the Initiative"}
                    style={{
                      position: "absolute", top: "40px", right: "10px",
                      zIndex: 10, width: "36px", height: "36px", borderRadius: "50%",
                      background: p.hasInitiative ? "rgba(6,182,212,0.25)" : "rgba(255,255,255,0.05)",
                      border: `1.5px solid ${p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.1)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: p.hasInitiative ? "0 0 14px rgba(6,182,212,0.55)" : "none",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Swords size={17} color={p.hasInitiative ? "#06b6d4" : "rgba(255,255,255,0.2)"} />
                  </button>
                )}

                {/* ── Defeated Overlay ── */}
                {isDefeated && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(8,7,11,0.88)", backdropFilter: "blur(5px)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "10px", zIndex: 5, padding: "20px", textAlign: "center",
                  }}>
                    <ShieldAlert size={34} color="var(--accent-rose)" />
                    <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", letterSpacing: "0.5px" }}>DEFEATED</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "80%" }}>
                      {poisonDead ? "10 Poison Counters" : cmdDeath ? `Cmd Dmg from ${cmdDeath}` : `Life → ${p.life}`}
                    </span>
                    <button
                      onClick={() => setPlayers(prev => prev.map(pl => pl.id === p.id ? { ...pl, life: startingLife, commanderDamage: {}, poison: 0 } : pl))}
                      className="glass-button"
                      style={{ padding: "5px 14px", fontSize: "0.72rem", marginTop: "4px" }}
                    >
                      Revive
                    </button>
                  </div>
                )}

                {/* ── Header Row: Name + Color Dot ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: (activeCounters.monarch || activeCounters.initiative) ? "44px" : "0" }}>
                  <input
                    type="text"
                    value={p.name}
                    onChange={e => renamePlayer(p.id, e.target.value)}
                    style={{
                      background: "none", border: "none", color: "#fff",
                      fontSize: "0.95rem", fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                      flex: 1, outline: "none", borderBottom: "1px dashed transparent",
                      transition: "border-color 0.15s ease",
                    }}
                    onFocus={e => e.target.style.borderBottomColor = playerTheme.accent}
                    onBlur={e => e.target.style.borderBottomColor = "transparent"}
                  />
                  <button
                    onClick={() => cycleColor(p.id)}
                    aria-label="Cycle player color"
                    style={{
                      width: "18px", height: "18px", borderRadius: "50%", background: playerTheme.accent,
                      border: "2px solid #fff", cursor: "pointer", flexShrink: 0,
                      transition: "transform 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                    title="Cycle Color"
                  />
                </div>

                {/* City's Blessing label */}
                {activeCounters.cityBlessing && p.cityBlessing && (
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "-2px" }}>
                    <Star size={10} color="#eab308" fill="#eab308" />
                    <span style={{ fontSize: "0.65rem", color: "#eab308", fontWeight: 600 }}>City's Blessing</span>
                  </div>
                )}

                {/* ── LIFE TOTAL ── */}
                <div className="lc-life-section" style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, paddingTop: "2px" }}>
                  <button
                    className="lc-life-small-adj"
                    onClick={() => adjustLife(p.id, -5)}
                    title="−5 life"
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: "1rem", fontWeight: 700, cursor: "pointer", padding: "8px 18px", transition: "color 0.1s", letterSpacing: "0.5px" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#fff"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
                  >
                    −5
                  </button>

                  <button
                    className="lc-life-btn lc-life-btn-minus"
                    onClick={() => adjustLife(p.id, -1)}
                    style={{
                      background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%",
                      width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", cursor: "pointer", transition: "background 0.15s", flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.6)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.35)"}
                  >
                    <Minus size={20} />
                  </button>

                  <span
                    className="lc-life-number"
                    style={{
                      fontSize: "clamp(3.8rem, 5.5vw, 7rem)",
                      fontWeight: 900, fontFamily: "'Outfit', sans-serif",
                      minWidth: "100px", textAlign: "center",
                      textShadow: `0 0 40px ${playerTheme.accent}50, 0 4px 16px rgba(0,0,0,0.6)`,
                      lineHeight: 1, letterSpacing: "-3px",
                      filter: p.life < 10 ? "drop-shadow(0 0 8px rgba(239,68,68,0.7))" : "none",
                      color: p.life <= 0 ? "#ef4444" : p.life < 10 ? "#fca5a5" : "#fff",
                    }}
                  >
                    {p.life}
                  </span>

                  <button
                    className="lc-life-btn lc-life-btn-plus"
                    onClick={() => adjustLife(p.id, 1)}
                    style={{
                      background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%",
                      width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", cursor: "pointer", transition: "background 0.15s", flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.6)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.35)"}
                  >
                    <Plus size={20} />
                  </button>

                  <button
                    className="lc-life-small-adj"
                    onClick={() => adjustLife(p.id, 5)}
                    title="+5 life"
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: "1rem", fontWeight: 700, cursor: "pointer", padding: "8px 18px", transition: "color 0.1s", letterSpacing: "0.5px" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#fff"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.55)"}
                  >
                    +5
                  </button>
                </div>

                {/* ── Poison + Rad Counters ── */}
                {(activeCounters.poison || activeCounters.rad) && (
                  <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>

                    {activeCounters.poison && (
                      <div style={{
                        display: "flex", alignItems: "center",
                        background: (p.poison ?? 0) >= 10 ? "rgba(239,68,68,0.2)" : "rgba(0,0,0,0.38)",
                        border: `1.5px solid ${(p.poison ?? 0) >= 10 ? "rgba(239,68,68,0.6)" : "rgba(16,185,129,0.4)"}`,
                        borderRadius: "12px", padding: "5px 4px",
                        boxShadow: (p.poison ?? 0) >= 10 ? "0 0 12px rgba(239,68,68,0.3)" : "none",
                      }}>
                        <button onClick={() => adjustPoison(p.id, -1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>−</button>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: "58px", justifyContent: "center" }}>
                          <Skull size={18} color={(p.poison ?? 0) >= 10 ? "#ef4444" : "#10b981"} />
                          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: (p.poison ?? 0) >= 10 ? "#ef4444" : "#fff", minWidth: "26px", textAlign: "center", lineHeight: 1 }}>
                            {p.poison ?? 0}
                          </span>
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", lineHeight: 1 }}>/10</span>
                        </div>
                        <button onClick={() => adjustPoison(p.id, 1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>+</button>
                      </div>
                    )}

                    {activeCounters.rad && (
                      <div style={{
                        display: "flex", alignItems: "center",
                        background: "rgba(0,0,0,0.38)",
                        border: "1.5px solid rgba(249,115,22,0.4)",
                        borderRadius: "12px", padding: "5px 4px",
                      }}>
                        <button onClick={() => adjustRad(p.id, -1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>−</button>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: "48px", justifyContent: "center" }}>
                          <Radiation size={18} color="#f97316" />
                          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fff", minWidth: "26px", textAlign: "center", lineHeight: 1 }}>
                            {p.rad ?? 0}
                          </span>
                        </div>
                        <button onClick={() => adjustRad(p.id, 1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "2px 8px", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1 }}>+</button>
                      </div>
                    )}

                  </div>
                )}

                {/* ── Enabled Token Counters (above bottom row) ── */}
                {p.enabledTokens.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                    {TOKEN_TYPES.filter(t => p.enabledTokens.includes(t.key)).map(({ key, emoji, color }) => (
                      <div key={key} style={{
                        display: "flex", alignItems: "center", gap: "1px",
                        background: "rgba(0,0,0,0.35)", border: `1px solid ${color}38`,
                        borderRadius: "9px", padding: "2px 3px",
                      }}>
                        <button onClick={() => adjustToken(p.id, key, -1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "1px 5px", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1 }}>−</button>
                        <span style={{ fontSize: "0.9rem" }}>{emoji}</span>
                        <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#fff", minWidth: "16px", textAlign: "center" }}>{p.tokens?.[key] ?? 0}</span>
                        <button onClick={() => adjustToken(p.id, key, 1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "1px 5px", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1 }}>+</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* City's Blessing Toggle */}
                {activeCounters.cityBlessing && (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => toggleCityBlessing(p.id)}
                      style={{
                        background: p.cityBlessing ? "rgba(234,179,8,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${p.cityBlessing ? "rgba(234,179,8,0.35)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: "8px", padding: "3px 12px", cursor: "pointer",
                        color: p.cityBlessing ? "#eab308" : "var(--text-muted)",
                        fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px",
                      }}
                    >
                      <Star size={10} fill={p.cityBlessing ? "#eab308" : "none"} color={p.cityBlessing ? "#eab308" : "var(--text-muted)"} />
                      {p.cityBlessing ? "City's Blessing ✓" : "Gain City's Blessing"}
                    </button>
                  </div>
                )}

                {/* Commander Damage Badges */}
                {Object.keys(p.commanderDamage).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
                    {Object.entries(p.commanderDamage).map(([key, dmg]) => {
                      if (!dmg) return null;
                      const srcId = parseInt(key.split("_")[0], 10);
                      const isPartner = key.includes("_B");
                      const src = players.find(s => s.id === srcId);
                      const srcColor = src ? (colors[src.colorName]?.accent || "#ef4444") : "#ef4444";
                      return (
                        <div key={key} style={{
                          background: "rgba(0,0,0,0.4)", border: `1px solid ${srcColor}70`,
                          borderRadius: "6px", padding: "2px 8px", fontSize: "0.7rem",
                          color: srcColor, display: "flex", gap: "5px", alignItems: "center",
                        }}>
                          <span>{src?.name ?? `P${srcId}`}{isPartner ? " (P)" : ""}</span>
                          <span style={{ fontWeight: 800, color: dmg >= 21 ? "#ef4444" : "#fff" }}>{dmg}/21</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Token Type Picker (expands above bottom row when tokensOpen) */}
                {p.tokensOpen && (
                  <div style={{
                    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "8px", padding: "6px 8px",
                    display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "center",
                  }}>
                    {TOKEN_TYPES.map(({ key, label, emoji, color }) => {
                      const isEnabled = p.enabledTokens.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => togglePlayerTokenType(p.id, key)}
                          style={{
                            background: isEnabled ? `${color}18` : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isEnabled ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                            borderRadius: "7px", padding: "3px 8px", cursor: "pointer",
                            color: isEnabled ? color : "var(--text-muted)",
                            fontSize: "0.68rem", fontWeight: isEnabled ? 700 : 500,
                            display: "flex", alignItems: "center", gap: "4px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span style={{ fontSize: "0.85rem" }}>{emoji}</span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Bottom Row: Tax | [Tokens + Cmd Dmg] */}
                <div className="lc-bottom-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "9px", gap: "4px" }}>

                  {/* Tax (left) */}
                  <div className="lc-tax-section" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.5px" }}>TAX:</span>
                      <button
                        onClick={() => togglePartner(p.id)}
                        style={{
                          fontSize: "0.68rem", border: "none",
                          background: p.partnerMode ? "var(--accent-purple)" : "rgba(255,255,255,0.05)",
                          color: p.partnerMode ? "#fff" : "var(--text-muted)",
                          padding: "2px 8px", borderRadius: "10px", cursor: "pointer", fontWeight: 700,
                        }}
                      >Partner</button>
                    </div>
                    <div style={{ display: "flex", gap: p.partnerMode ? "8px" : "0", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "3px 7px" }}>
                        <button onClick={() => adjustTax(p.id, false, -2)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Minus size={12} /></button>
                        <span style={{ fontSize: "1.05rem", fontWeight: 700, minWidth: "22px", textAlign: "center", color: "#fff" }}>{p.tax}</span>
                        <button onClick={() => adjustTax(p.id, false, 2)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Plus size={12} /></button>
                      </div>
                      {p.partnerMode && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", padding: "3px 7px" }}>
                          <button onClick={() => adjustTax(p.id, true, -2)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Minus size={12} /></button>
                          <span style={{ fontSize: "1.05rem", fontWeight: 700, minWidth: "22px", textAlign: "center", color: "#fff" }}>{p.taxPartner}</span>
                          <button onClick={() => adjustTax(p.id, true, 2)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: "2px 3px" }}><Plus size={12} /></button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tokens + Cmd Dmg grouped (share a row on mobile) */}
                  <div className="lc-bottom-secondary" style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {/* Tokens button */}
                    <button
                      onClick={() => togglePlayerTokensPanel(p.id)}
                      style={{
                        background: p.tokensOpen ? "rgba(234,179,8,0.12)" : p.enabledTokens.length > 0 ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${p.tokensOpen ? "rgba(234,179,8,0.4)" : p.enabledTokens.length > 0 ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: "8px", padding: "7px 10px", cursor: "pointer",
                        color: p.tokensOpen || p.enabledTokens.length > 0 ? "#eab308" : "var(--text-muted)",
                        fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "5px",
                        transition: "all 0.15s ease", flexShrink: 0,
                      }}
                    >
                      <Coins size={12} color={p.tokensOpen || p.enabledTokens.length > 0 ? "#eab308" : "var(--text-muted)"} />
                      <span className="lc-btn-label">Tokens{p.enabledTokens.length > 0 ? ` (${p.enabledTokens.length})` : ""}</span>
                    </button>

                    {/* Cmd Damage Button */}
                    <button
                      onClick={() => setActiveDamageEditor(p.id)}
                      style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px", padding: "7px 10px", color: "var(--text-primary)",
                        fontSize: "0.72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                        transition: "background 0.15s", flexShrink: 0,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    >
                      <Shield size={13} color="var(--accent-cyan)" />
                      <span className="lc-btn-label">Cmd Dmg</span>
                    </button>
                  </div>
                </div>

              </div>
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
