import React, { useState, useEffect } from "react";
import { Settings, Shield, Key, Check, Info, Trash2, Palette, Lock, User2, Link2, BookOpen, HelpCircle, ExternalLink, LogIn, LogOut } from "lucide-react";
import { THEMES } from "../constants/themes";
import type { ThemeId } from "../constants/themes";
import type { TabId } from "../constants/tabIds";
import { upsertProfile, getDisplayName } from "../services/auth";
import type { AuthUser } from "../services/auth";
import { isSupabaseConfigured } from "../services/supabase";
import { STORAGE_KEYS } from "../constants/storageKeys";

interface SettingsPanelProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  theme?: ThemeId;
  setTheme?: (t: ThemeId) => void;
  authUser?: AuthUser | null;
  onLinkGoogle?: () => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onNavigate?: (tab: TabId) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ apiKey, setApiKey, theme = "void", setTheme, authUser, onLinkGoogle, onSignIn, onSignOut, onNavigate }) => {
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
                {onLinkGoogle && authUser && (
                  <button
                    onClick={onLinkGoogle}
                    className="glass-button"
                    style={{ padding: "10px 16px", fontSize: "0.88rem", background: "rgba(66,133,244,0.08)", borderColor: "rgba(66,133,244,0.25)", color: "#4285F4" }}
                  >
                    <Link2 size={14} />
                    <span>Link Google</span>
                  </button>
                )}
              </div>
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

      {/* ── App Resources ── */}
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
    </div>
  );
};
