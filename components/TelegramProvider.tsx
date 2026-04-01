"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Profile } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramContextType {
  /** Telegram user identity (from initData) */
  tgUser: TelegramUser | null;
  /** Devidends profile linked to this Telegram user */
  profile: Profile | null;
  /** True while verifying initData and loading profile */
  loading: boolean;
  /** Error message if verification failed */
  error: string | null;
  /** Whether we're running inside a Telegram Mini App */
  isTelegram: boolean;
  /** Re-fetch the profile after edits */
  refreshProfile: () => Promise<void>;
}

const TelegramContext = createContext<TelegramContextType>({
  tgUser: null,
  profile: null,
  loading: true,
  error: null,
  isTelegram: false,
  refreshProfile: async () => {},
});

export function useTelegram() {
  return useContext(TelegramContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTelegram, setIsTelegram] = useState(false);
  const [initDataRaw, setInitDataRaw] = useState<string | null>(null);

  // Step 1: Initialize Telegram SDK and extract initData
  useEffect(() => {
    async function initTelegram() {
      try {
        // Dynamic import to avoid SSR issues
        const sdk = await import("@telegram-apps/sdk");

        // Check if we're in a Telegram environment
        if (sdk.isSSR() || typeof window === "undefined") {
          setLoading(false);
          return;
        }

        // Try to detect Telegram environment
        let inTelegram = false;
        try {
          inTelegram = sdk.isTMA();
        } catch {
          // isTMA can throw if environment is unknown
        }
        if (!inTelegram) {
          setLoading(false);
          return;
        }

        setIsTelegram(true);

        // Initialize the SDK
        sdk.init();

        // Expand viewport to full height
        try {
          const viewport = sdk.viewport;
          if (viewport.mount.isAvailable()) {
            await viewport.mount();
            if (viewport.expand.isAvailable()) {
              viewport.expand();
            }
          }
        } catch {
          // Viewport expansion is optional
        }

        // Retrieve raw initData for server verification
        const rawInitData = sdk.retrieveRawInitData();
        if (rawInitData) {
          setInitDataRaw(rawInitData);
          // Store for use by profile edit page
          try { sessionStorage.setItem("tg_init_data", rawInitData); } catch {}
        }

        // Extract user from launch params for immediate display
        try {
          const launchParams = sdk.retrieveLaunchParams(true);
          const initData = launchParams.initData as Record<string, any>;
          if (initData?.user) {
            const u = initData.user;
            setTgUser({
              id: u.id,
              first_name: u.firstName || u.first_name,
              last_name: u.lastName || u.last_name,
              username: u.username,
              language_code: u.languageCode || u.language_code,
              is_premium: u.isPremium || u.is_premium,
              photo_url: u.photoUrl || u.photo_url,
            });
          }
        } catch {
          // Launch params extraction is optional — server verify will handle it
        }
      } catch (err) {
        console.warn("[TelegramProvider] Init failed:", err);
        setLoading(false);
      }
    }

    initTelegram();
  }, []);

  // Step 2: Verify initData on server and get/create profile
  useEffect(() => {
    if (!initDataRaw) return;

    async function verify() {
      try {
        const res = await fetch("/api/telegram/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initDataRaw }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Verification failed");
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.user) {
          setTgUser(data.user);
        }
        if (data.profile) {
          setProfile(data.profile);

          // Process referral if present (from t.me/bot?start=ref_XXXX or ?ref=XXXX)
          try {
            const refFromUrl = new URLSearchParams(window.location.search).get("ref");
            const startParam = new URLSearchParams(initDataRaw || "").get("start_param");
            const refCode = refFromUrl || (startParam?.startsWith("ref_") ? startParam.slice(4) : null);
            if (refCode && !data.profile.referred_by) {
              fetch("/api/referral", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  referral_code: refCode,
                  referred_telegram_id: String(data.user.id),
                }),
              }).catch(() => {});
            }
          } catch {}
        }
        if (data.profileError) {
          console.warn("[TelegramProvider] Profile creation issue:", data.profileError);
        }
      } catch (err) {
        console.error("[TelegramProvider] Verify error:", err);
        setError("Connection error");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [initDataRaw]);

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    if (!initDataRaw) return;

    try {
      const res = await fetch("/api/telegram/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initDataRaw }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (err) {
      console.error("[TelegramProvider] Refresh error:", err);
    }
  }, [initDataRaw]);

  return (
    <TelegramContext.Provider
      value={{ tgUser, profile, loading, error, isTelegram, refreshProfile }}
    >
      {children}
    </TelegramContext.Provider>
  );
}
