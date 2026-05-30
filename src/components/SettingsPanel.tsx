import React, { useState, useEffect } from "react";
import { Settings, Shield, Key, Check, Info, Trash2, Palette, Lock, User2, Link2, BookOpen, HelpCircle, ExternalLink, LogIn, LogOut, AlertTriangle } from "lucide-react";
import { linkAppleAccount, linkGoogleAccount } from "../services/auth";
import { THEMES } from "../constants/themes";
import type { ThemeId } from "../constants/themes";
import type { TabId } from "../constants/tabIds";
import { upsertProfile, getDisplayName } from "../services/auth";
import type { AuthUser } from "../services/auth";
import { isSupabaseConfigured } from "../services/supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { UpgradePanel } from "./UpgradePanel";
import type { SubscriptionTier } from "../types/subscription";

interface SettingsPanelProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  theme?: ThemeId;
  setTheme?: (t: ThemeId) => void;
  authUser?: AuthUser | null;
  tier?: SubscriptionTier;
  trialEndsAt?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onDeleteAccount?: () => Promise<void>;
  onNavigate?: (tab: TabId) => void;
  onTierChange?: (tier: SubscriptionTier) => void;
}

function StorageCleaner() {
  const [cleared, setCleared] = useState(false);

  const usedKb = React.useMemo(() => {
    // Count ALL localStorage keys so PostHog / third-party keys are visible too
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      total += (localStorage.getItem(localStorage.key(i) ?? "") ?? "").length;
    }
    return Math.round(total / 1024);
  }, [cleared]);

  const handleClear = () => {
    // Clear nexus history/cache keys
    [
      STORAGE_KEYS.AI_CHAT, STORAGE_KEYS.AI_RULINGS,
      STORAGE_KEYS.AI_TAGS, STORAGE_KEYS.AI_FAVORITES,
      STORAGE_KEYS.LIFE_HISTORY, STORAGE_KEYS.SAVED_GAMES,
    ].forEach(k => localStorage.removeItem(k));
    // Also clear any PostHog keys (ph_*) that may have accumulated from earlier builds
    const phKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("ph_") || k.startsWith("posthog")) phKeys.push(k);
    }
    phKeys.forEach(k => localStorage.removeItem(k));
    setCleared(c => !c);
  };

  return (
    <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Trash2 size={18} color="var(--accent-rose)" />
          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Device Storage</h3>
        </div>
        <span style={{ fontSize: "0.8rem", color: usedKb > 2000 ? "var(--accent-rose)" : "var(--text-muted)", fontWeight: 600 }}>
          {usedKb} KB used
        </span>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        Clears AI chat history, card rulings, and game logs. Your saved decks, settings, and API key are kept.
      </p>
      <button
        className="glass-button"
        onClick={handleClear}
        style={{ alignSelf: "flex-start", fontSize: "0.82rem", padding: "8px 16px", background: "rgba(244,63,94,0.1)", borderColor: "rgba(244,63,94,0.3)", color: "var(--accent-rose)" }}
      >
        Clear chat history &amp; game logs
      </button>
    </div>
  );
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ apiKey, setApiKey, theme = "void", setTheme, authUser, tier = "free", trialEndsAt, onSignIn, onSignOut, onDeleteAccount, onNavigate, onTierChange }) => {
  // Initialize directly to avoid setState-in-effect lint warnings
  const [keyInput, setKeyInput] = useState(() => apiKey);

  // ── Account / leaderboard display name ──
  const [displayName, setDisplayName]       = useState("");
  const [displayNameSaved, setDisplayNameSaved] = useState(false);

  useEffect(() => {
    if (!authUser?.id) return;
    getDisplayName(authUser.id).then(name => {
      setDisplayName(name === "Player" ? "" : name);
    });
  }, [authUser?.id]);

  const handleSaveDisplayName = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!authUser?.id) return;
    await upsertProfile(authUser.id, displayName.trim() || "Player");
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName.trim() || "Player");
    setDisplayNameSaved(true);
    setTimeout(() => setDisplayNameSaved(false), 3000);
  };
  const [saved, setSaved] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accessCodeInput, setAccessCodeInput] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ACCESS_CODE) || ""
  );
  const [accessCodeSaved, setAccessCodeSaved] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("nexus_judge_gemini_model") || "gemini-2.5-flash"
  );
  const [testingModels, setTestingModels] = useState(false);

  // Sync keyInput if the parent apiKey prop changes (e.g. key cleared externally)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeyInput(apiKey);
  }, [apiKey]);

  const handleSaveAccessCode = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clean = accessCodeInput.trim().toUpperCase();
    if (clean) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_CODE, clean);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_CODE);
    }
    setAccessCodeInput(clean);
    setAccessCodeSaved(true);
    setTimeout(() => setAccessCodeSaved(false), 3000);
  };

  const handleClearAccessCode = () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_CODE);
    setAccessCodeInput("");
    setAccessCodeSaved(false);
  };

  const handleSave = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanKey = keyInput.trim();
    localStorage.setItem("nexus_judge_gemini_key", cleanKey);
    localStorage.setItem("nexus_judge_gemini_model", selectedModel);
    setApiKey(cleanKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const testApiKey = async () => {
    if (!keyInput.trim()) return;
    setTestingModels(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyInput.trim()}`);
      if (!res.ok) throw new Error("Key failed");
      const data = await res.json();
      interface GeminiModelEntry { name: string; supportedGenerationMethods: string[] }
      const models = (data.models as GeminiModelEntry[] | undefined)
        ?.filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => m.name.replace("models/", "")) || [];
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(selectedModel)) {
        setSelectedModel(models[0]);
      }
    } catch (e) {
      console.error(e);
      setAvailableModels([]);
    } finally {
      setTestingModels(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem("nexus_judge_gemini_key");
    setApiKey("");
    setKeyInput("");
    setSaved(false);
  };

  const isKeyValidFormat = keyInput.trim().startsWith("AIzaSy") && keyInput.trim().length > 10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px", margin: "0 auto", width: "100%", padding: "12px" }}>
      {/* Page Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <Settings size={28} color="var(--accent-purple)" />
        <div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Settings</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Configure keys and regional options for the Nexus Judge oracle.</p>
        </div>
      </div>

      {/* ── Theme Picker ── */}
      {setTheme && (
        <div className="glass-panel" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Palette size={18} color="var(--accent-purple)" />
            <div>
              <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>Theme</p>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {THEMES.find(t => t.id === theme)?.emoji ?? ""}&nbsp;
                {THEMES.find(t => t.id === theme)?.label ?? "Void"} palette active
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {THEMES.map(palette => {
              const active = theme === palette.id;
              return (
                <button
                  key={palette.id}
                  onClick={() => setTheme(palette.id)}
                  aria-label={`${palette.label} theme`}
                  title={palette.label}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px",
                    padding: "7px 14px", borderRadius: "8px", cursor: "pointer",
                    fontWeight: 600, fontSize: "0.82rem",
                    background: active ? `${palette.swatch}22` : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${active ? palette.swatch : "rgba(255,255,255,0.08)"}`,
                    color: active ? palette.swatch : "var(--text-muted)",
                    transition: "all 0.15s ease",
                    boxShadow: active ? `0 0 10px ${palette.swatch}40` : "none",
                  }}
                >
                  {/* Colour dot */}
                  <span style={{
                    display: "inline-block", width: "10px", height: "10px",
                    borderRadius: "50%", background: palette.swatch, flexShrink: 0,
                    boxShadow: active ? `0 0 6px ${palette.swatch}` : "none",
                  }} />
                  {palette.emoji} {palette.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Settings Panel */}
      <div className="glass-panel" style={{ padding: "30px", display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Intro */}
        <div style={{ display: "flex", gap: "16px", background: "rgba(139, 92, 246, 0.05)", border: "1px solid rgba(139, 92, 246, 0.1)", borderRadius: "10px", padding: "16px" }}>
          <Shield size={24} color="var(--accent-purple)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
            <h4 style={{ fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Local Security & Zero Data Leakage</h4>
            <p style={{ color: "var(--text-secondary)" }}>
              Nexus Judge operates directly inside your web browser. Your API keys are saved exclusively in your browser's private local storage (`localStorage`) and never touch any server except the official Google Gemini API endpoint.
            </p>
          </div>
        </div>

        {/* API Key Form */}
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
              <Key size={16} color="var(--accent-cyan)" />
              Google Gemini API Key
            </label>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Required to enable full LLM rules understanding and dynamic combos reasoning.
            </p>
            <p style={{ color: "var(--accent-emerald)", fontSize: "0.78rem", fontWeight: 500 }}>
              💡 <strong>Leave blank</strong> to use the shared server key — no personal setup needed for guests.
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="password"
              className="glass-input"
              placeholder={apiKey ? "••••••••••••••••••••••••••••••••••••" : "Paste your Gemini API Key here (AIzaSy...)"}
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onFocus={e => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 350); }}
              style={{ flex: 1, fontFamily: "monospace" }}
            />
            {apiKey && (
              <button
                type="button"
                onClick={handleClear}
                className="glass-button"
                style={{
                  background: "rgba(244, 63, 94, 0.08)",
                  borderColor: "rgba(244, 63, 94, 0.15)",
                  color: "var(--accent-rose)",
                  padding: "10px 14px"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(244, 63, 94, 0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(244, 63, 94, 0.08)"}
                title="Remove API Key"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {keyInput && !isKeyValidFormat && (
            <p style={{ color: "var(--accent-rose)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
              ⚠️ Double-check: Gemini API keys usually start with 'AIzaSy' and are about 39 characters long.
            </p>
          )}

          {keyInput && isKeyValidFormat && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px", background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  AI Model Selection
                </label>
                <button
                  type="button"
                  onClick={testApiKey}
                  className="glass-button"
                  disabled={testingModels}
                  style={{ padding: "6px 12px", fontSize: "0.8rem", background: "rgba(16, 185, 129, 0.1)", color: "var(--accent-emerald)" }}
                >
                  {testingModels ? "Testing..." : "Test Key & Fetch Models"}
                </button>
              </div>
              
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="glass-input"
                style={{ width: "100%", padding: "10px", cursor: "pointer", appearance: "auto" }}
              >
                {availableModels.length === 0 ? (
                  <>
                    <option value={selectedModel}>{selectedModel} (Saved)</option>
                    {selectedModel !== "gemini-2.5-flash"   && <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended)</option>}
                    {selectedModel !== "gemini-2.5-pro"     && <option value="gemini-2.5-pro">gemini-2.5-pro</option>}
                    {selectedModel !== "gemini-1.5-flash"   && <option value="gemini-1.5-flash">gemini-1.5-flash</option>}
                    {selectedModel !== "gemini-1.5-pro"     && <option value="gemini-1.5-pro">gemini-1.5-pro</option>}
                  </>
                ) : (
                  availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))
                )}
              </select>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>
                If you are getting a '404 Not Found' error, click the 'Test Key' button above to see exactly which models your specific Google Cloud account has access to.
              </p>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
            <button
              type="submit"
              className="glass-button"
              disabled={!keyInput.trim() || (keyInput.trim() === apiKey && selectedModel === (localStorage.getItem("nexus_judge_gemini_model") || "gemini-2.5-flash"))}
              style={{
                background: saved ? "var(--accent-emerald)" : "var(--accent-purple)",
                borderColor: saved ? "var(--accent-emerald)" : "var(--accent-purple)",
                color: "#ffffff"
              }}
            >
              {saved ? <Check size={16} /> : null}
              <span>{saved ? "Key Saved Successfully!" : "Save Configuration"}</span>
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div style={{ display: "flex", gap: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "20px" }}>
          <Info size={20} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>
            <h5 style={{ fontWeight: 600, color: "#fff", marginBottom: "4px" }}>How to get a FREE Google Gemini API Key?</h5>
            <ol style={{ paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <li>
                Go to the official Google AI Studio website at{" "}
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent-cyan)", textDecoration: "none" }}
                >
                  aistudio.google.com
                </a>.
              </li>
              <li>Sign in with your Google account.</li>
              <li>Click the <strong>"Get API key"</strong> button on the left sidebar.</li>
              <li>Click <strong>"Create API key"</strong> and choose a project.</li>
              <li>Copy the generated key (starts with <strong>AIzaSy…</strong>) and paste it into the input above!</li>
            </ol>
          </div>
        </div>

        {/* Feature RAG Explainer */}
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px"
          }}
        >
          <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255,255,255,0.02)" }}>
            <h5 style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "4px" }}>🔍 RAG-Powered Precision</h5>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
              By pairing the Gemini model with a real-time Scryfall Oracle API, we pull the exact card texts and official rulings prior to sending queries. The judge always rules on actual printing details.
            </p>
          </div>
          <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255,255,255,0.02)" }}>
            <h5 style={{ fontWeight: 600, color: "var(--accent-purple)", marginBottom: "4px" }}>👑 Commander Rule Context</h5>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
              The system instructions are optimized for the Commander (EDH) format. Questions are analyzed with consideration for commander damage, commander tax, color identity, and command zone actions.
            </p>
          </div>
        </div>

      </div>

      {/* ── Account Panel ── */}
      {isSupabaseConfigured && (
        <div className="glass-panel" style={{ padding: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
            <User2 size={22} color="var(--accent-purple)" />
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Account</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Save your decks and game history across devices.
              </p>
            </div>
          </div>

          {/* Not signed in — show sign-in CTA */}
          {(!authUser || authUser.isAnonymous) && (
            <>
              <div style={{ display: "flex", gap: "14px", background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--text-secondary)" }}>
                  <strong style={{ color: "#fff", display: "block", marginBottom: "4px" }}>Playing without an account</strong>
                  Decks and history are saved to this browser only. Create a free account to access your data from any device.
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {onSignIn && (
                  <button
                    onClick={onSignIn}
                    className="glass-button"
                    style={{ padding: "10px 18px", fontSize: "0.9rem", fontWeight: 600, background: "rgba(139,92,246,0.15)", borderColor: "rgba(139,92,246,0.4)", color: "var(--accent-purple)", flex: 1 }}
                  >
                    <LogIn size={15} />
                    <span>Sign In / Create Account</span>
                  </button>
                )}
                {authUser && (
                  <button
                    onClick={async () => {
                      setLinkError(null);
                      const err = await linkGoogleAccount();
                      if (err) setLinkError(err);
                    }}
                    className="glass-button"
                    style={{ padding: "10px 16px", fontSize: "0.88rem", background: "rgba(66,133,244,0.08)", borderColor: "rgba(66,133,244,0.25)", color: "#4285F4" }}
                  >
                    <Link2 size={14} />
                    <span>Link Google</span>
                  </button>
                )}
                {authUser && (
                  <button
                    onClick={async () => {
                      setLinkError(null);
                      const err = await linkAppleAccount();
                      if (err) setLinkError(err);
                    }}
                    className="glass-button"
                    style={{ padding: "10px 16px", fontSize: "0.88rem", background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "7px" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-42.5-150.5-109.5C77 477.7 54.7 324.1 54.7 276.1c0-167.8 109.6-256.5 217.4-256.5 63 0 115.5 41.6 155.5 41.6s98.4-43.7 168.9-43.7c27.4 0 121.9 2.6 196.2 83.4zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
                    </svg>
                    <span>Link Apple</span>
                  </button>
                )}
              </div>
              {linkError && (
                <p style={{ fontSize: "0.78rem", color: "var(--accent-rose)", display: "flex", alignItems: "flex-start", gap: "6px", lineHeight: 1.5 }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: "1px" }} />
                  {linkError.includes("manual_linking_disabled")
                    ? "Account linking is not enabled yet. Please sign in with email first, then link Google/Apple from your account settings."
                    : linkError}
                </p>
              )}
            </>
          )}

          {/* Signed in with email */}
          {authUser && !authUser.isAnonymous && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <span style={{ fontSize: "0.82rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "20px", padding: "4px 12px", color: "var(--accent-emerald)", fontWeight: 600 }}>
                  ✅ {authUser.email ?? "Account linked"}
                </span>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="glass-button"
                    style={{ padding: "6px 14px", fontSize: "0.82rem", background: "rgba(244,63,94,0.06)", borderColor: "rgba(244,63,94,0.2)", color: "var(--accent-rose)" }}
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>

              {/* Display name form — only shown when signed in */}
              <form onSubmit={handleSaveDisplayName} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 600 }}>Display / Player Name</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="Player"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value.slice(0, 24))}
                    onFocus={e => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 350); }}
                    maxLength={24}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="submit"
                    className="glass-button"
                    disabled={!displayName.trim()}
                    style={{
                      background: displayNameSaved ? "var(--accent-emerald)" : "rgba(139,92,246,0.15)",
                      borderColor: displayNameSaved ? "var(--accent-emerald)" : "rgba(139,92,246,0.4)",
                      color: "#fff",
                    }}
                  >
                    {displayNameSaved ? <Check size={14} /> : null}
                    <span>{displayNameSaved ? "Saved!" : "Save"}</span>
                  </button>
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Used on the leaderboard and pre-filled as your name when joining a multiplayer room. Max 24 characters.
                </p>
              </form>

              {/* Delete Account */}
              {onDeleteAccount && (
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "5px", padding: 0 }}
                    >
                      <Trash2 size={13} /> Delete Account
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <AlertTriangle size={16} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: "1px" }} />
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                          This will permanently delete your account, all saved decks, and game history. <strong style={{ color: "#fff" }}>This cannot be undone.</strong>
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={async () => {
                            setDeleting(true);
                            await onDeleteAccount();
                            setDeleting(false);
                            setConfirmDelete(false);
                          }}
                          disabled={deleting}
                          className="glass-button"
                          style={{ background: "rgba(244,63,94,0.15)", borderColor: "rgba(244,63,94,0.4)", color: "var(--accent-rose)", fontSize: "0.85rem", opacity: deleting ? 0.6 : 1 }}
                        >
                          {deleting ? "Deleting…" : "Yes, delete everything"}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="glass-button"
                          style={{ fontSize: "0.85rem" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Server Access Code Panel ── */}
      <div className="glass-panel" style={{ padding: "30px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
          <Lock size={22} color="var(--accent-gold)" />
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Server Access Code</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Enter the code shared by the app owner to use the shared AI key — no personal Gemini key needed.
            </p>
          </div>
        </div>

        {/* Explainer */}
        <div style={{ display: "flex", gap: "14px", background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.15)", borderRadius: "10px", padding: "14px" }}>
          <Lock size={20} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            <p style={{ color: "var(--text-secondary)" }}>
              The app owner sets a private code in their Netlify deployment. When you enter the correct code here,
              the shared server key is unlocked for you — without exposing the key itself.
              If you have your own Gemini API key above, it takes priority and this code is not needed.
            </p>
          </div>
        </div>

        {/* Access Code Form */}
        <form onSubmit={handleSaveAccessCode} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
              <Lock size={15} color="var(--accent-gold)" />
              Access Code
            </label>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="password"
              className="glass-input"
              placeholder="Enter the access code…"
              value={accessCodeInput}
              onChange={e => setAccessCodeInput(e.target.value)}
              onFocus={e => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 350); }}
              style={{ flex: 1, fontFamily: "monospace", letterSpacing: "2px" }}
              autoComplete="off"
            />
            {accessCodeInput && (
              <button
                type="button"
                onClick={handleClearAccessCode}
                className="glass-button"
                style={{
                  background: "rgba(244, 63, 94, 0.08)",
                  borderColor: "rgba(244, 63, 94, 0.15)",
                  color: "var(--accent-rose)",
                  padding: "10px 14px"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(244, 63, 94, 0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(244, 63, 94, 0.08)"}
                title="Clear Access Code"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="submit"
              className="glass-button"
              disabled={accessCodeInput.trim() === (localStorage.getItem(STORAGE_KEYS.ACCESS_CODE) || "")}
              style={{
                background: accessCodeSaved ? "var(--accent-emerald)" : "rgba(234,179,8,0.15)",
                borderColor: accessCodeSaved ? "var(--accent-emerald)" : "rgba(234,179,8,0.35)",
                color: accessCodeSaved ? "#fff" : "var(--accent-gold)",
              }}
            >
              {accessCodeSaved ? <Check size={16} /> : null}
              <span>{accessCodeSaved ? "Code Saved!" : "Save Access Code"}</span>
            </button>
          </div>
        </form>

      </div>

      {/* ── Upgrade / Plan ── */}
      {isSupabaseConfigured && (
        <UpgradePanel tier={tier} authUser={authUser ?? null} trialEndsAt={trialEndsAt} onTierChange={onTierChange} onSignIn={onSignIn} />
      )}

      {/* ── App Resources ── */}
      {/* ── Storage Management ── */}
      <StorageCleaner />

      <div className="glass-panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <Info size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0 }}>App Resources</h2>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
          <button
            onClick={() => onNavigate && onNavigate("rules")}
            className="glass-button"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(255,255,255,0.02)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <BookOpen size={20} color="var(--accent-purple)" />
              <span style={{ fontSize: "1rem", fontWeight: 500 }}>Quick Rules Reference</span>
            </div>
            <ExternalLink size={18} color="var(--text-muted)" />
          </button>

          <button
            onClick={() => onNavigate && onNavigate("guide")}
            className="glass-button"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(255,255,255,0.02)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <HelpCircle size={20} color="var(--accent-cyan)" />
              <span style={{ fontSize: "1rem", fontWeight: 500 }}>App Guide & Tutorials</span>
            </div>
            <ExternalLink size={18} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      {/* ── Legal / Fan Content Disclaimer ── */}
      <div style={{ padding: "16px 4px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
          Arbiter is not affiliated with or endorsed by Wizards of the Coast LLC.<br />
          Magic: The Gathering is © Wizards of the Coast LLC.<br />
          Card data provided by{" "}
          <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Scryfall</a>.
          AI answers may contain errors — verify rulings with an official judge for competitive play.<br />
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  );
};
