"use client";

import { useState } from "react";
import { setAccessToken } from "@/lib/client/apiSession";

type Mode = "signin" | "signup";

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-white/8 border border-white/15 text-white placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 focus:border-uri-keaney/50 focus:bg-white/10 transition-all";
const labelClass = "block text-xs font-medium text-white/70 uppercase tracking-wider mb-2";

export function AuthScreen({ onComplete }: { onComplete: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim().toLowerCase();
    const p = password.trim();
    if (!u || !p) {
      setError("Enter your student email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) {
      setError("Use your email address to sign in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: u, password: p }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error?.message ?? "Sign in failed.");
        return;
      }
      const accessToken = payload?.data?.session?.access_token;
      if (!accessToken) {
        setError("Missing access token from login response.");
        return;
      }
      setAccessToken(accessToken);
      onComplete();
    } catch {
      setError("Could not reach the backend. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const eVal = email.trim().toLowerCase();
    const p = password.trim();
    if (!eVal || !p) {
      setError("Enter your email and password.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eVal)) {
      setError("Enter a valid email address.");
      return;
    }
    if (p.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: eVal, password: p }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error?.message ?? "Sign up failed.");
        return;
      }
      const accessToken = payload?.data?.session?.access_token;
      if (accessToken) {
        setAccessToken(accessToken);
      }
      onComplete();
    } catch {
      setError("Could not reach the backend. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-10 sm:py-14">
      {/* Subtle background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(104, 171, 232, 0.08) 0%, transparent 50%)",
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-full max-w-[200px] sm:max-w-[220px] h-auto mb-4">
            <img
              src="/campusquest-logo.png"
              alt="CampusQuest"
              className="w-full h-auto object-contain drop-shadow-[0_0_20px_rgba(104,171,232,0.2)]"
            />
          </div>
          <p className="text-uri-keaney/80 text-xs font-medium tracking-[0.2em] uppercase">
            URI · Level up for real
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-xl shadow-black/20 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                mode === "signin"
                  ? "text-uri-keaney bg-uri-keaney/10 border-b-2 border-uri-keaney"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                mode === "signup"
                  ? "text-uri-keaney bg-uri-keaney/10 border-b-2 border-uri-keaney"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              Sign up
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {mode === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-5">
                <div>
                  <label htmlFor="auth-username" className={labelClass}>
                    Student email
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    autoComplete="username email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. you@uri.edu"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="auth-password-signin" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="auth-password-signin"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
                {error && (
                  <p className="text-xs text-amber-400/90 bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-uri-keaney text-white font-semibold text-sm hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors shadow-lg shadow-uri-keaney/20"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <label htmlFor="auth-email" className={labelClass}>
                    Student email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@uri.edu"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="auth-password-signup" className={labelClass}>
                    Password
                  </label>
                  <input
                    id="auth-password-signup"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className={inputClass}
                  />
                </div>
                {error && (
                  <p className="text-xs text-amber-400/90 bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-uri-keaney text-white font-semibold text-sm hover:bg-uri-keaney/90 focus:outline-none focus:ring-2 focus:ring-uri-keaney focus:ring-offset-2 focus:ring-offset-uri-navy transition-colors shadow-lg shadow-uri-keaney/20"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          Sign in with your campus credentials to track progress and earn XP.
        </p>
      </div>
    </div>
  );
}
