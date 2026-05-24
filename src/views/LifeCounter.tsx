import React, { useState, useEffect, useRef } from "react";
import { History, Menu, Settings2, Check, Moon, Save, Trophy, RefreshCw, Wifi, Users, Scale, WifiOff, Copy, Timer, Square, Play, Crown, Skull, Swords, Star } from "lucide-react";
import { useMobile } from "../hooks/useMobile";
import { useGameTimer } from "../hooks/useGameTimer";
import { loadDecks, recordDeckResult } from "../services/decks";
import type { SavedDeck } from "../types/deck";
import { useAppStore } from "../store/useAppStore";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { clearPersistedState } from "../services/multiplayerSync";
import type { Player, ActiveCounters, DayNightState, TokenKey, LobbyPlayer } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { HistoryModal } from "./life-counter/HistoryModal";
import { CommanderDamageModal } from "./life-counter/CommanderDamageModal";
import { SaveGameModal, MAX_SLOTS } from "./life-counter/SaveGameModal";
import type { GameSnapshot } from "./life-counter/SaveGameModal";
import { GameSummaryModal } from "./life-counter/GameSummaryModal";
import { TokenModal } from "./life-counter/TokenModal";
import { TaxModal } from "./life-counter/TaxModal";
import { EndGameModal } from "./life-counter/EndGameModal";
import { PlayerCard } from "./life-counter/PlayerCard";
import { DayNightBanner } from "./life-counter/DayNightBanner";
import { TableCenter } from "./life-counter/TableCenter";
import { useWakeLock } from "../hooks/useWakeLock";
import { recordGame } from "../services/leaderboard";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { parseSavedPlayer } from "../utils/playerUtils";
import { useToast } from "../components/Toast";
import { BottomSheet } from "../components/BottomSheet";

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
  { key: "cityBlessing", label: "City's Blessing",  Icon: Star,      color: "#eab308", desc: "Ascend: 10+ permanents" },
  { key: "dayNight",     label: "Day / Night",      Icon: Moon,      color: "#8b5cf6", desc: "Transform day/night cards" },
  // "tokens" removed — tokens are now per-player toggles, not a global mechanic
];

// parseSavedPlayer is imported from src/utils/playerUtils.ts so it can be
// unit-tested independently without pulling in the full React component tree.

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
    tokens: { treasure: 0, food: 0, clue: 0, blood: 0, rad: 0 },
    enabledTokens: [],
    tokensOpen: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LifeCounterProps {
  userId?: string;                   // current auth user — passed from App.tsx
  /** When starting a Game Night session, App.tsx sets this to the lobby player
   *  list so LifeCounter can initialize the grid from it. The component key is
   *  bumped alongside this prop so the lazy useState initializer runs fresh. */
  mpInitLobbyPlayers?: LobbyPlayer[];
  mpInitFirstPlayer?:  string;       // spin winner — shown with the ⭐ badge briefly
}

