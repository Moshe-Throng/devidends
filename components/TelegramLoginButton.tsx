"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

const BOT_USERNAME = "Devidends_Bot";

interface TgAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Renders Telegram's official login widget. On successful widget auth:
 *  1. POST payload → /api/auth/telegram-login (verify + create/find user)
 *  2. Server returns a magic-link token_hash
 *  3. Client calls supabase.auth.verifyOtp({ type: "magiclink", token_hash })
 *     which establishes a real Supabase session.
 *  4. Redirect to /profile.
 *
 * Setup required (one-time):
 *   - In @BotFather, /setdomain for @Devidends_Bot → devidends.net
 *   - That's it. No API keys, no app registration.
 */
export function TelegramLoginButton({ onError }: { onError?: (msg: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Register the callback globally so the widget can reach it
    (window as any).onTelegramAuth = async (user: TgAuthData) => {
      try {
        const res = await fetch("/api/auth/telegram-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const d = await res.json();
        if (!res.ok || !d.token_hash) {
          onError?.(d.error || "Telegram login failed");
          return;
        }

        // Exchange the magic-link token for a real session
        const supa = createSupabaseBrowser();
        const { error } = await supa.auth.verifyOtp({
          type: "magiclink",
          token_hash: d.token_hash,
        });
        if (error) {
          onError?.(error.message);
          return;
        }
        window.location.href = "/profile";
      } catch (e: any) {
        onError?.(e.message || "Telegram login failed");
      }
    };

    // Inject the widget script
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
      delete (window as any).onTelegramAuth;
    };
  }, [onError]);

  return <div ref={containerRef} className="flex justify-center" />;
}
