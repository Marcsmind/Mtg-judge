import React, { useState } from "react";
import { X, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { signInWithEmail, signUpWithEmail, resetPassword, signInWithApple, signInWithGoogle } from "../services/auth";
import type { AuthUser } from "../services/auth";
import { track, identify } from "../services/analytics";

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

    if (!email.trim() || !email.includes("@") || !email.includes(".")) {
      setError("Enter a valid email address."); return;
    }
    if (mode === "signup") {
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const result = await signInWithEmail(email, password);
        if (result.error) { setError(result.error); return; }
        if (result.user) {
          track("account_signed_in");
          identify(result.user.id, { email: result.user.email });
          onSuccess(result.user);
          onClose();
        }
      } else if (mode === "signup") {
        const result = await signUpWithEmail(email, password);
        if (result.error) { setError(result.error); return; }
        if (result.user) {
          // Anonymous session was upgraded — already signed in, just close
          track("account_created");
          identify(result.user.id, { email: result.user.email });
          onSuccess(result.user);
          onClose();
          return;
        }
        // Fresh signup — needs email confirmation before signing in
        track("account_created");
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
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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

        {/* Social sign-in */}
        {mode !== "forgot" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>or continue with</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
            </div>
            {/* Apple */}
            <button
              type="button"
              onClick={async () => { const err = await signInWithApple(); if (err) setError(err); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                padding: "11px 16px", borderRadius: "10px", cursor: "pointer",
                background: "#fff", border: "1px solid rgba(255,255,255,0.15)",
                color: "#000", fontSize: "0.92rem", fontWeight: 600, width: "100%",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 814 1000" fill="#000" xmlns="http://www.w3.org/2000/svg">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-42.5-150.5-109.5C77 477.7 54.7 324.1 54.7 276.1c0-167.8 109.6-256.5 217.4-256.5 63 0 115.5 41.6 155.5 41.6s98.4-43.7 168.9-43.7c27.4 0 121.9 2.6 196.2 83.4zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
              </svg>
              Sign in with Apple
            </button>
            {/* Google */}
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                padding: "11px 16px", borderRadius: "10px", cursor: "pointer",
                background: "#fff", border: "1px solid rgba(255,255,255,0.15)",
                color: "#000", fontSize: "0.92rem", fontWeight: 600, width: "100%",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}

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
