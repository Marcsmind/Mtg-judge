import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Sidebar } from "./components/Sidebar";
import { CardCodex } from "./components/CardCodex";
import { SettingsPanel } from "./components/SettingsPanel";
import { AuthModal } from "./components/AuthModal";
import { OnboardingFlow } from "./components/OnboardingFlow";
// Eagerly loaded — landing view or lightweight
import { LifeCounter } from "./views/LifeCounter";
import { DiceAndCoins } from "./views/DiceAndCoins";
import { TurnOrder } from "./views/TurnOrder";
import { QuickRules } from "./views/QuickRules";
import { Leaderboard } from "./views/Leaderboard";
import { AIJudge } from "./views/AIJudge";
import { Home } from "./views/Home";
const DeckBuilder = lazy(() => import("./views/DeckBuilder").then(m => ({ default: m.DeckBuilder })));
const GameNight  = lazy(() => import("./views/GameNight").then(m => ({ default: m.GameNight })));
const AppGuide   = lazy(() => import("./views/AppGuide").then(m => ({ default: m.AppGuide })));
const MoreMenu   = lazy(() => import("./views/MoreMenu").then(m => ({ default: m.MoreMenu })));
const DraftMode   = lazy(() => import("./views/DraftMode").then(m => ({ default: m.DraftMode })));
const Collection  = lazy(() => import("./views/Collection").then(m => ({ default: m.Collection })));
import { STORAGE_KEYS } from "./constants/storageKeys";
import { applyTheme, DEFAULT_THEME, THEMES } from "./constants/themes";
import type { ThemeId } from "./constants/themes";
import type { TabId } from "./constants/tabIds";
import { initAuth, onAuthStateChange, signInWithGoogle, signOut, deleteAccount, activateTrial } from "./services/auth";
import { track } from "./services/analytics";
import { initRevenueCat, isNative } from "./services/revenueCat";
import { supabase } from "./services/supabase";
import type { AuthUser } from "./services/auth";
import { migrateLocalDecksToCloud } from "./services/decks";
import { useAuth } from "./hooks/useAuth";
import type { LobbyPlayer } from "./types/game";

