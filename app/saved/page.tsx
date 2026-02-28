"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Calendar,
  Building2,
  ExternalLink,
  Trash2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

interface SavedJob {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  opportunity_org: string;
  opportunity_deadline: string | null;
  opportunity_url: string;
  saved_at: string;
  notes: string | null;
}

export default function SavedJobsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/saved-jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.saved || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, authLoading, router]);

  async function handleRemove(oppId: string) {
    setRemoving(oppId);
    await fetch(`/api/saved-jobs?id=${oppId}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.opportunity_id !== oppId));
    setRemoving(null);
  }

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-dark-900 tracking-tight">
            Saved Opportunities
          </h1>
          <p className="mt-2 text-dark-400 text-sm">
            Your bookmarked jobs, tenders, and consulting opportunities.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <Bookmark className="w-14 h-14 text-dark-200 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-dark-700 mb-2">
              No saved opportunities yet
            </h2>
            <p className="text-sm text-dark-400 mb-6 max-w-sm mx-auto">
              Browse opportunities and click the bookmark icon to save them here
              for later.
            </p>
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
            >
              Browse Opportunities
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="group flex items-start gap-4 p-5 rounded-2xl border border-dark-100 hover:border-cyan-200 hover:shadow-md hover:shadow-cyan-500/5 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/opportunities/${job.opportunity_id}`}
                    className="text-base font-bold text-dark-900 hover:text-cyan-600 transition-colors line-clamp-1"
                  >
                    {job.opportunity_title}
                  </Link>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-dark-400">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {job.opportunity_org}
                    </span>
                    {job.opportunity_deadline && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(job.opportunity_deadline).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </span>
                    )}
                    <span className="text-dark-300">
                      Saved{" "}
                      {new Date(job.saved_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {job.opportunity_url && (
                    <a
                      href={job.opportunity_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-dark-300 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                      title="View original"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(job.opportunity_id)}
                    disabled={removing === job.opportunity_id}
                    className="p-2 rounded-lg text-dark-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove"
                  >
                    {removing === job.opportunity_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            <p className="text-center text-xs text-dark-300 pt-4">
              {jobs.length} saved {jobs.length === 1 ? "opportunity" : "opportunities"}
            </p>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
