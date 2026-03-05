"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, UserCircle, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { getProfile } from "@/lib/profiles";

const DISMISS_KEY = "devidends_onboarding_dismissed";
const EXCLUDED_PATHS = ["/profile/edit", "/login", "/signup", "/tg-app"];

/**
 * Shows a sticky bottom banner prompting users to complete their profile
 * when they sign in but have a low profile score (< 40%).
 * Dismissible per session.
 */
export function ProfileOnboarding() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    if (loading || !user) return;
    // Don't show on excluded paths
    if (EXCLUDED_PATHS.some((p) => pathname.startsWith(p))) return;
    // Don't show if dismissed this session
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const supabase = createSupabaseBrowser();
    getProfile(supabase, user.id)
      .then((profile) => {
        if (!profile) {
          // No profile at all — prompt to create
          setMissingFields(["name", "headline", "sectors"]);
          setShow(true);
          return;
        }

        setProfileName(profile.name || null);

        // Calculate what's missing
        const missing: string[] = [];
        if (!profile.name?.trim()) missing.push("Name");
        if (!profile.headline?.trim()) missing.push("Title / Headline");
        if (!profile.sectors?.length) missing.push("Sectors of expertise");
        if (!profile.countries?.length) missing.push("Countries of experience");
        if (!profile.skills?.length || profile.skills.length < 3)
          missing.push("Skills");
        if (!profile.years_of_experience) missing.push("Years of experience");

        // Only show if 3+ fields missing (profile < ~40%)
        if (missing.length >= 3) {
          setMissingFields(missing);
          setShow(true);
        }
      })
      .catch(() => {
        // Silent fail
      });
  }, [user, loading, pathname]);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 animate-slideUp">
      <div className="max-w-2xl mx-auto px-4 pb-4">
        <div className="relative bg-white rounded-2xl shadow-2xl shadow-dark-900/10 border border-dark-100 p-5">
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1 rounded-lg text-dark-300 hover:text-dark-500 hover:bg-dark-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shrink-0">
              <UserCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-dark-900">
                {profileName
                  ? `Welcome back, ${profileName.split(" ")[0]}!`
                  : "Complete your profile"}
              </h3>
              <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">
                Fill in your profile to get personalized opportunity matches and
                unlock CV scoring.
                {missingFields.length > 0 && (
                  <span className="text-dark-500">
                    {" "}
                    Missing: {missingFields.slice(0, 3).join(", ")}
                    {missingFields.length > 3 && ` +${missingFields.length - 3} more`}
                  </span>
                )}
              </p>
              <Link
                href="/profile/edit"
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg bg-dark-900 text-white text-xs font-bold hover:bg-dark-800 transition-colors"
              >
                Complete Profile
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