function App() {
  const [onboardingDone, setOnboardingDone] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === "1"
  );
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [lifecounterFullscreen, setLifecounterFullscreen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { tier: authTier, trialEndsAt } = useAuth();
  // Optimistic override — set immediately after RevenueCat purchase so the UI
  // updates before the webhook reaches Supabase. Cleared on next auth refresh.
  const [optimisticTier, setOptimisticTier] = useState<import("./types/subscription").SubscriptionTier | null>(null);
  const tier = optimisticTier ?? authTier;
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
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
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
    const { unsubscribe } = onAuthStateChange(user => {
      setAuthUser(user);
      if (user && !user.isAnonymous) setAuthModalOpen(false);
      // Re-init anonymous session after sign-out so the app is never sessionless
      if (!user) initAuth().then(u => { if (u) setAuthUser(u); });
    });
    return unsubscribe;
  }, []);

  // ── Activate 14-day trial + migrate decks on first permanent sign-in ──
  // Covers all auth paths: email signup, Google link, Apple sign-in.
  // activateTrial is idempotent — no-ops if trial_ends_at is already set.
  useEffect(() => {
    if (!authUser || authUser.isAnonymous) return;
    activateTrial(authUser.id).then(wasNew => {
      if (wasNew) track("trial_activated");
    });
    migrateLocalDecksToCloud(authUser.id);
  }, [authUser?.id, authUser?.isAnonymous]);

  // ── Init RevenueCat on native after any auth (anonymous or email) ──
  useEffect(() => {
    if (!authUser) return;
    initRevenueCat(authUser.id);
  }, [authUser?.id]);

  // ── Handle OAuth deep-link callback on native (Google / Apple sign-in) ──
  // iOS fires appUrlOpen when the Supabase callback redirects to our custom scheme.
  // Two cases:
  //   1. Success (?code=...)         → exchange code for session
  //   2. Error (email_exists etc.)   → same recovery as the web handler:
  //                                    sign out anon session and retry as sign-in
  useEffect(() => {
    if (!isNative) return;
    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith("com.nexusjudge.app://auth/callback")) return;

        const { Browser } = await import("@capacitor/browser");
        await Browser.close();

        // Parse query params from the deep-link URL
        const qs = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
        const params = new URLSearchParams(qs);
        const errorCode = params.get('error_code');
        const isAlreadyLinked =
          errorCode === 'email_exists' ||
          errorCode === 'identity_already_exists' ||
          params.get('error') === 'identity_already_linked';

        if (isAlreadyLinked) {
          // Google account belongs to existing user — clear anon session and
          // retry as a plain sign-in. forceFresh=true bypasses the isAnon check
          // so we always use signInWithOAuth even if a new anon session was
          // created in the gap between signOut and this call.
          await signOut();
          await signInWithGoogle(true);
          return;
        }

        if (params.get('error')) {
          // Other OAuth error — nothing to exchange, just leave the user logged out
          console.error('[auth] native OAuth error:', params.get('error_description'));
          return;
        }

        // Supabase returns tokens in the hash fragment for native callbacks
        // (#access_token=...) rather than a PKCE code in query params (?code=...).
        // Handle both cases.
        const fragment = url.includes('#') ? url.split('#')[1] : '';
        const fp = new URLSearchParams(fragment);
        const accessToken = fp.get('access_token');
        const refreshToken = fp.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) console.error('[auth] setSession failed:', error.message);
        } else {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) console.error('[auth] exchangeCodeForSession failed:', error.message);
        }
      }).then((handle: { remove: () => void }) => {
        cleanup = () => handle.remove();
      });
    });
    return () => cleanup?.();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    // onAuthStateChange above handles re-initializing an anonymous session
  };

  const handleDeleteAccount = async () => {
    await deleteAccount();
    // onAuthStateChange fires null → re-initializes anonymous session automatically
  };

  // ── Handle OAuth callback errors (?error= / #error=) ──
  // Supabase redirects back with error params when Google/Apple sign-in fails.
  // Special case: "identity_already_linked" means the Google/Apple account already
  // belongs to an existing user (e.g. returning user in incognito gets an anon
  // session, then linkIdentity fails). Fix: clear the anon session and retry as
  // a regular sign-in so they land back in their account.
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const hp = new URLSearchParams(window.location.hash.slice(1));
    const oauthError = qp.get('error') || hp.get('error');
    if (!oauthError) return;
    window.history.replaceState({}, '', window.location.pathname);

    const desc = (qp.get('error_description') || hp.get('error_description') || '')
      .replace(/\+/g, ' ');
    const isAlreadyLinked =
      oauthError === 'identity_already_linked' ||
      oauthError === 'identity_already_exists' ||
      decodeURIComponent(desc).toLowerCase().includes('already linked');

    if (isAlreadyLinked) {
      // Sign out the temporary anon session, then kick off a normal OAuth sign-in.
      // signInWithGoogle will now see isAnon=false and call signInWithOAuth.
      signOut().then(() => signInWithGoogle(true));
      return;
    }

    const message = desc ? decodeURIComponent(desc) : 'Sign in failed. Please try again.';
    const el = document.createElement('div');
    el.innerText = `Sign in failed: ${message}`;
    Object.assign(el.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(10,8,16,0.96)', border: '1px solid rgba(244,63,94,0.5)',
      borderRadius: '12px', padding: '12px 20px', color: '#fff',
      fontSize: '0.88rem', fontWeight: 600, zIndex: '9999',
      boxShadow: '0 8px 32px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      maxWidth: '340px', textAlign: 'center',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
    // Re-open the auth modal so the user can retry (deferred to avoid setState-in-effect lint error)
    setTimeout(() => setAuthModalOpen(true), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle QR-code deep-link join (?join=ABCD) ──
  // When a guest scans the host's QR code from outside the app, we land on
  // /?join=ABCD. Store it for GameNight to pick up, then navigate there.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    if (!joinCode) return;
    window.history.replaceState({}, "", window.location.pathname);
    localStorage.setItem("nexus_qr_join_code", joinCode.toUpperCase());
    setTimeout(() => setActiveTab("gamenight"), 0);
  }, []);

  // ── Handle Stripe redirect back (?upgraded=true / ?upgraded=false) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgraded = params.get("upgraded");
    if (!upgraded) return;
    // Strip query param from URL without a page reload
    window.history.replaceState({}, "", window.location.pathname);
    if (upgraded === "true") {
      setTimeout(() => setActiveTab("settings"), 0);
      // Brief banner — Stripe webhook will update the tier within seconds
      const el = document.createElement("div");
      el.id = "upgrade-toast";
      el.innerText = "🎉 Upgrade successful! Your plan is being activated…";
      Object.assign(el.style, {
        position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)",
        background: "rgba(10,8,16,0.96)", border: "1px solid rgba(139,92,246,0.5)",
        borderRadius: "12px", padding: "12px 20px", color: "#fff",
        fontSize: "0.9rem", fontWeight: 600, zIndex: "9999",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
      });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }, []);

  // ── --app-height keyboard fix ──
  // On iOS Capacitor, window.visualViewport doesn't fire resize events when the
  // soft keyboard appears (WKWebView limitation). Instead we use @capacitor/keyboard
  // native delegate events which are guaranteed to fire. On web we fall back to
  // visualViewport for the same behaviour in a browser.
  useEffect(() => {
    if (isNative) {
      let showHandle: { remove: () => void } | null = null;
      let hideHandle: { remove: () => void } | null = null;
      import("@capacitor/keyboard").then(({ Keyboard }) => {
        Keyboard.addListener("keyboardWillShow", (info) => {
          setIsKeyboardOpen(true);
          // Skip --app-height shrink when a modal input is focused — prevents
          // the centered panel from jumping upward and dismissing the keyboard.
          if (document.activeElement?.closest(".glass-panel")) return;
          document.documentElement.style.setProperty(
            "--app-height",
            `${window.innerHeight - info.keyboardHeight}px`,
          );
        }).then(h => { showHandle = h; });
        Keyboard.addListener("keyboardWillHide", () => {
          setIsKeyboardOpen(false);
          document.documentElement.style.setProperty(
            "--app-height",
            `${window.innerHeight}px`,
          );
        }).then(h => { hideHandle = h; });
        // Disable scroll-to-visible on focus (prevents fixed elements jumping).
        Keyboard.setScroll({ isDisabled: true });
        // Hide the accessory bar (^  v  ✓) globally — users tap outside to dismiss.
        Keyboard.setAccessoryBarVisible({ isVisible: false });
        // Set initial value
        document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
      });
      return () => {
        showHandle?.remove();
        hideHandle?.remove();
      };
    }
    // Web fallback: visualViewport works fine in browsers
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
    update();
    vv.addEventListener("resize", update);

    // Track keyboard open state via focus events; check relatedTarget to avoid
    // false "closed" flashes when focus moves between two inputs.
    const onFocusIn  = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") setIsKeyboardOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const rel = e.relatedTarget as HTMLElement | null;
      if (!rel || (rel.tagName !== "INPUT" && rel.tagName !== "TEXTAREA")) {
        setIsKeyboardOpen(false);
      }
    };
    window.addEventListener("focusin",  onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("focusin",  onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // ── Global Event Listeners ──
  useEffect(() => {
    const handleOpenJudge  = () => setJudgeOpen(true);
    const handleOpenCodex  = (e: Event) => {
      const term = (e as CustomEvent<{ term?: string }>).detail?.term;
      if (term) setCodexSearch(term);
      setCodexOpen(true);
    };
    const handleGoSettings = () => { setActiveTab("settings"); setJudgeOpen(false); };
    window.addEventListener("open-ai-judge",  handleOpenJudge);
    window.addEventListener("open-codex",     handleOpenCodex);
    window.addEventListener("go-to-settings", handleGoSettings);
    return () => {
      window.removeEventListener("open-ai-judge",  handleOpenJudge);
      window.removeEventListener("open-codex",     handleOpenCodex);
      window.removeEventListener("go-to-settings", handleGoSettings);
    };
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
      // Clear stale spin result from any previous session before navigating to TurnOrder
      localStorage.removeItem(STORAGE_KEYS.TURN_WINNER);
      localStorage.removeItem(STORAGE_KEYS.TURN_INDEX);
      setActiveTab("turns");
    }
    if (phase === "game") {
      // Clear stale saved players so LifeCounter always uses fresh lobby data
      localStorage.removeItem(STORAGE_KEYS.PLAYERS);
      localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX);
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
      // Clear stale saved players so LifeCounter always uses fresh lobby data (host + guests)
      localStorage.removeItem(STORAGE_KEYS.PLAYERS);
      localStorage.removeItem(STORAGE_KEYS.MY_PLAYER_INDEX);
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

  useEffect(() => {
    if (activeTab !== "life") setLifecounterFullscreen(false);
  }, [activeTab]);

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
      case "home":
        return (
          <Home
            authUser={authUser}
            tier={tier}
            onNavigate={handleNavigate}
            onSignIn={() => setAuthModalOpen(true)}
          />
        );
      case "life":
        return (
          <LifeCounter
            key={mpGameKey}
            userId={authUser?.id}
            mpInitLobbyPlayers={mpLobbyPlayers.length > 0 ? mpLobbyPlayers : undefined}
            mpInitFirstPlayer={mpSpinWinner ?? undefined}
            onLobbyConsumed={() => {
              setMpLobbyPlayers([]);
              setMpSpinWinner(null);
            }}
            onEnterFullscreen={() => setLifecounterFullscreen(true)}
            onExitFullscreen={() => setLifecounterFullscreen(false)}
            onNavigate={handleNavigate}
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
            onLinkGoogle={signInWithGoogle}
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
            tier={tier}
            trialEndsAt={trialEndsAt}
            onSignIn={() => setAuthModalOpen(true)}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
            onNavigate={(tab) => setActiveTab(tab)}
            onTierChange={(t) => {
              setOptimisticTier(t);
              localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_TIER, t);
            }}
          />
        );
      case "more":
        return <MoreMenu onNavigate={(tab) => setActiveTab(tab)} />;
      case "draft":
        return <DraftMode />;
      case "collection":
        return <Collection />;
      case "guide":
        return <AppGuide onNavigate={(tab) => setActiveTab(tab)} />;
      default:
        return (
          <LifeCounter
            key={mpGameKey}
            userId={authUser?.id}
            mpInitLobbyPlayers={mpLobbyPlayers.length > 0 ? mpLobbyPlayers : undefined}
            mpInitFirstPlayer={mpSpinWinner ?? undefined}
            onEnterFullscreen={() => setLifecounterFullscreen(true)}
            onExitFullscreen={() => setLifecounterFullscreen(false)}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation — hidden when life counter is fullscreen */}
      {!lifecounterFullscreen && (
        <Sidebar
          activeTab={judgeOpen ? "judge" : activeTab}
          setActiveTab={handleNavigate}
          openCodex={() => setCodexOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          isKeyboardOpen={isKeyboardOpen}
        />
      )}

      {/* Main Feature View */}
      <main
        className={lifecounterFullscreen ? "" : `main-content${isKeyboardOpen ? " keyboard-open" : ""}`}
        style={lifecounterFullscreen ? {
          position: "fixed", inset: 0, zIndex: 90,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "var(--bg-deep)",
        } : undefined}
      >
        <Suspense fallback={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Loading…
          </div>
        }>
          {renderActiveView()}
        </Suspense>
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(user) => { setAuthUser(user); setAuthModalOpen(false); }}
      />

      {/* Slide-out Search Codex Overlay */}
      <CardCodex
        isOpen={codexOpen}
        onClose={() => { setCodexOpen(false); setCodexSearch(""); }}
        initialSearch={codexSearch}
      />

      {/* First-launch onboarding */}
      {!onboardingDone && (
        <OnboardingFlow
          onDone={() => {
            localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, "1");
            setOnboardingDone(true);
          }}
        />
      )}

      {/* Slide-Up AI Judge Overlay */}
      {judgeOpen && (
        <div 
          className="desktop-split-panel" 
          style={{
            position: "fixed", top: 0, left: 0, right: 0, height: "var(--app-height, 100dvh)", zIndex: 100, background: "var(--bg-deep)", display: "flex", flexDirection: "column",
            animation: "slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            boxSizing: "border-box",
            paddingTop: "max(20px, env(safe-area-inset-top))",
            paddingBottom: "max(8px, env(safe-area-inset-bottom))",
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
