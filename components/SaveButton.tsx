"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

interface SaveButtonProps {
  opportunityId: string;
  opportunityTitle: string;
  opportunityOrg: string;
  opportunityDeadline?: string | null;
  opportunityUrl: string;
  variant?: "icon" | "button";
}

export function SaveButton({
  opportunityId,
  opportunityTitle,
  opportunityOrg,
  opportunityDeadline,
  opportunityUrl,
  variant = "icon",
}: SaveButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if already saved
  useEffect(() => {
    if (!user) return;

    fetch("/api/saved-jobs")
      .then((r) => r.json())
      .then((data) => {
        const ids = (data.saved || []).map(
          (s: { opportunity_id: string }) => s.opportunity_id
        );
        setSaved(ids.includes(opportunityId));
      })
      .catch(() => {});
  }, [user, opportunityId]);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push("/login");
      return;
    }

    setLoading(true);

    if (saved) {
      // Unsave
      await fetch(`/api/saved-jobs?id=${opportunityId}`, { method: "DELETE" });
      setSaved(false);
    } else {
      // Save
      await fetch("/api/saved-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          opportunity_title: opportunityTitle,
          opportunity_org: opportunityOrg,
          opportunity_deadline: opportunityDeadline,
          opportunity_url: opportunityUrl,
        }),
      });
      setSaved(true);
    }

    setLoading(false);
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`p-2 rounded-lg transition-all ${
          saved
            ? "text-cyan-600 bg-cyan-50 hover:bg-cyan-100"
            : "text-dark-300 hover:text-cyan-500 hover:bg-dark-50"
        }`}
        title={saved ? "Remove from saved" : "Save opportunity"}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Bookmark
            className={`w-4 h-4 ${saved ? "fill-current" : ""}`}
          />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        saved
          ? "bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100"
          : "bg-white text-dark-600 border border-dark-200 hover:border-cyan-300 hover:text-cyan-700"
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Bookmark className={`w-4 h-4 ${saved ? "fill-current" : ""}`} />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
