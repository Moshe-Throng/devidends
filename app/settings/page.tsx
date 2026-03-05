"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Settings,
  Eye,
  EyeOff,
  Bell,
  Mail,
  MessageCircle,
  Linkedin,
  Loader2,
  Check,
  AlertCircle,
  LogOut,
  Trash2,
  ExternalLink,
  ChevronRight,
  Shield,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { getProfile, updateProfile } from "@/lib/profiles";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import type { Profile } from "@/lib/database.types";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch profile
  useEffect(() => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    getProfile(supabase, user.id)
      .then((p) => {
        setProfile(p);
        if (p) setIsPublic(p.is_public);
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoadingProfile(false));
  }, [user]);

  const handleSaveVisibility = async () => {
    if (!user || !profile) return;
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const supabase = createSupabaseBrowser();
      const updated = await updateProfile(supabase, user.id, {
        is_public: isPublic,
      });
      setProfile(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <SiteHeader activeHref="/settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader activeHref="/settings" />

      {/* Hero */}
      <section className="relative bg-dark-900 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #27ABD2 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative max-w-2xl mx-auto px-6 py-12 lg:py-14">
          <div className="flex items-center gap-3 mb-4 animate-staggerFadeUp">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <span className="text-cyan-400 text-xs font-bold tracking-[0.2em] uppercase">
              Account
            </span>
          </div>
          <h1
            className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight animate-staggerFadeUp"
            style={{ animationDelay: "0.1s" }}
          >
            Settings
          </h1>
          <p
            className="mt-2 text-dark-300 text-sm lg:text-base max-w-lg animate-staggerFadeUp"
            style={{ animationDelay: "0.2s" }}
          >
            Manage your account preferences and profile visibility
          </p>
        </div>
      </section>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-6">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 animate-fadeInUp">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loadingProfile ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-dark-50 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* ── Notifications ─────────────────────────────── */}
            <div
              className="bg-white rounded-xl border border-dark-100 shadow-sm p-6 animate-fadeInUp"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center">
                  <Bell className="w-4.5 h-4.5 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-dark-900">
                    Notifications
                  </h2>
                  <p className="text-xs text-dark-400">
                    How you receive opportunity alerts
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-dark-50 pt-4">
                {/* Email */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-dark-400" />
                    <div>
                      <p className="text-sm font-semibold text-dark-700">
                        Email notifications
                      </p>
                      <p className="text-xs text-dark-400">
                        {profile?.email || user?.email || "No email set"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Active
                  </span>
                </div>

                {/* Telegram */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-4 h-4 text-dark-400" />
                    <div>
                      <p className="text-sm font-semibold text-dark-700">
                        Telegram notifications
                      </p>
                      <p className="text-xs text-dark-400">
                        {profile?.telegram_username
                          ? `@${profile.telegram_username}`
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  {profile?.telegram_username ? (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-dark-400 bg-dark-50 px-2.5 py-1 rounded-full border border-dark-100">
                      Not set
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-dark-400 mt-4">
                Manage your subscription preferences on the{" "}
                <Link
                  href="/subscribe"
                  className="text-cyan-600 font-semibold hover:text-cyan-700"
                >
                  Subscribe page
                </Link>
              </p>
            </div>

            {/* ── Linked Accounts ──────────────────────────── */}
            <div
              className="bg-white rounded-xl border border-dark-100 shadow-sm p-6 animate-fadeInUp"
              style={{ animationDelay: "0.15s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5 text-cyan-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-dark-900">
                    Linked Accounts
                  </h2>
                  <p className="text-xs text-dark-400">
                    Your connected accounts and contact info
                  </p>
                </div>
              </div>

              <div className="space-y-3 border-t border-dark-50 pt-4">
                {/* Email */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-dark-400" />
                    <div>
                      <p className="text-sm font-semibold text-dark-700">
                        Email
                      </p>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">
                        {profile?.email || user?.email || "Not set"}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/profile/edit"
                    className="text-xs text-cyan-600 font-semibold hover:text-cyan-700 flex items-center gap-1"
                  >
                    Edit <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* LinkedIn */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Linkedin className="w-4 h-4 text-dark-400" />
                    <div>
                      <p className="text-sm font-semibold text-dark-700">
                        LinkedIn
                      </p>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">
                        {profile?.linkedin_url || "Not connected"}
                      </p>
                    </div>
                  </div>
                  {profile?.linkedin_url ? (
                    <a
                      href={profile.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-600 font-semibold hover:text-cyan-700 flex items-center gap-1"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <Link
                      href="/profile/edit"
                      className="text-xs text-cyan-600 font-semibold hover:text-cyan-700 flex items-center gap-1"
                    >
                      Add <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                {/* Telegram */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-4 h-4 text-dark-400" />
                    <div>
                      <p className="text-sm font-semibold text-dark-700">
                        Telegram
                      </p>
                      <p className="text-xs text-dark-400">
                        {profile?.telegram_username
                          ? `@${profile.telegram_username}`
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/profile/edit"
                    className="text-xs text-cyan-600 font-semibold hover:text-cyan-700 flex items-center gap-1"
                  >
                    {profile?.telegram_username ? "Edit" : "Add"}{" "}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ── Sign Out ──────────────────────────────── */}
            <div
              className="bg-white rounded-xl border border-dark-100 shadow-sm p-6 animate-fadeInUp"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-dark-700">
                    Sign out
                  </p>
                  <p className="text-xs text-dark-400">
                    Sign out of your account on this device
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-200 text-sm font-semibold text-dark-600 hover:bg-dark-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>

            {/* ── Delete account (subtle) ─── */}
            <div className="text-center pt-4">
              <button
                onClick={() => setShowDeleteModal(true)}
                className="text-xs text-dark-300 hover:text-dark-500 transition-colors"
              >
                Need to delete your account?
              </button>
            </div>
          </>
        )}
      </main>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-dark-900/60 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-scaleReveal">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-lg font-extrabold text-dark-900">
                Delete Account
              </h3>
            </div>
            <p className="text-sm text-dark-500 mb-5 leading-relaxed">
              To delete your account and all associated data, please contact our
              support team:
            </p>
            <a
              href="mailto:devidendsteam@gmail.com?subject=Account%20Deletion%20Request"
              className="block w-full text-center px-5 py-3 rounded-xl bg-dark-900 text-white text-sm font-bold hover:bg-dark-800 transition-colors mb-3"
            >
              Email devidendsteam@gmail.com
            </a>
            <button
              onClick={() => setShowDeleteModal(false)}
              className="w-full text-sm text-dark-400 hover:text-dark-600 transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
