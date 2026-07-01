import React, { useState, useEffect, useRef } from "react";
import { History, Menu, Settings2, Check, Moon, Save, Trophy, RefreshCw, Wifi, Scale, WifiOff, Copy, Timer, Square, Play, Pause, SkipForward, Crown, Swords, Star, Undo2, X, BookOpen, Home, Dices, Handshake, RotateCcw, XCircle } from "lucide-react";
import type { TabId } from "../constants/tabIds";
import { useGameTimer } from "../hooks/useGameTimer";
import { loadDecks, recordDeckResult } from "../services/decks";
import type { SavedDeck } from "../types/deck";
import { useAppStore } from "../store/useAppStore";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { clearPersistedState } from "../services/multiplayerSync";
import type { Player, ActiveCounters, DayNightState, TokenKey, LobbyPlayer } from "../types/game";
import { isSupabaseConfigured } from "../services/supabase";
import { HistoryModal } from "./life-counter/HistoryModal";
import { SaveGameModal, MAX_SLOTS } from "./life-counter/SaveGameModal";
import type { GameSnapshot } from "./life-counter/SaveGameModal";
import { TokenModal } from "./life-counter/TokenModal";
import { PlayerProfileModal } from "./life-counter/PlayerProfileModal";
import { CommanderHubModal } from "./life-counter/CommanderHubModal";
import { EndGameModal } from "./life-counter/EndGameModal";
import { PlayerCard } from "./life-counter/PlayerCard";
import { TableView } from "./life-counter/TableView";
import { GameProvider } from "./life-counter/GameContext";
import type { HubTab } from "./life-counter/GameContext";
import { DayNightBanner } from "./life-counter/DayNightBanner";
import { TableCenter } from "./life-counter/TableCenter";
import { useWakeLock } from "../hooks/useWakeLock";
import { recordGame } from "../services/leaderboard";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { parseSavedPlayer } from "../utils/playerUtils";
import { getDeviceId } from "../services/auth";
import { useToast } from "../components/Toast";
import { BottomSheet } from "../components/BottomSheet";
import { track } from "../services/analytics";
import { DiceAndCoins } from "./DiceAndCoins";
import { DiceQuickAccess } from "../components/DiceQuickAccess";
import { useDiceActions } from "../hooks/useDiceActions";

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

