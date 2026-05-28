import React, { useState } from "react";
import { X, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { signInWithEmail, signUpWithEmail, resetPassword } from "../services/auth";
import type { AuthUser } from "../services/auth";

type Mode = "signin" | "signup" | "forgot";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccessMsg(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === "signup") {
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const result = await signInWithEmail(email, password);
        if (result.error) { setError(result.error); return; }
        if (result.user) { onSuccess(result.user); onClose(); }
      } else if (mode === "signup") {
        const result = await signUpWithEmail(email, password);
        if (result.error) { setError(result.error); return; }
        if (result.user) {
          // Anonymous session was upgraded — already signed in, just close
          onSuccess(result.user);
          onClose();
          return;
        }
        // Fresh signup — needs email confirmation before signing in
        setSuccessMsg("Account created! Check your email to confirm, then sign in.");
        switchMode("signin");
      } else {
        const result = await resetPassword(email);
        if (result.error) { setError(result.error); return; }
        setSuccessMsg("Password reset email sent. Check your inbox.");
      }
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password";
  const subtitle =
    mode === "signin" ? "Your decks and game history sync across devices." :
    mode === "signup" ? "Free account — save decks and history across devices." :
    "Enter your email and we'll send a reset link.";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="glass-panel"
        style={{ width: "100%", maxWidth: "420px", padding: "32px", display: "flex", flexDirection: "column", gap: "22px", position: "relative" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          {mode === "forgot" && (
            <button
              onClick={() => switchMode("signin")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px 4px 0 0", display: "flex", flexShrink: 0, marginTop: "3px" }}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{title}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.4 }}>{subtitle}</p>
          </div>
        </div>

        {/* Feedback banners */}
        {successMsg && (
          <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "8px", padding: "12px 14px", color: "var(--accent-emerald)", fontSize: "0.88rem", lineHeight: 1.5 }}>
            {successMsg}
          </div>
        )}
        {error && (
          <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "8px", padding: "12px 14px", color: "var(--accent-rose)", fontSize: "0.88rem", lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
              <Mail size={13} color="var(--accent-cyan)" /> Email
            </label>
            <input
              type="email"
              className="glass-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {/* Password */}
          {mode !== "forgot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                <Lock size={13} color="var(--accent-purple)" /> Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="glass-input"
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  style={{ width: "100%", paddingRight: "44px", boxSizing: "border-box" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: "4px" }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}

          {/* Confirm password */}
          {mode === "signup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                <Lock size={13} color="var(--accent-purple)" /> Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                className="glass-input"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Forgot password link */}
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-cyan)", fontSize: "0.82rem", textAlign: "right", padding: 0, marginTop: "-6px" }}
            >
              Forgot password?
            </button>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="glass-button"
            disabled={loading}
            style={{
              background: "var(--accent-purple)", borderColor: "var(--accent-purple)",
              color: "#fff", padding: "12px", fontSize: "0.95rem", fontWeight: 600,
              marginTop: "4px", justifyContent: "center", opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? "Please wait…"
              : mode === "signin" ? "Sign In"
              : mode === "signup" ? "Create Account"
              : "Send Reset Link"}
          </button>
        </form>

        {/* Mode toggle */}
        {mode !== "forgot" && (
          <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", paddingTop: "16px", margin: 0 }}>
            {mode === "signin" ? (
              <>No account?{" "}
                <button onClick={() => switchMode("signup")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-purple)", fontWeight: 600, fontSize: "0.85rem", padding: 0 }}>
                  Create one free
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => switchMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-purple)", fontWeight: 600, fontSize: "0.85rem", padding: 0 }}>
                  Sign in
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
};
