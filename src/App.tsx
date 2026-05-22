import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { CardCodex } from "./components/CardCodex";
import { SettingsPanel } from "./components/SettingsPanel";
import { AIJudge } from "./views/AIJudge";
import { LifeCounter } from "./views/LifeCounter";
import { DiceAndCoins } from "./views/DiceAndCoins";
import { TurnOrder } from "./views/TurnOrder";
import { QuickRules } from "./views/QuickRules";
import { DeckBuilder } from "./views/DeckBuilder";
import { STORAGE_KEYS } from "./constants/storageKeys";
import { applyTheme, DEFAULT_THEME, THEMES } from "./constants/themes";
import type { ThemeId } from "./constants/themes";
import type { TabId } from "./constants/tabIds";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("judge");
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
  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEYS.THEME, t);
    applyTheme(t);
  };

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
        return <LifeCounter />;
      case "dice":
        return <DiceAndCoins />;
      case "turns":
        return <TurnOrder />;
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
      case "settings":
        return <SettingsPanel apiKey={apiKey} setApiKey={handleSetApiKey} theme={theme} setTheme={setTheme} />;
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
