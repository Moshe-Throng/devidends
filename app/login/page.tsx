"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

// Telegram Login Widget callback — called by Telegram's JS widget
declare global {
  interface Window {
    onTelegramAuthCallback?: (user: Record<string, unknown>) => void;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </main>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function TelegramLoginButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername) return;

    // Register global callback for Telegram widget
    window.onTelegramAuthCallback = async (user) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/auth/telegram-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Auth failed");

        const supabase = createSupabaseBrowser();
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: "email",
        });
        if (verifyErr) throw verifyErr;

        router.push("/opportunities");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Telegram login failed");
        setLoading(false);
      }
    };

    // Inject Telegram Login Widget script
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuthCallback(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    const container = document.getElementById("tg-widget-container");
    if (container) {
      container.innerHTML = "";
      container.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuthCallback;
    };
  }, [botUsername, router]);

  if (!botUsername) {
    // Fallback: link to Telegram bot directly
    return (
      <a
        href="https://t.me/devidends_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border border-dark-200 text-dark-700 font-semibold text-sm transition-all hover:bg-dark-50 hover:border-dark-300"
      >
        <Send className="w-5 h-5 text-[#27A7E7]" />
        Continue with Telegram
      </a>
    );
  }

  return (
    <div>
      {loading && (
        <div className="flex items-center justify-center gap-2 py-3.5 text-sm text-dark-500">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
          Signing you in...
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2 mb-2">
          {error}
        </p>
      )}
      <div id="tg-widget-container" className={loading ? "opacity-40 pointer-events-none" : ""} />
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (mode === "forgot") {
      const { error: err } = await resetPassword(email);
      if (err) {
        setError(err);
      } else {
        setSuccessMsg("Password reset link sent! Check your email inbox.");
      }
    } else if (mode === "login") {
      const { error: err } = await signInWithEmail(email, password);
      if (err) {
        setError(err);
      } else {
        router.push("/opportunities");
      }
    } else {
      const { error: err } = await signUpWithEmail(email, password);
      if (err) {
        setError(err);
      } else {
        setSuccessMsg("Check your email for a confirmation link, then log in.");
      }
    }

    setLoading(false);
  }

  function switchMode(newMode: "login" | "signup" | "forgot") {
    setMode(newMode);
    setError("");
    setSuccessMsg("");
  }

  const heading =
    mode === "forgot"
      ? "Reset your password"
      : mode === "login"
      ? "Welcome back"
      : "Create your account";

  const subtext =
    mode === "forgot"
      ? "Enter your email and we'll send you a reset link"
      : mode === "login"
      ? "Sign in to save opportunities and track your applications"
      : "Join to save jobs, track deadlines, and get personalized alerts";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader />

      <main className="flex-1 flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-dark-900 tracking-tight">
              {heading}
            </h1>
            <p className="mt-2 text-dark-400 text-sm">{subtext}</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl border border-dark-100 p-8 shadow-sm">
            {/* Telegram login — hidden in forgot mode */}
            {mode !== "forgot" && (
              <>
                <TelegramLoginButton />

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dark-100" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-dark-300 font-medium uppercase tracking-wider">
                      or sign in with email
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Back to login — forgot mode only */}
            {mode === "forgot" && (
              <button
                onClick={() => switchMode("login")}
                className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-600 font-medium mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </button>
            )}

            {/* Email form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-dark-500 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-dark-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-dark-300"
                    required
                  />
                </div>
              </div>

              {/* Password — hidden in forgot mode */}
              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-dark-500 uppercase tracking-wider">
                      Password
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-xs text-cyan-600 font-semibold hover:text-cyan-700"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-dark-300" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-12 py-3 rounded-xl border border-dark-100 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 placeholder:text-dark-300"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-dark-500"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 font-medium bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {successMsg && (
                <p className="text-sm text-emerald-700 font-medium bg-emerald-50 rounded-lg px-3 py-2">
                  {successMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm transition-all duration-300 hover:from-cyan-600 hover:to-teal-600 hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {mode === "forgot"
                      ? "Send Reset Link"
                      : mode === "login"
                      ? "Sign In"
                      : "Create Account"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Toggle mode */}
            {mode !== "forgot" && (
              <p className="text-center text-sm text-dark-400 mt-6">
                {mode === "login" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      onClick={() => switchMode("signup")}
                      className="text-cyan-600 font-semibold hover:text-cyan-700"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => switchMode("login")}
                      className="text-cyan-600 font-semibold hover:text-cyan-700"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Privacy note */}
          <p className="text-center text-xs text-dark-300 mt-5">
            By signing up you agree to our{" "}
            <Link href="#" className="underline hover:text-dark-500">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="#" className="underline hover:text-dark-500">
              Privacy Policy
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
