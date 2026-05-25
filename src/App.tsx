import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Sidebar } from "./components/Sidebar";
import { CardCodex } from "./components/CardCodex";
import { SettingsPanel } from "./components/SettingsPanel";
// Eagerly loaded — landing view or lightweight
import { LifeCounter } from "./views/LifeCounter";
import { DiceAndCoins } from "./views/DiceAndCoins";
import { TurnOrder } from "./views/TurnOrder";
import { QuickRules } from "./views/QuickRules";
import { Leaderboard } from "./views/Leaderboard";
import { AIJudge } from "./views/AIJudge";
const DeckBuilder = lazy(() => import("./views/DeckBuilder").then(m => ({ default: m.DeckBuilder })));
const GameNight  = lazy(() => import("./views/GameNight").then(m => ({ default: m.GameNight })));
const AppGuide   = lazy(() => import("./views/AppGuide").then(m => ({ default: m.AppGuide })));
const MoreMenu   = lazy(() => import("./views/MoreMenu").then(m => ({ default: m.MoreMenu })));
import { STORAGE_KEYS } from "./constants/storageKeys";
import { applyTheme, DEFAULT_THEME, THEMES } from "./constants/themes";
import type { ThemeId } from "./constants/themes";
import type { TabId } from "./constants/tabIds";
import { initAuth, onAuthStateChange, linkGoogleAccount } from "./services/auth";
import type { AuthUser } from "./services/auth";
import type { LobbyPlayer } from "./types/game";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("life");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [codexSearch, setCodexSearch] = useState("");

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

  // ── Global Event Listeners ──
  useEffect(() => {
    const handleOpenJudge = () => setJudgeOpen(true);
    window.addEventListener("open-ai-judge", handleOpenJudge);
    return () => window.removeEventListener("open-ai-judge", handleOpenJudge);
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
      // Defer clear so LifeCounter's first mount sees the lobby players,
      // then subsequent remounts (tab switches) fall through to localStorage.
      setTimeout(() => setMpLobbyPlayers([]), 0);
    }
  }, []);

  /**
   * Called by TurnOrder when the host broadcasts "Begin Game".
   * `spinWinner` is the name of the player who won the spin wheel.
   */
  const handleTurnOrderPhaseChange = useCallback((phase: "game", spinWinner?: string) => {
    if (phase === "game") {
      if (spinWinner) setMpSpinWinner(spinWinner);
      // Clear stale saved players so LifeCounter always uses fresh lobby data (host + guests)
      localStorage.removeItem(STORAGE_KEYS.PLAYERS);
      localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX);
      setMpGameKey(prev => prev + 1);
      setActiveTab("life");
      // Same deferred clear — prevents re-init from lobby data on tab switches.
      setTimeout(() => setMpLobbyPlayers([]), 0);
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

  const handleNavigate = (tab: TabId) => {
    if (tab === "judge") {
      setJudgeOpen(true);
    } else {
      setActiveTab(tab);
      setJudgeOpen(false); // Close modal if switching tabs
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
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
            onNavigate={(tab) => setActiveTab(tab)}
          />
        );
      case "more":
        return <MoreMenu onNavigate={(tab) => setActiveTab(tab)} />;
      case "guide":
        return <AppGuide onNavigate={(tab) => setActiveTab(tab)} />;
      default:
        // Default to life counter if an unknown tab is selected somehow
        return (
          <LifeCounter
            key={mpGameKey}
            userId={authUser?.id}
            mpInitLobbyPlayers={mpLobbyPlayers.length > 0 ? mpLobbyPlayers : undefined}
            mpInitFirstPlayer={mpSpinWinner ?? undefined}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={judgeOpen ? "judge" : activeTab}
        setActiveTab={handleNavigate}
        openCodex={() => setCodexOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />

      {/* Main Feature View */}
      <main className="main-content">
        <Suspense fallback={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Loading…
          </div>
        }>
          {renderActiveView()}
        </Suspense>
      </main>

      {/* Slide-out Search Codex Overlay */}
      <CardCodex
        isOpen={codexOpen}
        onClose={() => { setCodexOpen(false); setCodexSearch(""); }}
        initialSearch={codexSearch}
      />

      {/* Slide-Up AI Judge Overlay */}
      {judgeOpen && (
        <div 
          className="desktop-split-panel" 
          style={{
            position: "fixed", inset: 0, zIndex: 100, background: "var(--bg-deep)", display: "flex", flexDirection: "column",
            animation: "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            boxSizing: "border-box",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            transition: "top 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            overflowY: "hidden",
            overscrollBehavior: "none",
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
          `}</style>

          <AIJudge
            apiKey={apiKey}
            geminiModel={geminiModel}
            isModal={true}
            onClose={() => setJudgeOpen(false)}
            openCodex={() => { setCodexSearch(""); setCodexOpen(true); }}
            openCodexWith={(term: string) => { setCodexSearch(term); setCodexOpen(true); }}
            goToSettings={() => {
              setJudgeOpen(false);
              setActiveTab("settings");
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
