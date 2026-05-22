import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { CardCodex } from "./components/CardCodex";
import { SettingsPanel } from "./components/SettingsPanel";
import { AIJudge } from "./views/AIJudge";
import { LifeCounter } from "./views/LifeCounter";
import { DiceAndCoins } from "./views/DiceAndCoins";
import { TurnOrder } from "./views/TurnOrder";
import { QuickRules } from "./views/QuickRules";
import { DeckBuilder } from "./views/DeckBuilder";
import { Leaderboard } from "./views/Leaderboard";
import { GameNight } from "./views/GameNight";
import { STORAGE_KEYS } from "./constants/storageKeys";
import { applyTheme, DEFAULT_THEME, THEMES } from "./constants/themes";
import type { ThemeId } from "./constants/themes";
import type { TabId } from "./constants/tabIds";
import { initAuth, onAuthStateChange, linkGoogleAccount } from "./services/auth";
import type { AuthUser } from "./services/auth";
import type { LobbyPlayer } from "./types/game";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("judge");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [codexOpen, setCodexOpen] = useState<boolean>(false);
  const [codexSearch, setCodexSearch] = useState<string>("");
  // Initialize from localStorage directly — avoids setState-in-effect lint warnings
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.GEMINI_KEY) || ""
  );
  const [geminiModel, setGeminiModel] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL) || "gemini-2.5-flash"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === "true"
  );
  const toggleSidebar = () => setSidebarCollapsed(prev => {
    const next = !prev;
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(next));
    return next;
  });

  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeId | null;
    // Accept any known theme id; fall back to "void" (default dark)
    if (stored && THEMES.some(t => t.id === stored)) return stored;
    return DEFAULT_THEME;
  });
  // Apply theme CSS vars + data-theme attribute whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // ── Auth — sign in anonymously on first load ──
  useEffect(() => {
    initAuth().then(user => { if (user) setAuthUser(user); });
    const { unsubscribe } = onAuthStateChange(user => setAuthUser(user));
    return unsubscribe;
  }, []);
  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEYS.THEME, t);
    applyTheme(t);
  };

  // ── Multiplayer lobby orchestration ──────────────────────────────────────
  const [mpLobbyPlayers, setMpLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [mpSpinWinner,   setMpSpinWinner]   = useState<string | null>(null);
  const [mpRoomCode,     setMpRoomCode]     = useState<string | null>(null);
  const [mpRole,         setMpRole]         = useState<"host" | "guest" | null>(null);
  // Bumped every time a multiplayer game starts to force LifeCounter to remount
  // with fresh state, ensuring the lazy useState initializer runs with new lobby data.
  const [mpGameKey, setMpGameKey] = useState(0);

  /**
   * Called by LifeCounter when the lobby transitions to a new phase.
   *
   * "turn-select": LifeCounter passes the final lobby player list + room metadata
   *   so App.tsx can relay them directly to TurnOrder — no localStorage polling needed.
   * "game":        TurnOrder (via LifeCounter) signals the game has started;
   *   App.tsx bumps the LifeCounter key so it remounts with lobby data.
   */
  const handleMpPhaseChange = useCallback((
    phase: "turn-select" | "game" | null,
    lobbyPlayers?: LobbyPlayer[],
    roomCode?: string,
    role?: "host" | "guest",
  ) => {
    if (phase === "turn-select" && lobbyPlayers) {
      setMpLobbyPlayers(lobbyPlayers);
      if (roomCode) setMpRoomCode(roomCode);
      if (role)     setMpRole(role);
      setActiveTab("turns");
    }
    if (phase === "game") {
      setMpGameKey(prev => prev + 1);
      setActiveTab("life");
    }
  }, []);

  /**
   * Called by TurnOrder when the host broadcasts "Begin Game".
   * `spinWinner` is the name of the player who won the spin wheel.
   */
  const handleTurnOrderPhaseChange = useCallback((phase: "game", spinWinner?: string) => {
    if (phase === "game") {
      if (spinWinner) setMpSpinWinner(spinWinner);
      setMpGameKey(prev => prev + 1);
      setActiveTab("life");
    }
  }, []);

  // Re-read gemini model when leaving the settings tab so changes are picked up
  useEffect(() => {
    if (activeTab === "settings") return;
    const savedModel = localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL) || "gemini-2.5-flash";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeminiModel(savedModel);
  }, [activeTab]);

  const handleSetApiKey = (key: string) => {
    setApiKey(key);
    // Also re-read model in case it was updated at the same time
    const savedModel = localStorage.getItem(STORAGE_KEYS.GEMINI_MODEL) || "gemini-2.5-flash";
    setGeminiModel(savedModel);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "judge":
        return (
          <AIJudge
            apiKey={apiKey}
            geminiModel={geminiModel}
            openCodex={() => { setCodexSearch(""); setCodexOpen(true); }}
            openCodexWith={(term: string) => { setCodexSearch(term); setCodexOpen(true); }}
            goToSettings={() => setActiveTab("settings")}
          />
        );
      case "life":
        return (
          <LifeCounter
            key={mpGameKey}
            userId={authUser?.id}
            mpInitLobbyPlayers={mpLobbyPlayers.length > 0 ? mpLobbyPlayers : undefined}
            mpInitFirstPlayer={mpSpinWinner ?? undefined}
          />
        );
      case "gamenight":
        return (
          <GameNight
            onMpPhaseChange={handleMpPhaseChange}
          />
        );
      case "dice":
        return <DiceAndCoins />;
      case "turns":
        return (
          <TurnOrder
            mpRoomCode={mpRoomCode}
            mpRole={mpRole}
            mpLobbyPlayers={mpLobbyPlayers.length > 0 ? mpLobbyPlayers : undefined}
            onMpPhaseChange={handleTurnOrderPhaseChange}
          />
        );
      case "rules":
        return <QuickRules />;
      case "deck":
        return (
          <DeckBuilder
            apiKey={apiKey}
            geminiModel={geminiModel}
            openCodexWith={(term: string) => { setCodexSearch(term); setCodexOpen(true); }}
          />
        );
      case "leaderboard":
        return (
          <Leaderboard
            authUser={authUser}
            onLinkGoogle={linkGoogleAccount}
            onGoToSettings={() => setActiveTab("settings")}
          />
        );
      case "settings":
        return (
          <SettingsPanel
            apiKey={apiKey}
            setApiKey={handleSetApiKey}
            theme={theme}
            setTheme={setTheme}
            authUser={authUser}
            onLinkGoogle={linkGoogleAccount}
          />
        );
      default:
        return (
          <AIJudge
            apiKey={apiKey}
            geminiModel={geminiModel}
            openCodex={() => setCodexOpen(true)}
            goToSettings={() => setActiveTab("settings")}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openCodex={() => setCodexOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />

      {/* Main Feature View */}
      <main className="main-content">
        {renderActiveView()}
      </main>

      {/* Slide-out Search Codex Overlay */}
      <CardCodex
        isOpen={codexOpen}
        onClose={() => { setCodexOpen(false); setCodexSearch(""); }}
        initialSearch={codexSearch}
      />
    </div>
  );
}

export default App;
