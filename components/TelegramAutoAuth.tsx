"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./AuthProvider";

/**
 * TelegramAutoAuth
 *
 * Mounted at the root layout level. Runs once on mount and checks whether the
 * user is inside Telegram (window.Telegram.WebApp.initData present). If so,
 * and if they are NOT already logged in via Supabase, it silently exchanges
 * their Telegram identity for a real Supabase session — no UI, no redirects.
 *
 * This allows Telegram users to access the full web experience when they click
 * links from the bot or mini app, without having to create a web account.
 */
export function TelegramAutoAuth() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Wait for auth state to settle before checking
    if (loading) return;

    // Already logged in — nothing to do
    if (user) return;

    async function tryTelegramAuth() {
      try {
        // Only available inside Telegram
        const twa = (window as any).Telegram?.WebApp;
        const initData: string | undefined = twa?.initData;
        if (!initData || initData.length === 0) return;

        // Exchange initData for a Supabase session token
        const res = await fetch("/api/auth/telegram-web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });

        if (!res.ok) return; // Silent fail — don't disrupt the page

        const { token_hash } = await res.json();
        if (!token_hash) return;

        // Redeem the magic link token to create a Supabase session
        const supabase = createSupabaseBrowser();
        await supabase.auth.verifyOtp({ token_hash, type: "email" });

        // AuthProvider's onAuthStateChange listener will pick up the new session
      } catch {
        // Silent fail — Telegram auth is best-effort on the web
      }
    }

    tryTelegramAuth();
  }, [loading, user]);

  return null; // No UI
}