const MECHANICS_CONFIG: { key: keyof ActiveCounters; label: string; Icon: React.ElementType; color: string }[] = [
  { key: "monarch",      label: "Monarch",         Icon: Crown,  color: "#eab308" },
  { key: "initiative",   label: "Initiative",      Icon: Swords, color: "#06b6d4" },
  { key: "cityBlessing", label: "City's Blessing", Icon: Star,   color: "#eab308" },
  { key: "dayNight",     label: "Day / Night",     Icon: Moon,   color: "#8b5cf6" },
  // Poison removed — tracked per-player via the token panel
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
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    storm: 0,
    energy: 0,
    experience: 0,
    generic: 0,
    ringLevel: 0,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LifeCounterProps {
  userId?: string;
  mpInitLobbyPlayers?: LobbyPlayer[];
  mpInitFirstPlayer?:  string;
  onLobbyConsumed?:    () => void;
  onEnterFullscreen?:  () => void;   // called on mount — tells App.tsx to go fullscreen
  onExitFullscreen?:   () => void;   // called on unmount
  onNavigate?:         (tab: TabId) => void; // navigate from hub menu
}

export const LifeCounter: React.FC<LifeCounterProps> = ({
  userId,
  mpInitLobbyPlayers,
  mpInitFirstPlayer,
  onLobbyConsumed,
  onEnterFullscreen,
  onExitFullscreen,
  onNavigate,
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

  const [layoutMode, setLayoutMode] = useState<'scorekeeper' | 'table'>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.LAYOUT_MODE);
    if (stored === 'scorekeeper' || stored === 'table') return stored;
    return 'table';
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
            // Tab-switch remount: use saved state but ensure MY_PLAYER_INDEX is set
            const sorted2 = [...mpInitLobbyPlayers].sort((a, b) => a.colorName.localeCompare(b.colorName));
            const myIdx2 = sorted2.findIndex(lp => lp.deviceId === getDeviceId());
            if (myIdx2 >= 0) localStorage.setItem(STORAGE_KEYS.MY_PLAYER_INDEX, String(myIdx2));
            return arr.map(p => parseSavedPlayer(p, sl));
          }
        } catch { /* corrupt — fall through to lobby init */ }
      }
      // Fresh game start: initialize from lobby roster.
      const sorted = [...mpInitLobbyPlayers].sort((a, b) => a.colorName.localeCompare(b.colorName));
      // Record which player seat belongs to this device so TableView knows "my card"
      const myIdx = sorted.findIndex(lp => lp.deviceId === getDeviceId());
      if (myIdx >= 0) localStorage.setItem(STORAGE_KEYS.MY_PLAYER_INDEX, String(myIdx));
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

  // Signal back to App.tsx that the lobby data has been consumed into local state
  useEffect(() => {
    if (mpInitLobbyPlayers && mpInitLobbyPlayers.length > 0) {
      onLobbyConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tokenPlayer, setTokenPlayer] = useState<number | null>(null);
  const [hubPlayer, setHubPlayer] = useState<number | null>(null);
  const [hubInitialTab, setHubInitialTab] = useState<HubTab>("commander");
  const [setupPlayer, setSetupPlayer] = useState<number | null>(null);


  // ── Saved decks (for SetCommanderModal "From My Decks" picker) ──
  const [savedDecks] = useState<SavedDeck[]>(() => loadDecks());

  // ── Modals ──
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);

  // ── Save-game modal + slots ──
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showEndGame, setShowEndGame] = useState(false);

  // Modals
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetWinnerChoice, setResetWinnerChoice] = useState<number | "draw" | null>(null);
  const [showHomeConfirm,  setShowHomeConfirm]  = useState(false);
  const [showDiceModal,    setShowDiceModal]    = useState(false);
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

  // ── Turn timer ──
  const [turnTimerEnabled, setTurnTimerEnabled] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEYS.TURN_TIMER_ENABLED) === "true"
  );
  const [turnTimerDuration, setTurnTimerDuration] = useState<number>(
    () => parseInt(localStorage.getItem(STORAGE_KEYS.TURN_TIMER_DURATION) || "180", 10)
  );
  const [turnTimerRemaining, setTurnTimerRemaining] = useState<number>(
    () => parseInt(localStorage.getItem(STORAGE_KEYS.TURN_TIMER_DURATION) || "180", 10)
  );
  const [turnTimerRunning, setTurnTimerRunning] = useState(false);
  const turnTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


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

  // ── Dice & Misc: shared roll/flip/randomize state for the modal + quick-access popup ──
  const diceActions = useDiceActions(players, myPlayerIndex);
  const [showDiceQuickAccess, setShowDiceQuickAccess] = useState(false);
  const diceLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceLongPressFiredRef = useRef(false);
  const handleDicePointerDown = () => {
    diceLongPressFiredRef.current = false;
    diceLongPressTimerRef.current = setTimeout(() => {
      diceLongPressFiredRef.current = true;
      setShowDiceQuickAccess(true);
    }, 450);
  };
  const handleDicePointerUp = () => {
    if (diceLongPressTimerRef.current) clearTimeout(diceLongPressTimerRef.current);
  };
  const handleDiceClick = () => {
    if (diceLongPressFiredRef.current) {
      diceLongPressFiredRef.current = false;
      return;
    }
    setShowDiceModal(true);
  };



  // ── Multiplayer (extracted into useMultiplayer hook) ──
  const [showEndForAll, setShowEndForAll] = useState(false);

  const {
    roomCode, roomConnected, roomRole, roomName, setRoomName,
    joinCodeInput, setJoinCodeInput, roomLoading, roomCopied,
    roomError, roomReconnecting, heartbeatTimes,
    scheduleBroadcast, handleCreateRoom, handleJoinRoom, handleLeaveRoom,
    handleHostEndGame, copyRoomCode,
  } = useMultiplayer({
    players, activeCounters, dayNightState, startingLife,
    onRemotePlayers:  setPlayers,
    onRemoteCounters: setActiveCounters,
    onRemoteDayNight: setDayNightState,
    onHostEndedGame: () => {
      localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX);
      handleLeaveRoom();
      doReset(Boolean(isSupabaseConfigured && userId));
    },
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
    if (roomCode) {
      // Multiplayer: only restore the local player's data so we don't overwrite
      // life changes other players made after this snapshot was taken.
      const myIdx = parseInt(localStorage.getItem(STORAGE_KEYS.MY_PLAYER_INDEX) ?? "-1", 10);
      if (myIdx >= 0) {
        setPlayers(prev => prev.map((p, i) => i === myIdx ? (last[myIdx] ?? p) : p));
      } else {
        setPlayers(last);
      }
    } else {
      setPlayers(last);
    }
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

  // ── Fullscreen enter/exit ──
  useEffect(() => {
    onEnterFullscreen?.();
    return () => onExitFullscreen?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Turn timer countdown ──
  useEffect(() => {
    if (!turnTimerRunning) {
      if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current);
      return;
    }
    turnTimerIntervalRef.current = setInterval(() => {
      setTurnTimerRemaining(prev => {
        if (prev <= 1) {
          setTurnTimerRunning(false);
          navigator.vibrate?.([200, 100, 200]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current);
    };
  }, [turnTimerRunning]);


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

  const resetGame = () => { setResetWinnerChoice(null); setShowResetConfirm(true); };

  /** Shared reset logic used by both "End & Record" confirm and "Skip & Reset". */
  const doReset = (recorded: boolean) => {
    scheduleBroadcast();
    const winnerName = resetWinnerChoice === "draw" ? null
      : resetWinnerChoice !== null ? players.find(p => p.id === resetWinnerChoice)?.name ?? null
      : null;
    setPlayers(prev => prev.map(p => ({
      ...p, life: startingLife, tax: 0, taxPartner: 0,
      commanderDamage: {}, isMonarch: false, hasInitiative: false,
      cityBlessing: false, poison: 0, rad: 0,
      tokens: { treasure: 0, food: 0, clue: 0, blood: 0, rad: 0 },
    })));
    const outcome = resetWinnerChoice === "draw" ? " Result: Draw." : winnerName ? ` ${winnerName} won.` : "";
    setHistory([`Game reset!${outcome} ${recorded ? "(recorded to leaderboard) " : ""}All life set to ${startingLife}.`]);
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

    track("game_ended", { player_count: playerSnapshot.length, duration_seconds: timerSeconds });

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
      track("game_recorded");
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

    localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX);
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
      p.id === playerId ? { ...p, commanderName: undefined, partnerCommanderName: undefined, deckId: undefined, artOffsetX: undefined, artOffsetY: undefined, artZoom: undefined, artUsePartner: undefined } : p
    ));
  };

  const setPartnerCommander = (playerId: number, name: string) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, partnerCommanderName: name || undefined } : p
    ));
  };

  const clearPartnerCommander = (playerId: number) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, partnerCommanderName: undefined, artUsePartner: undefined } : p
    ));
  };


  const updatePlayerArt = (playerId: number, x: number, y: number, zoom: number | undefined) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, artOffsetX: x, artOffsetY: y, artZoom: zoom } : p
    ));
  };

  const setPlayerArtSource = (playerId: number, usePartner: boolean) => {
    setPlayers(prev => prev.map(p =>
      p.id === playerId ? { ...p, artUsePartner: usePartner } : p
    ));
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

  const adjustMana = (playerId: number, color: import("../types/game").ManaKey, delta: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      return { ...p, mana: { ...p.mana, [color]: Math.max(0, (p.mana?.[color] ?? 0) + delta) } };
    }));
  };

  const adjustStorm = (playerId: number, delta: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      return { ...p, storm: Math.max(0, (p.storm ?? 0) + delta) };
    }));
  };

  const clearMana = (playerId: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      return { ...p, mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, storm: 0 };
    }));
  };

  type CounterKey = "generic" | "energy" | "poison" | "experience" | "ringLevel" | "storm" | "rad";

  const adjustCounter = (playerId: number, key: CounterKey, delta: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const maxVals: Partial<Record<CounterKey, number>> = { poison: 10, ringLevel: 4 };
      const max = maxVals[key];
      if (key === "rad") {
        return { ...p, rad: Math.min(max ?? 999, Math.max(0, (p.rad ?? 0) + delta)) };
      }
      const current = (p as unknown as Record<string, number>)[key] ?? 0;
      return { ...p, [key]: Math.min(max ?? 999, Math.max(0, current + delta)) };
    }));
  };

  const clearCounters = (playerId: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      return { ...p, poison: 0, rad: 0, energy: 0, experience: 0, generic: 0, storm: 0, ringLevel: 0, isMonarch: false, hasInitiative: false, cityBlessing: false };
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




  // ── Turn timer helpers ──
  const formatTurnTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const resetTurnTimer = () => {
    setTurnTimerRemaining(turnTimerDuration);
    setTurnTimerRunning(false);
  };


  // ── Dynamic layout SVG previews ──
  const FILL_ACTIVE = "#fff";
  const FILL_INACTIVE = "rgba(255,255,255,0.35)";

  // Scorekeeper icon: all cells same brightness — everyone faces the phone holder
  const getScorekeeperSvg = (n: number, fill: string): React.ReactNode => {
    const f = fill;
    if (n === 2) return (
      // 2P stacked: two full-width portrait cards, one above the other
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="2" y="1" width="22" height="9" rx="2" fill={f} opacity="0.55" />
        <rect x="2" y="12" width="22" height="9" rx="2" fill={f} />
      </svg>
    );
    if (n === 3) return (
      // 3P: 1 wide top (180°, dim) + hub + 2 bottom (270°/90°)
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="24" height="7" rx="2" fill={f} opacity="0.45" />
        <rect x="1" y="10" width="11" height="11" rx="2" fill={f} />
        <rect x="14" y="10" width="11" height="11" rx="2" fill={f} />
      </svg>
    );
    if (n === 4) return (
      // 4P: 1 wide top (180°, dim) + 2 middle (270°/90°) + hub + 1 wide bottom (0°)
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="24" height="5" rx="1.5" fill={f} opacity="0.45" />
        <rect x="1" y="8" width="11" height="5" rx="1.5" fill={f} />
        <rect x="14" y="8" width="11" height="5" rx="1.5" fill={f} />
        <rect x="1" y="15" width="24" height="6" rx="1.5" fill={f} />
      </svg>
    );
    if (n === 5) return (
      // 5P: 1 wide top (180°, dim) + hub + 2×2 grid (270°/90°)
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="24" height="5" rx="1.5" fill={f} opacity="0.45" />
        <rect x="1" y="8" width="11" height="6" rx="1.5" fill={f} />
        <rect x="14" y="8" width="11" height="6" rx="1.5" fill={f} />
        <rect x="1" y="16" width="11" height="5" rx="1.5" fill={f} />
        <rect x="14" y="16" width="11" height="5" rx="1.5" fill={f} />
      </svg>
    );
    // 6P: 1 wide top (180°, dim) + 2×2 middle + hub + 1 wide bottom (0°)
    return (
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="24" height="4" rx="1.5" fill={f} opacity="0.45" />
        <rect x="1" y="6" width="11" height="4" rx="1.5" fill={f} />
        <rect x="14" y="6" width="11" height="4" rx="1.5" fill={f} />
        <rect x="1" y="11" width="11" height="4" rx="1.5" fill={f} />
        <rect x="14" y="11" width="11" height="4" rx="1.5" fill={f} />
        <rect x="1" y="16" width="24" height="5" rx="1.5" fill={f} />
      </svg>
    );
  };

  // Table icon: top-row cells dimmer — those players face away (toward them), bottom-row cells bright (facing you)
  const getTableSvg = (n: number, fill: string): React.ReactNode => {
    const f = fill;
    const fDim = fill === FILL_ACTIVE ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)";
    if (n === 2) return (
      // 2P side-by-side: two tall portrait cards next to each other
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="11" height="20" rx="2" fill={f} />
        <rect x="14" y="1" width="11" height="20" rx="2" fill={fDim} />
      </svg>
    );
    if (n === 3) return (
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="11" height="9" rx="2" fill={fDim} />
        <rect x="14" y="1" width="11" height="9" rx="2" fill={fDim} />
        <rect x="1" y="12" width="24" height="9" rx="2" fill={f} />
      </svg>
    );
    if (n === 4) return (
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="11" height="9" rx="2" fill={fDim} />
        <rect x="14" y="1" width="11" height="9" rx="2" fill={fDim} />
        <rect x="1" y="12" width="11" height="9" rx="2" fill={f} />
        <rect x="14" y="12" width="11" height="9" rx="2" fill={f} />
      </svg>
    );
    if (n === 5) return (
      // 5P: 2×2 top (dim, rotated) + hub + 1 wide bottom (0°, normal)
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="14" y="1" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="1" y="8" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="14" y="8" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="1" y="15" width="24" height="6" rx="1.5" fill={f} />
      </svg>
    );
    // 6P: 2 dim rows + hub + 1 bright row (3×2 grid split by hub)
    return (
      <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
        <rect x="1" y="1" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="14" y="1" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="1" y="8" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="14" y="8" width="11" height="5" rx="1.5" fill={fDim} />
        <rect x="1" y="15" width="11" height="6" rx="1.5" fill={f} />
        <rect x="14" y="15" width="11" height="6" rx="1.5" fill={f} />
      </svg>
    );
  };




  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="life-counter-root" style={{ position: "relative", display: "flex", gap: "16px", overflow: "hidden" }}>

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

        {/* ── Title Row — hidden for all layouts (hub bar is in-grid for 2P–6P) ── */}
        {playerCount > 6 && <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: "8px", paddingBottom: "2px" }}>
          <div style={{ flex: 1 }} />

          {/* Live / Reconnecting badge — shown when multiplayer is active */}
          {roomConnected && roomCode && (
            roomReconnecting ? (
              <button
                onClick={handleLeaveRoom}
                title="Cancel reconnect and play offline"
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
                  borderRadius: "20px", padding: "3px 8px", cursor: "pointer", flexShrink: 0,
                }}
              >
                <div style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: "var(--accent-gold)", animation: "pulse-glow 1.5s infinite",
                }} />
                <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.5px", color: "var(--accent-gold)" }}>
                  Reconnecting…
                </span>
              </button>
            ) : (
              <div style={{
                display: "flex", alignItems: "center", gap: "4px",
                background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: "20px", padding: "3px 8px", flexShrink: 0,
              }}>
                <div style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: "var(--accent-emerald)", animation: "pulse-glow 1.5s infinite",
                }} />
                <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.5px", color: "var(--accent-emerald)" }}>
                  {roomCode}
                </span>
              </div>
            )
          )}


          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>

            {/* Quick undo button — always visible once there's something to undo */}
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                aria-label="Undo last action"
                title="Undo last action (Ctrl+Z)"
                className="touch-icon-btn"
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "color-mix(in srgb, var(--accent-purple) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
                  borderRadius: "8px", padding: "7px 10px",
                  color: "var(--accent-purple)",
                  cursor: "pointer", fontSize: "0.72rem", fontWeight: 600,
                  transition: "all 0.15s ease", flexShrink: 0,
                }}
              >
                <Undo2 size={14} />
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
                color: "var(--text-secondary)",
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
        </div>}

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
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowControlsModal(false)}
                aria-label="Close"
                style={{
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "50%", width: "32px", height: "32px", color: "#fff",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Tools */}
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginBottom: "20px" }}>
              <button
                onClick={() => { setShowControlsModal(false); setShowHomeConfirm(true); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Home size={22} color="var(--accent-purple)" />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Home</span>
              </button>
              <button
                onClick={() => { setShowControlsModal(false); window.dispatchEvent(new CustomEvent("open-codex")); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={22} color="var(--accent-cyan)" />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Card Codex</span>
              </button>
              <button
                onClick={() => { setShowControlsModal(false); setShowHistoryModal(true); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <History size={22} color="var(--accent-purple)" />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Game History</span>
              </button>
              <button
                onClick={() => { setShowControlsModal(false); resetGame(); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RotateCcw size={22} color="#ef4444" />
                </div>
                <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Restart</span>
              </button>
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

              {/* Layout Picker — hidden for 2P (always scorekeeper), icons adapt for 3P+ */}
              {playerCount > 2 && <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", whiteSpace: "nowrap" }}>Layout</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {([
                    { mode: 'scorekeeper' as const, label: 'Scorekeeper', desc: 'All cards face one direction — one person tracks everyone' },
                    { mode: 'table' as const,       label: 'Table',       desc: 'Top-row cards flip 180° — each player reads their own card' },
                  ]).map(({ mode, desc }) => {
                    const isActive = layoutMode === mode;
                    const fill = isActive ? FILL_ACTIVE : FILL_INACTIVE;
                    return (
                      <button
                        key={mode}
                        onClick={() => { setLayoutMode(mode); localStorage.setItem(STORAGE_KEYS.LAYOUT_MODE, mode); }}
                        title={desc}
                        style={{
                          width: "52px", height: "42px", borderRadius: "8px", cursor: "pointer",
                          background: isActive ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${isActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)"}`,
                          padding: "5px", display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {mode === 'scorekeeper'
                          ? getScorekeeperSvg(playerCount, fill)
                          : getTableSvg(playerCount, fill)
                        }
                      </button>
                    );
                  })}
                </div>
              </div>}

              {/* Turn Timer toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>Turn Timer</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Countdown per turn — pause/next visible on screen</div>
                </div>
                <button
                  onClick={() => { const next = !turnTimerEnabled; setTurnTimerEnabled(next); localStorage.setItem(STORAGE_KEYS.TURN_TIMER_ENABLED, String(next)); if (!next) { setTurnTimerRunning(false); resetTurnTimer(); } }}
                  style={{
                    width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer",
                    background: turnTimerEnabled ? "var(--accent-emerald)" : "rgba(255,255,255,0.15)",
                    position: "relative", transition: "background 0.2s ease", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: "3px", left: turnTimerEnabled ? "21px" : "3px",
                    width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s ease",
                  }} />
                </button>
              </div>

              {/* Turn timer duration picker (shown when enabled) */}
              {turnTimerEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>Per turn:</span>
                  {[60, 120, 180, 300, 420].map(secs => (
                    <button
                      key={secs}
                      onClick={() => { setTurnTimerDuration(secs); setTurnTimerRemaining(secs); setTurnTimerRunning(false); localStorage.setItem(STORAGE_KEYS.TURN_TIMER_DURATION, String(secs)); }}
                      style={{
                        background: turnTimerDuration === secs ? "var(--accent-emerald)" : "rgba(255,255,255,0.06)",
                        color: turnTimerDuration === secs ? "#fff" : "var(--text-secondary)",
                        border: "none", borderRadius: "6px", padding: "4px 10px",
                        fontWeight: 600, fontSize: "0.75rem", cursor: "pointer",
                      }}
                    >
                      {secs < 60 ? `${secs}s` : `${secs / 60}m`}
                    </button>
                  ))}
                </div>
              )}

              {/* Game Timer (in hub) */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.5px", textTransform: "uppercase" }}>Game Timer:</span>
                <button
                  onClick={() => { resetTimer(); setTimerMode(prev => prev === "up" ? "down" : "up"); }}
                  title={timerMode === "up" ? "Switch to countdown" : "Switch to count-up"}
                  style={{ background: "none", border: "none", cursor: "pointer", color: timerMode === "down" ? "var(--accent-purple)" : "var(--text-muted)", display: "flex", alignItems: "center", padding: "4px" }}
                >
                  <Timer size={13} />
                </button>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, fontFamily: "'Outfit', monospace", color: timerColor, minWidth: "46px" }}>
                  {formatTime(timerSeconds)}
                </span>
                <button
                  onClick={toggleTimer}
                  style={{ background: timerRunning ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${timerRunning ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: "6px", padding: "4px 8px", color: timerRunning ? "var(--accent-rose)" : "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  {timerRunning ? <Square size={11} /> : <Play size={11} />}
                </button>
                {roomConnected && roomCode && (
                  <button onClick={() => handleJoinRoom(roomCode)} title="Resync" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-cyan)", display: "flex", alignItems: "center", padding: "4px" }}>
                    <RefreshCw size={13} />
                  </button>
                )}
              </div>

              {/* Mechanics — inline chips, no dropdown */}
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px" }}>Mechanics</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {MECHANICS_CONFIG.map(({ key, label, Icon, color }) => {
                    const isActive = activeCounters[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleMechanic(key)}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "6px 12px", borderRadius: "20px", cursor: "pointer", border: "1px solid",
                          background: isActive ? `${color}20` : "rgba(255,255,255,0.04)",
                          borderColor: isActive ? `${color}60` : "rgba(255,255,255,0.1)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Icon size={13} color={isActive ? color : "var(--text-muted)"} />
                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: isActive ? "#fff" : "var(--text-secondary)" }}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keep Screen Awake */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>Keep Screen Awake</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Prevents phone from locking</div>
                </div>
                <button
                  onClick={() => { const next = !wakeLockEnabled; setWakeLockEnabled(next); localStorage.setItem(STORAGE_KEYS.WAKE_LOCK, String(next)); }}
                  style={{
                    width: "40px", height: "22px", borderRadius: "11px", border: "none", cursor: "pointer",
                    background: wakeLockEnabled ? "var(--accent-emerald)" : "rgba(255,255,255,0.15)",
                    position: "relative", transition: "background 0.2s ease", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: "3px", left: wakeLockEnabled ? "21px" : "3px",
                    width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s ease",
                  }} />
                </button>
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

              {/* End Game — shows summary then offers record to leaderboard */}
              <button
                onClick={() => { setShowControlsModal(false); setShowEndGame(true); }}
                className="glass-button"
                style={{ padding: "7px 13px", fontSize: "0.82rem", background: "color-mix(in srgb, var(--accent-purple) 8%, transparent)", borderColor: "color-mix(in srgb, var(--accent-purple) 25%, transparent)" }}
              >
                <Trophy size={14} color="var(--accent-purple)" />
                <span>End Game</span>
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
                      style={{ flexShrink: 0, padding: "6px 12px", fontSize: "0.8rem", background: "color-mix(in srgb, var(--accent-purple) 10%, transparent)", borderColor: "color-mix(in srgb, var(--accent-purple) 25%, transparent)" }}
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

                  {/* Host: End Game for All */}
                  {roomRole === "host" && (
                    showEndForAll ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>End for everyone? No stats recorded.</span>
                        <button
                          onClick={() => { setShowEndForAll(false); handleHostEndGame(); }}
                          className="glass-button"
                          style={{ padding: "4px 10px", fontSize: "0.78rem", background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" }}
                        >Confirm</button>
                        <button
                          onClick={() => setShowEndForAll(false)}
                          className="glass-button"
                          style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowEndForAll(true)}
                        className="glass-button"
                        style={{ padding: "6px 12px", fontSize: "0.8rem", background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.25)", color: "#f59e0b" }}
                      >
                        <span>End for All</span>
                      </button>
                    )
                  )}

                  {/* Leave */}
                  <button
                    onClick={() => { localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX); handleLeaveRoom(); }}
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
            background: "linear-gradient(135deg, color-mix(in srgb, var(--accent-purple) 18%, transparent) 0%, rgba(6,182,212,0.10) 100%)",
            border: "1px solid color-mix(in srgb, var(--accent-purple) 35%, transparent)",
          }}>
            <span style={{ fontSize: "1.1rem" }}>⭐</span>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              <span style={{ color: "var(--accent-purple)" }}>{firstPlayerName}</span>
              {" "}goes first!
            </span>
            <span style={{ fontSize: "1.1rem" }}>⭐</span>
          </div>
        )}

        {/* ── 2-Player Layout ── */}
        {playerCount === 2 ? (
          <GameProvider
            state={{ players, activeCounters, colors, savedDecks, playerCount, layoutMode }}
            actions={{
              adjustLife, adjustPoison, renamePlayer, toggleCityBlessing,
              togglePlayerTokensPanel: (id) => setTokenPlayer(id),
              openCommanderHub:        (id, tab) => { setHubPlayer(id); setHubInitialTab(tab ?? "commander"); },
              openPlayerSetup:         (id) => setSetupPlayer(id),
              revivePlayer,
              onSetCommander: setPlayerCommander, onClearCommander: clearPlayerCommander,
            }}
          >
            {/* Compact icon-only hub bar — reused in both 2P layouts */}
            {(() => {
              const hubBar = (
                <div style={{
                  flexShrink: 0, display: "flex", alignItems: "center",
                  gap: "4px", padding: "6px 12px",
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
                }}>
                  {/* Room badge + turn timer — left-aligned, only shown when active */}
                  {(roomConnected && roomCode) || turnTimerEnabled ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      {roomConnected && roomCode && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: "4px",
                          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                          borderRadius: "20px", padding: "3px 8px", marginRight: "4px",
                        }}>
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent-emerald)", animation: "pulse-glow 1.5s infinite" }} />
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--accent-emerald)" }}>{roomCode}</span>
                        </div>
                      )}
                      {turnTimerEnabled && (
                        <>
                          <span style={{
                            fontSize: "1rem", fontWeight: 900, fontFamily: "'Outfit', monospace",
                            color: turnTimerRemaining === 0 ? "#ef4444" : turnTimerRemaining < 30 ? "#f59e0b" : "#fff",
                            minWidth: "42px", textAlign: "center",
                          }}>{formatTurnTimer(turnTimerRemaining)}</span>
                          <button onClick={() => setTurnTimerRunning(r => !r)} style={{ background: "none", border: "none", cursor: "pointer", color: turnTimerRunning ? "#ef4444" : "var(--text-secondary)", padding: "6px", display: "flex" }}>
                            {turnTimerRunning ? <Pause size={16} /> : <Play size={16} />}
                          </button>
                          <button onClick={resetTurnTimer} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "6px", display: "flex" }}>
                            <SkipForward size={16} />
                          </button>
                          <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
                        </>
                      )}
                    </div>
                  ) : null}

                  {/* Nav icons */}
                  <div style={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "space-around" }}>
                    {/* Home */}
                    <button onClick={() => setShowHomeConfirm(true)} aria-label="Home" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}>
                      <Home size={20} />
                    </button>
                    {/* AI Judge */}
                    <button onClick={() => window.dispatchEvent(new CustomEvent("open-ai-judge"))} aria-label="AI Judge" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}>
                      <Scale size={20} />
                    </button>
                    {/* Settings hub */}
                    <button onClick={() => setShowControlsModal(true)} aria-label="Settings" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}>
                      <Menu size={20} />
                    </button>
                    {/* Dice — tap opens the full modal, hold opens quick access */}
                    <button
                      onClick={handleDiceClick}
                      onPointerDown={handleDicePointerDown}
                      onPointerUp={handleDicePointerUp}
                      onPointerLeave={handleDicePointerUp}
                      onPointerCancel={handleDicePointerUp}
                      aria-label="Dice & Misc (hold for quick access)"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}
                    >
                      <Dices size={20} />
                    </button>
                    {/* Restart */}
                    <button onClick={resetGame} aria-label="Restart Game" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}>
                      <RotateCcw size={20} />
                    </button>
                  </div>
                </div>
              );

              const cardProps = (idx: number) => ({
                p: players[idx],
                isFirst: firstPlayerName !== null && players[idx].name === firstPlayerName,
                isActiveTurn: showFirstFlash && idx === activePlayerIndex,
                isLocalPlayer: myPlayerIndex === null || idx === myPlayerIndex,
                lastHeartbeat: roomConnected ? heartbeatTimes.get(idx) : undefined,
              });

              // 2P: always stacked — top card (rotated 180°) → hub → bottom card (normal)
              return (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "6px", padding: "6px 10px" }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <PlayerCard {...cardProps(0)} rotate={true} />
                  </div>
                  {hubBar}
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <PlayerCard {...cardProps(1)} rotate={false} />
                  </div>
                </div>
              );
            })()}
          </GameProvider>
        ) : (
          /* ── 3P–6P Layout: orientation-aware, hub bar in-grid ── */
          <GameProvider
            state={{ players, activeCounters, colors, savedDecks, playerCount, layoutMode }}
            actions={{
              adjustLife, adjustPoison, renamePlayer, toggleCityBlessing,
              togglePlayerTokensPanel: (id) => setTokenPlayer(id),
              openCommanderHub:        (id, tab) => { setHubPlayer(id); setHubInitialTab(tab ?? "commander"); },
              openPlayerSetup:         (id) => setSetupPlayer(id),
              revivePlayer,
              onSetCommander: setPlayerCommander, onClearCommander: clearPlayerCommander,
            }}
          >
            {myPlayerIndex !== null ? (
              /* Online multiplayer — each device shows its own card view */
              <>
                <TableCenter
                  players={players}
                  assignMonarch={assignMonarch}
                  releaseMonarch={releaseMonarch}
                  assignInitiative={assignInitiative}
                  releaseInitiative={releaseInitiative}
                  hasMonarchMechanic={activeCounters.monarch}
                  hasInitiativeMechanic={activeCounters.initiative}
                />
                <TableView
                  players={players}
                  myIndex={myPlayerIndex}
                  heartbeatTimes={heartbeatTimes}
                  firstPlayerName={firstPlayerName}
                  showFirstFlash={showFirstFlash}
                  activePlayerIndex={activePlayerIndex}
                />
              </>
            ) : (() => {
              /* Local play — explicit rotation layouts for 3–6 players */

              /* Compact icon-only hub bar (shared across all player counts) */
              const hubBar = (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}>
                  {(roomConnected && roomCode) || turnTimerEnabled ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      {roomConnected && roomCode && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "20px", padding: "3px 8px", marginRight: "4px" }}>
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent-emerald)", animation: "pulse-glow 1.5s infinite" }} />
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--accent-emerald)" }}>{roomCode}</span>
                        </div>
                      )}
                      {turnTimerEnabled && (
                        <>
                          <span style={{ fontSize: "1rem", fontWeight: 900, fontFamily: "'Outfit', monospace", color: turnTimerRemaining === 0 ? "#ef4444" : turnTimerRemaining < 30 ? "#f59e0b" : "#fff", minWidth: "42px", textAlign: "center" }}>{formatTurnTimer(turnTimerRemaining)}</span>
                          <button onClick={() => setTurnTimerRunning(r => !r)} style={{ background: "none", border: "none", cursor: "pointer", color: turnTimerRunning ? "#ef4444" : "var(--text-secondary)", padding: "6px", display: "flex" }}>{turnTimerRunning ? <Pause size={16} /> : <Play size={16} />}</button>
                          <button onClick={resetTurnTimer} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "6px", display: "flex" }}><SkipForward size={16} /></button>
                          <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
                        </>
                      )}
                    </div>
                  ) : null}

                  {/* Nav icons */}
                  <div style={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "space-around" }}>
                    <button onClick={() => setShowHomeConfirm(true)} aria-label="Home" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}><Home size={20} /></button>
                    <button onClick={() => window.dispatchEvent(new CustomEvent("open-ai-judge"))} aria-label="AI Judge" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}><Scale size={20} /></button>
                    <button onClick={() => setShowControlsModal(true)} aria-label="Settings" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}><Menu size={20} /></button>
                    <button
                      onClick={handleDiceClick}
                      onPointerDown={handleDicePointerDown}
                      onPointerUp={handleDicePointerUp}
                      onPointerLeave={handleDicePointerUp}
                      onPointerCancel={handleDicePointerUp}
                      aria-label="Dice & Misc (hold for quick access)"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}
                    ><Dices size={20} /></button>
                    <button onClick={resetGame} aria-label="Restart Game" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "8px", display: "flex" }}><RotateCcw size={20} /></button>
                  </div>
                </div>
              );

              /* Rotation wrapper: fills parent cell properly for 90°/270° via container queries.
                 Also injects gridRotation so PlayerCard can counter-rotate its damage grid. */
              const rf = (deg: number, content: React.ReactNode): React.ReactNode => {
                const withRot = React.isValidElement(content)
                  ? React.cloneElement(content as React.ReactElement<{ gridRotation?: number }>, { gridRotation: deg })
                  : content;
                if (deg === 90 || deg === 270) return (
                  <div style={{ containerType: "size", width: "100%", height: "100%", position: "relative", overflow: "hidden" } as React.CSSProperties}>
                    <div style={{ position: "absolute", top: "50%", left: "50%", width: "100cqh", height: "100cqw", transform: `translate(-50%, -50%) rotate(${deg}deg)` } as React.CSSProperties}>
                      {withRot}
                    </div>
                  </div>
                );
                if (deg === 180) return <div style={{ width: "100%", height: "100%", transform: "rotate(180deg)" }}>{withRot}</div>;
                return <div style={{ width: "100%", height: "100%" }}>{withRot}</div>;
              };

              /* Card props for a given player index */
              const cp = (idx: number) => ({
                p: players[idx],
                isFirst: firstPlayerName !== null && players[idx].name === firstPlayerName,
                isActiveTurn: showFirstFlash && idx === activePlayerIndex,
                isLocalPlayer: true as const,
                lastHeartbeat: undefined as undefined,
              });

              /* Two side-by-side rotated cards (left=90°, right=270° — face outward) */
              const row2 = (L: number, R: number): React.ReactNode => (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0, gap: "4px" }}>
                  {rf(90, <PlayerCard {...cp(L)} />)}
                  {rf(270, <PlayerCard {...cp(R)} />)}
                </div>
              );

              /* ── 3P ──────────────────────────────────────────────────────────── */
              if (playerCount === 3) {
                return layoutMode === 'scorekeeper' ? (
                  /* scorekeeper: P[1](180°) + hub + [P[0](90°)|P[2](270°)] */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(180, <PlayerCard {...cp(1)} />)}</div>
                    {hubBar}
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0, gap: "4px" }}>
                      {rf(90, <PlayerCard {...cp(0)} />)}
                      {rf(270, <PlayerCard {...cp(2)} />)}
                    </div>
                  </div>
                ) : (
                  /* table: [P[1](90°)|P[2](270°)] + hub + P[0](0°) */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 0, gap: "4px" }}>
                      {rf(90, <PlayerCard {...cp(1)} />)}
                      {rf(270, <PlayerCard {...cp(2)} />)}
                    </div>
                    {hubBar}
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(0, <PlayerCard {...cp(0)} />)}</div>
                  </div>
                );
              }

              /* ── 4P ──────────────────────────────────────────────────────────── */
              if (playerCount === 4) {
                return layoutMode === 'table' ? (
                  /* table: [P[1](270°)|P[2](90°)] + hub + [P[0](270°)|P[3](90°)] */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    {row2(1, 2)}
                    {hubBar}
                    {row2(0, 3)}
                  </div>
                ) : (
                  /* scorekeeper: P[2](180°) + [P[1](270°)|P[3](90°)] + hub + P[0](0°) */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(180, <PlayerCard {...cp(2)} />)}</div>
                    {row2(1, 3)}
                    {hubBar}
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(0, <PlayerCard {...cp(0)} />)}</div>
                  </div>
                );
              }

              /* ── 5P ──────────────────────────────────────────────────────────── */
              if (playerCount === 5) {
                return layoutMode === 'scorekeeper' ? (
                  /* scorekeeper: P[2](180°) + hub + [P[1](270°)|P[3](90°)] + [P[0](270°)|P[4](90°)] */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(180, <PlayerCard {...cp(2)} />)}</div>
                    {hubBar}
                    {row2(1, 3)}
                    {row2(0, 4)}
                  </div>
                ) : (
                  /* table: [P[2](270°)|P[3](90°)] + [P[1](270°)|P[4](90°)] + hub + P[0](0°) */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                    {row2(2, 3)}
                    {row2(1, 4)}
                    {hubBar}
                    <div style={{ flex: 1, minHeight: 0 }}>{rf(0, <PlayerCard {...cp(0)} />)}</div>
                  </div>
                );
              }

              /* ── 6P ──────────────────────────────────────────────────────────── */
              return layoutMode === 'table' ? (
                /* table: [P[2](270°)|P[3](90°)] + [P[1](270°)|P[4](90°)] + hub + [P[0](270°)|P[5](90°)] */
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                  {row2(2, 3)}
                  {row2(1, 4)}
                  {hubBar}
                  {row2(0, 5)}
                </div>
              ) : (
                /* scorekeeper: P[3](180°) + [P[2](270°)|P[4](90°)] + [P[1](270°)|P[5](90°)] + hub + P[0](0°) */
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: "4px" }}>
                  <div style={{ flex: 1, minHeight: 0 }}>{rf(180, <PlayerCard {...cp(3)} />)}</div>
                  {row2(2, 4)}
                  {row2(1, 5)}
                  {hubBar}
                  <div style={{ flex: 1, minHeight: 0 }}>{rf(0, <PlayerCard {...cp(0)} />)}</div>
                </div>
              );
            })()}
          </GameProvider>
        )}

      </div>


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

      {/* ── Dice & Misc modal ── */}
      {showDiceModal && (
        <BottomSheet onClose={() => setShowDiceModal(false)} zIndex={300} maxWidth="420px" padding="0px">
          <DiceAndCoins
            onClose={() => setShowDiceModal(false)}
            players={players}
            myPlayerIndex={myPlayerIndex}
            diceActions={diceActions}
          />
        </BottomSheet>
      )}

      {/* ── Dice quick-access popup (long-press the dice button) ── */}
      {showDiceQuickAccess && (
        <DiceQuickAccess
          onClose={() => setShowDiceQuickAccess(false)}
          diceActions={diceActions}
          hasPlayers={players.length > 0}
        />
      )}

      {/* ── Home Confirm ── */}
      {showHomeConfirm && (
        <BottomSheet onClose={() => setShowHomeConfirm(false)} zIndex={300} maxWidth="380px" padding="24px">
          <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 600 }}>Leave Game?</h3>
          <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Your current game is still in progress. Are you sure you want to go home?
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowHomeConfirm(false)}
              className="glass-button"
              style={{ flex: 1 }}
            >
              Stay
            </button>
            <button
              onClick={() => { setShowHomeConfirm(false); onNavigate?.("home"); }}
              className="glass-button"
              style={{ flex: 1, background: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.25)", color: "#818cf8" }}
            >
              Go Home
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Reset Confirm ── replaces window.confirm() for iOS PWA compatibility */}
      {showResetConfirm && (
        <BottomSheet onClose={() => setShowResetConfirm(false)} zIndex={300} maxWidth="420px" padding="24px">
          <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", fontWeight: 800 }}>Reset game</h3>
          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Select the winner (optional)
          </p>

          {/* Player grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            {players.map(p => {
              const selected = resetWinnerChoice === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setResetWinnerChoice(selected ? null : p.id)}
                  className="glass-button"
                  style={{
                    justifyContent: "space-between",
                    background: selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)",
                    borderColor: selected ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.08)",
                    color: selected ? "#fff" : "var(--text-secondary)",
                    fontWeight: selected ? 700 : 500,
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ fontWeight: 700 }}>{p.life}</span>
                </button>
              );
            })}
          </div>

          {/* Draw */}
          <button
            onClick={() => setResetWinnerChoice(resetWinnerChoice === "draw" ? null : "draw")}
            className="glass-button"
            style={{
              width: "100%", justifyContent: "center", marginBottom: "16px",
              background: resetWinnerChoice === "draw" ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.04)",
              borderColor: resetWinnerChoice === "draw" ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.08)",
              color: resetWinnerChoice === "draw" ? "#fff" : "var(--text-secondary)",
              fontWeight: resetWinnerChoice === "draw" ? 700 : 500,
            }}
          >
            <Handshake size={15} /> Draw
          </button>

          <p style={{ margin: "0 0 16px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            This will reset life back to {startingLife}. Proceed?
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={() => { setShowResetConfirm(false); doReset(false); }}
              className="glass-button"
              style={{ width: "100%", justifyContent: "center", background: "rgba(244,63,94,0.12)", borderColor: "rgba(244,63,94,0.3)", color: "#f43f5e", fontWeight: 700 }}
            >
              <RotateCcw size={15} /> Reset
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="glass-button"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <XCircle size={15} /> Cancel
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

      {/* Player Profile Modal — name + commander + art adjustment (portrait, at root level) */}
      {setupPlayer !== null && (() => {
        const sp = players.find(pl => pl.id === setupPlayer);
        if (!sp) return null;
        return (
          <PlayerProfileModal
            player={sp}
            savedDecks={savedDecks}
            onRename={(name) => renamePlayer(setupPlayer, name)}
            onConfirm={(name, deckId) => { const id = setupPlayer!; setPlayerCommander(id, name, deckId); setSetupPlayer(null); if (name) setTimeout(() => setHubPlayer(id), 60); }}
            onClear={() => { clearPlayerCommander(setupPlayer); setSetupPlayer(null); }}
            onUpdateArt={(x, y, zoom) => updatePlayerArt(setupPlayer, x, y, zoom)}
            onClose={() => setSetupPlayer(null)}
            onTogglePartner={() => togglePartner(setupPlayer!)}
            onSetPartner={(name) => setPartnerCommander(setupPlayer!, name)}
            onClearPartner={() => clearPartnerCommander(setupPlayer!)}
          />
        );
      })()}

      {/* Commander Hub Modal — 3-tab hub (portrait, at root level) */}
      {hubPlayer !== null && (() => {
        const hp = players.find(pl => pl.id === hubPlayer);
        if (!hp) return null;
        return (
          <CommanderHubModal
            player={hp}
            allPlayers={players}
            colors={colors}
            onSetArtSource={(usePartner) => setPlayerArtSource(hubPlayer, usePartner)}
            onClearCommander={() => clearPlayerCommander(hubPlayer)}
            onClearPartnerCommander={() => clearPartnerCommander(hubPlayer)}
            adjustTax={adjustTax}
            togglePartner={togglePartner}
            adjustCounter={adjustCounter}
            clearCounters={clearCounters}
            assignMonarch={assignMonarch}
            releaseMonarch={releaseMonarch}
            assignInitiative={assignInitiative}
            releaseInitiative={releaseInitiative}
            toggleCityBlessing={toggleCityBlessing}
            adjustMana={adjustMana}
            adjustStorm={adjustStorm}
            clearMana={clearMana}
            onAdjustDamage={adjustCommanderDamage}
            onOpenEdit={() => { setHubPlayer(null); setTimeout(() => setSetupPlayer(hubPlayer), 60); }}
            onClose={() => setHubPlayer(null)}
            initialTab={hubInitialTab}
          />
        );
      })()}

    </div>
  );
};