export const LifeCounter: React.FC<LifeCounterProps> = ({
  userId,
  mpInitLobbyPlayers,
  mpInitFirstPlayer,
}) => {
  const { showToast } = useToast();

  // ── State ──
  const [startingLife, setStartingLifeState] = useState<number>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.STARTING_LIFE);
    return s ? parseInt(s, 10) : DEFAULT_LIFE;
  });

  const [wakeLockEnabled, setWakeLockEnabled] = useState<boolean>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.WAKE_LOCK);
    return s !== "false"; // Default to true unless explicitly disabled
  });

  useWakeLock(wakeLockEnabled);

  const [playerCount, setPlayerCount] = useState<number>(() => {
    if (mpInitLobbyPlayers && mpInitLobbyPlayers.length > 0) return mpInitLobbyPlayers.length;
    const s = localStorage.getItem(STORAGE_KEYS.PLAYER_COUNT);
    return s ? parseInt(s, 10) : 4;
  });

  const [history, setHistory] = useState<string[]>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.LIFE_HISTORY);
    if (s) { try { return JSON.parse(s); } catch { /* corrupt localStorage — use default */ } }
    return [`Game started with ${DEFAULT_LIFE} Life!`];
  });

  const [activeCounters, setActiveCounters] = useState<ActiveCounters>(() => {
    const defaults: ActiveCounters = { monarch: false, poison: false, dayNight: false, initiative: false, cityBlessing: false, tokens: false };
    const s = localStorage.getItem(STORAGE_KEYS.ACTIVE_COUNTERS);
    if (s) { try { return { ...defaults, ...JSON.parse(s) }; } catch { /* corrupt localStorage — use defaults */ } }
    return defaults;
  });

  const [dayNightState, setDayNightState] = useState<DayNightState>(() => {
    return (localStorage.getItem(STORAGE_KEYS.DAY_NIGHT) as DayNightState) || "none";
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    const sl = parseInt(localStorage.getItem(STORAGE_KEYS.STARTING_LIFE) || String(DEFAULT_LIFE), 10);

    // ── Multiplayer lobby init (only when lobby data is fresh — i.e. no matching saved game) ──
    if (mpInitLobbyPlayers && mpInitLobbyPlayers.length > 0) {
      // If localStorage already has a saved game with the same player count,
      // that means this is a tab-switch remount mid-game — use the live state.
      const saved = localStorage.getItem(STORAGE_KEYS.PLAYERS);
      if (saved) {
        try {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr) && arr.length === mpInitLobbyPlayers.length) {
            return arr.map(p => parseSavedPlayer(p, sl));
          }
        } catch { /* corrupt — fall through to lobby init */ }
      }
      // Fresh game start: initialize from lobby roster.
      const sorted = [...mpInitLobbyPlayers].sort((a, b) => a.colorName.localeCompare(b.colorName));
      return sorted.map((lp, i) => ({
        ...createPlayer(i, sl),
        name: lp.playerName,
        colorName: lp.colorName,
        commanderName: lp.commanderName || undefined,
        deckId: lp.deckId ?? undefined,
      }));
    }

    // ── Standard localStorage init ────────────────────────────────────────────
    const s = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    if (s) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && arr.length > 0) return arr.map(p => parseSavedPlayer(p, sl));
      } catch { /* corrupt localStorage — create fresh players */ }
    }
    const count = parseInt(localStorage.getItem(STORAGE_KEYS.PLAYER_COUNT) || "4", 10);
    return Array.from({ length: count }, (_, i) => createPlayer(i, sl));
  });

  const [activeDamageEditor, setActiveDamageEditor] = useState<number | null>(null);
  const [showCountersMenu, setShowCountersMenu] = useState(false);
  const [tokenPlayer, setTokenPlayer] = useState<number | null>(null);
  const [taxPlayer, setTaxPlayer] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Mobile breakpoint ──
  const isMobile = useMobile(768);

  // ── Saved decks (for SetCommanderModal "From My Decks" picker) ──
  const [savedDecks] = useState<SavedDeck[]>(() => loadDecks());

  // ── Modals ──
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);

  // ── Save-game modal + slots ──
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showEndGame, setShowEndGame] = useState(false);

  // Modals
  const [showResetConfirm, setShowResetConfirm] = useState(false);
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
  const {
    timerSeconds, timerRunning, timerMode, timerColor,
    formatTime, toggleTimer, resetTimer, setTimerMode,
  } = useGameTimer();

  // ── firstPlayerName (lobby spin winner — read-only echo of mpInitFirstPlayer) ──
  const firstPlayerName: string | null = mpInitFirstPlayer ?? null;

  // ── Turn tracker: flash the first player's border + show a banner for 3 s ──
  const [activePlayerIndex] = useState<number>(() => {
    if (mpInitFirstPlayer && players.length > 0) {
      const idx = players.findIndex(p => p.name === mpInitFirstPlayer);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  // showFirstFlash drives both the purple border and the "goes first" banner.
  // Auto-clears after 3 s; starts false when no first-player was set (non-lobby game).
  const [showFirstFlash, setShowFirstFlash] = useState<boolean>(!!mpInitFirstPlayer);
  useEffect(() => {
    if (!mpInitFirstPlayer) return;
    const t = setTimeout(() => setShowFirstFlash(false), 3_000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Seat ownership: which player index is "me" on this device ──
  const [myPlayerIndex] = useState<number | null>(() => {
    const s = localStorage.getItem(STORAGE_KEYS.MY_PLAYER_INDEX);
    return s !== null ? parseInt(s, 10) : null;
  });



  // ── Multiplayer (extracted into useMultiplayer hook) ──
  const {
    roomCode, roomConnected, roomRole, roomName, setRoomName,
    joinCodeInput, setJoinCodeInput, roomLoading, roomCopied,
    roomError, roomReconnecting,
    scheduleBroadcast, handleCreateRoom, handleJoinRoom, handleLeaveRoom, copyRoomCode,
  } = useMultiplayer({
    players, activeCounters, dayNightState, startingLife,
    onRemotePlayers:  setPlayers,
    onRemoteCounters: setActiveCounters,
    onRemoteDayNight: setDayNightState,
  });

  // ── Persistence ──
  const setPlayerNames = useAppStore(s => s.setPlayerNames);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    localStorage.setItem(STORAGE_KEYS.PLAYER_COUNT, playerCount.toString());
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAMES, JSON.stringify(players.map(p => p.name)));
    setPlayerNames(players.map(p => p.name));
  }, [players, playerCount, setPlayerNames]);

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.LIFE_HISTORY, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.ACTIVE_COUNTERS, JSON.stringify(activeCounters)); }, [activeCounters]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.STARTING_LIFE, startingLife.toString()); }, [startingLife]);
  useEffect(() => {
    if (dayNightState !== "none") localStorage.setItem(STORAGE_KEYS.DAY_NIGHT, dayNightState);
    else localStorage.removeItem(STORAGE_KEYS.DAY_NIGHT);
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

  const resetGame = () => setShowResetConfirm(true);

  /** Shared reset logic used by both "End & Record" confirm and "Skip & Reset". */
  const doReset = (recorded: boolean) => {
    scheduleBroadcast();
    setPlayers(prev => prev.map(p => ({
      ...p, life: startingLife, tax: 0, taxPartner: 0,
      commanderDamage: {}, isMonarch: false, hasInitiative: false,
      cityBlessing: false, poison: 0, rad: 0,
      tokens: { treasure: 0, food: 0, clue: 0, blood: 0, rad: 0 },
    })));
    setHistory([`Game reset! ${recorded ? "(recorded to leaderboard) " : ""}All life set to ${startingLife}.`]);
  };

  /** Record the game to Supabase and then reset the board. */
  const handleEndGameConfirm = async (selectedPlayerId: number | null) => {
    // Capture players snapshot BEFORE doReset mutates state
    const playerSnapshot = players.slice();

    // Determine winner: sole survivor, or player with highest life
    const notDefeated = (p: Player) => {
      const cmdTaken = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
      return p.life > 0 && (p.poison ?? 0) < 10 && cmdTaken < 21;
    };
    const alive = playerSnapshot.filter(notDefeated);
    const winner = alive.length === 1 ? alive[0] : [...playerSnapshot].sort((a, b) => b.life - a.life)[0];

    if (isSupabaseConfigured && userId) {
      await recordGame({
        roomCode:        roomCode ?? undefined,
        playerCount:     playerSnapshot.length,
        startingLife,
        durationSeconds: timerSeconds,
        players: playerSnapshot.map(p => ({
          userId:        p.id === selectedPlayerId ? userId : undefined,
          playerName:    p.name,
          finalLife:     p.life,
          isWinner:      p.id === winner?.id && notDefeated(winner),
          commanderName: p.commanderName,
        })),
      });
      showToast("Game recorded to leaderboard! 🏆", "success");
    }

    // Record per-deck win/loss for any player slot that has a deckId
    for (const p of playerSnapshot) {
      if (p.deckId) {
        recordDeckResult(p.deckId, p.id === winner?.id && notDefeated(winner));
      }
    }

    // Fix D: delete the DB snapshot now that the game is truly over.
    // IMPORTANT: only called here — NOT in handleLeaveRoom.
    // Leaving a room disconnects a device; ending the game resets the board.
    if (roomCode) {
      clearPersistedState(roomCode).catch(() => { /* non-critical */ });
    }

    setShowEndGame(false);
    doReset(Boolean(isSupabaseConfigured && userId));
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

  const renamePlayer = (playerId: number, name: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name: name || `Player ${playerId}` } : p));
  };

  const setPlayerCommander = (playerId: number, commanderName: string, deckId?: string) => {
    scheduleBroadcast();
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, commanderName: commanderName || undefined, deckId: deckId ?? p.deckId } : p
    ));
  };

  const clearPlayerCommander = (playerId: number) => {
    scheduleBroadcast();
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, commanderName: undefined, deckId: undefined } : p
    ));
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
    setPlayers(prev => prev.map(p => p.id !== playerId ? p : { ...p, cityBlessing: !player.cityBlessing }));
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




  const getGridStyle = () => {
    if (isMobile) {
      // 1-column for duels (full-width cards), 2-column for 3+ players
      return playerCount <= 2
        ? { gridTemplateColumns: "1fr" }
        : { gridTemplateColumns: "1fr 1fr" };
    }
    if (playerCount <= 4) return { gridTemplateColumns: "1fr 1fr" };
    if (playerCount <= 6) return { gridTemplateColumns: "1fr 1fr 1fr" };
    return { gridTemplateColumns: "1fr 1fr 1fr 1fr" };
  };

  const hasAnyActive = Object.values(activeCounters).some(Boolean);
  const activeCount  = Object.values(activeCounters).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", gap: "16px", height: "calc(100dvh - 48px)", overflow: "hidden" }}>

      {/* ── Screen-reader announcements for room status changes (aria-live) ── */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
      >
        {roomReconnecting ? "Reconnecting to room…"
          : roomConnected && roomCode ? `Connected to room ${roomCode}`
          : ""}
      </div>

      {/* ── Main Column ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden", minWidth: 0 }}>

        {/* ── Title Row (always visible) ── */}
        <div style={{ display: "flex", alignItems: "center", paddingBottom: "8px", borderBottom: showControlsModal ? "1px solid var(--border-color)" : "none", flexShrink: 0, gap: "8px" }}>
          {/* Heading — takes remaining space */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <Users size={20} color="var(--accent-purple)" />
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.1 }}>Life Counter</h2>
              {!showControlsModal && <p style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>Commander &amp; variant formats</p>}
            </div>
          </div>

          {/* Live / Reconnecting badge — shown when multiplayer is active */}
          {roomConnected && roomCode && (
            <div style={{
              display: "flex", alignItems: "center", gap: "4px",
              background: roomReconnecting ? "rgba(234,179,8,0.1)" : "rgba(16,185,129,0.1)",
              border: `1px solid ${roomReconnecting ? "rgba(234,179,8,0.3)" : "rgba(16,185,129,0.25)"}`,
              borderRadius: "20px", padding: "3px 8px", flexShrink: 0,
              transition: "all 0.3s ease",
            }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: roomReconnecting ? "var(--accent-gold)" : "var(--accent-emerald)",
                animation: "pulse-glow 1.5s infinite",
              }} />
              <span style={{
                fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.5px",
                color: roomReconnecting ? "var(--accent-gold)" : "var(--accent-emerald)",
              }}>
                {roomReconnecting ? "Reconnecting…" : roomCode}
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
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {/* AI Judge (Top Bar) - Only show if > 2 players */}
            {players.length > 2 && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-ai-judge"))}
                aria-label="Ask AI Judge"
                title="Ask AI Judge"
                className="touch-icon-btn"
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px", padding: "7px 10px",
                  color: "var(--accent-purple)",
                  cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
                  transition: "all 0.15s ease", flexShrink: 0,
                }}
              >
                <Scale size={14} />
              </button>
            )}

            {/* History & Undo button */}
            <button
              onClick={() => setShowHistoryModal(true)}
              aria-label="Game History & Undo"
              title="Game History & Undo"
              className="touch-icon-btn"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px", padding: "7px 10px",
                color: "var(--accent-cyan)",
                cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
                transition: "all 0.15s ease", flexShrink: 0,
              }}
            >
              <History size={14} />
            </button>

            {/* Controls toggle — hamburger */}
            <button
              onClick={() => setShowControlsModal(true)}
              aria-label="Game Settings"
              title="Game Settings"
              className="touch-icon-btn"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px", padding: "7px 10px",
                color: "var(--text-secondary)",
                cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
                transition: "all 0.15s ease", flexShrink: 0,
              }}
            >
              <Menu size={14} />
            </button>
          </div>
        </div>

        {/* ── Modals for Settings and History ── */}
        {showHistoryModal && (
          <HistoryModal
            history={history}
            onUndo={() => { handleUndo(); setShowHistoryModal(false); }}
            canUndo={undoStack.length > 0}
            onClose={() => setShowHistoryModal(false)}
          />
        )}

        {showControlsModal && (
          <BottomSheet onClose={() => setShowControlsModal(false)} zIndex={300} padding="24px" maxWidth="500px">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", color: "var(--text-primary)" }}>
              <div style={{ background: "rgba(255,255,255,0.1)", padding: "8px", borderRadius: "12px", display: "flex" }}>
                <Settings2 size={24} color="var(--text-secondary)" />
              </div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>Game Setup</h2>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

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
                {[2, 3, 4, 5, 6].map(num => (
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

                    <div style={{ width: "100%", height: "1px", background: "var(--border-color)", margin: "4px 0" }} />

                    <button
                      onClick={() => {
                        const next = !wakeLockEnabled;
                        setWakeLockEnabled(next);
                        localStorage.setItem(STORAGE_KEYS.WAKE_LOCK, String(next));
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: wakeLockEnabled ? "rgba(16,185,129,0.1)" : "transparent",
                        border: `1px solid ${wakeLockEnabled ? "rgba(16,185,129,0.25)" : "transparent"}`,
                        color: "#fff", cursor: "pointer",
                        padding: "8px 10px", borderRadius: "9px", textAlign: "left",
                        transition: "all 0.15s ease", width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "8px",
                          background: wakeLockEnabled ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <Moon size={15} color={wakeLockEnabled ? "#10b981" : "var(--text-muted)"} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.87rem", fontWeight: 600, color: wakeLockEnabled ? "#fff" : "var(--text-secondary)" }}>Keep Screen Awake</div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Prevents phone from locking</div>
                        </div>
                      </div>
                      {wakeLockEnabled && <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />}
                    </button>
                  </div>
                )}
              </div>



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

              {/* End & Record — opens EndGameModal */}
              <button
                onClick={() => setShowEndGame(true)}
                className="glass-button"
                title="Record this game to the leaderboard, then reset"
                style={{ padding: "7px 13px", fontSize: "0.82rem", background: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.25)" }}
              >
                <Trophy size={14} color="var(--accent-purple)" />
                <span>End &amp; Record</span>
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
                roomError.toLowerCase().includes("reconnect") ? (
                  // "Tap to reconnect" — make the whole message a real tap target
                  <button
                    onClick={() => handleJoinRoom(roomCode ?? undefined)}
                    style={{
                      fontSize: "0.75rem", color: "var(--accent-rose)", fontWeight: 600,
                      background: "rgba(244,63,94,0.10)",
                      border: "1px solid rgba(244,63,94,0.3)",
                      borderRadius: "8px", padding: "4px 10px",
                      cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: "4px",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(244,63,94,0.18)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(244,63,94,0.10)"}
                  >
                    ⚠️ {roomError}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-rose)", fontWeight: 600 }}>
                    ⚠️ {roomError}
                  </span>
                )
              )}

              {!isSupabaseConfigured ? (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                  Configure Supabase in .env to enable live sync
                </span>
              ) : !roomConnected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 }}>
                  {/* Row 1: Room name + Create */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Room name (optional)"
                      value={roomName}
                      onChange={e => setRoomName(e.target.value.slice(0, 24))}
                      style={{ flex: 1, minWidth: 0, padding: "5px 9px", fontSize: "0.75rem" }}
                    />
                    <button
                      onClick={handleCreateRoom}
                      disabled={roomLoading}
                      className="glass-button"
                      style={{ flexShrink: 0, padding: "6px 12px", fontSize: "0.8rem", background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)" }}
                    >
                      <Wifi size={13} color="var(--accent-purple)" />
                      <span>{roomLoading ? "Connecting…" : "Create Room"}</span>
                    </button>
                  </div>
                  {/* Row 2: Room code + Join */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="Room code…"
                      value={joinCodeInput}
                      onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                      onKeyDown={e => { if (e.key === "Enter") handleJoinRoom(); }}
                      autoCapitalize="characters"
                      inputMode="text"
                      spellCheck={false}
                      autoCorrect="off"
                      style={{ flex: 1, minWidth: 0, padding: "6px 10px", fontSize: "0.8rem", letterSpacing: "1px", fontWeight: 700 }}
                    />
                    <button
                      onClick={() => handleJoinRoom()}
                      disabled={joinCodeInput.trim().length < 4 || roomLoading}
                      className="glass-button"
                      style={{ flexShrink: 0, padding: "6px 10px", fontSize: "0.8rem" }}
                    >
                      Join
                    </button>
                  </div>
                </div>
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
          </BottomSheet>
        )}

        {/* Day / Night Global Banner */}
        {activeCounters.dayNight && dayNightState !== "none" && (
          <DayNightBanner
            state={dayNightState as "day" | "night"}
            onCycle={cycleDayNight}
          />
        )}

        {/* ── "Goes First" flash banner — shows for 3 s on game start, then fades ── */}
        {showFirstFlash && firstPlayerName && (
          <div className="first-player-flash" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            padding: "10px 28px", borderRadius: "10px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.10) 100%)",
            border: "1px solid rgba(139,92,246,0.35)",
          }}>
            <span style={{ fontSize: "1.1rem" }}>⭐</span>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              <span style={{ color: "var(--accent-purple)" }}>{firstPlayerName}</span>
              {" "}goes first!
            </span>
            <span style={{ fontSize: "1.1rem" }}>⭐</span>
          </div>
        )}

        {/* ── Table Center (Monarch / Initiative) ── */}
        <TableCenter
          players={players}
          assignMonarch={assignMonarch}
          releaseMonarch={releaseMonarch}
          assignInitiative={assignInitiative}
          releaseInitiative={releaseInitiative}
          hasMonarchMechanic={activeCounters.monarch}
          hasInitiativeMechanic={activeCounters.initiative}
        />

        {/* ── Player Grid ── */}
        <div className="life-counter-player-grid" style={{ flex: 1, display: "grid", gap: "12px", ...getGridStyle(), minHeight: 0, overflow: "hidden" }}>
          {players.map((p, idx) => {
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
                renamePlayer={renamePlayer}
                setAvatar={setAvatar}
                toggleCityBlessing={toggleCityBlessing}
                togglePlayerTokensPanel={setTokenPlayer}
                togglePlayerTaxPanel={setTaxPlayer}
                setActiveDamageEditor={setActiveDamageEditor}
                revivePlayer={revivePlayer}
                isFirst={firstPlayerName !== null && p.name === firstPlayerName}
                isActiveTurn={showFirstFlash && idx === activePlayerIndex}
                isLocalPlayer={myPlayerIndex === null || idx === myPlayerIndex}
                commanderName={p.commanderName}
                onSetCommander={setPlayerCommander}
                onClearCommander={clearPlayerCommander}
                savedDecks={savedDecks}
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

      {/* ── End Game & Record Modal ── */}
      {showEndGame && (
        <EndGameModal
          players={players}
          startingLife={startingLife}
          timerSeconds={timerSeconds}
          isSupabaseConfigured={isSupabaseConfigured}
          onConfirm={handleEndGameConfirm}
          onSkip={() => { setShowEndGame(false); doReset(false); }}
          onCancel={() => setShowEndGame(false)}
        />
      )}

      {/* ── Reset Confirm ── replaces window.confirm() for iOS PWA compatibility */}
      {showResetConfirm && (
        <BottomSheet onClose={() => setShowResetConfirm(false)} zIndex={300} maxWidth="380px" padding="24px">
          <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 600 }}>Reset Game?</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            All players will be set back to {startingLife} life and counters cleared. This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="glass-button"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowResetConfirm(false); doReset(false); }}
              className="glass-button"
              style={{ flex: 1, background: "rgba(244,63,94,0.1)", borderColor: "rgba(244,63,94,0.25)", color: "#f43f5e" }}
            >
              Reset
            </button>
          </div>
        </BottomSheet>
      )}

      {tokenPlayer !== null && (
        <TokenModal
          targetPlayerId={tokenPlayer}
          players={players}
          onClose={() => setTokenPlayer(null)}
          adjustToken={adjustToken}
        />
      )}

      {taxPlayer !== null && (
        <TaxModal
          targetPlayerId={taxPlayer}
          players={players}
          onClose={() => setTaxPlayer(null)}
          adjustTax={adjustTax}
          togglePartner={togglePartner}
        />
      )}

    </div>
  );
};
