import React, { useState, useEffect } from "react";
import { Settings, Shield, Key, Check, Info, Trash2, Moon, Sun } from "lucide-react";

interface SettingsPanelProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  theme?: "dark" | "light";
  setTheme?: (t: "dark" | "light") => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ apiKey, setApiKey, theme = "dark", setTheme }) => {
  // Initialize directly to avoid setState-in-effect lint warnings
  const [keyInput, setKeyInput] = useState(() => apiKey);
  const [saved, setSaved] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("nexus_judge_gemini_model") || "gemini-1.5-flash"
  );
  const [testingModels, setTestingModels] = useState(false);

  // Sync keyInput if the parent apiKey prop changes (e.g. key cleared externally)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeyInput(apiKey);
  }, [apiKey]);

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

      {/* ── Theme Toggle ── */}
      {setTheme && (
        <div className="glass-panel" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {theme === "dark" ? <Moon size={18} color="var(--accent-purple)" /> : <Sun size={18} color="var(--accent-gold)" />}
            <div>
              <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>Appearance</p>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {theme === "dark" ? "Dark mode active" : "Light mode active"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => setTheme("dark")}
              aria-label="Dark mode"
              title="Switch to dark mode"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                fontWeight: 600, fontSize: "0.82rem",
                background: theme === "dark" ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${theme === "dark" ? "rgba(139,92,246,0.45)" : "rgba(255,255,255,0.08)"}`,
                color: theme === "dark" ? "var(--accent-purple)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              onClick={() => setTheme("light")}
              aria-label="Light mode"
              title="Switch to light mode"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 14px", borderRadius: "8px", cursor: "pointer",
                fontWeight: 600, fontSize: "0.82rem",
                background: theme === "light" ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${theme === "light" ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: theme === "light" ? "var(--accent-gold)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
            >
              <Sun size={14} /> Light
            </button>
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
                    {selectedModel !== "gemini-1.5-flash" && <option value="gemini-1.5-flash">gemini-1.5-flash</option>}
                    {selectedModel !== "gemini-1.5-pro" && <option value="gemini-1.5-pro">gemini-1.5-pro</option>}
                    {selectedModel !== "gemini-pro" && <option value="gemini-pro">gemini-pro (Legacy)</option>}
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
              disabled={!keyInput.trim() || (keyInput.trim() === apiKey && selectedModel === (localStorage.getItem("nexus_judge_gemini_model") || "gemini-1.5-flash"))}
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
    </div>
  );
};
