"use client";

import { useState } from "react";

interface Props {
  token: string;
  prefilledEmail?: string;
  isRecommender: boolean;
}

export default function ClaimEmailForm({ token, prefilledEmail, isRecommender }: Props) {
  const [email, setEmail] = useState(prefilledEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/claim/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Couldn't send the link. Please try again.");
        return;
      }
      setSentTo(email.trim());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 text-center">
        <p className="text-base font-bold text-green-800 mb-1">✓ Magic link sent</p>
        <p className="text-sm text-green-700">
          Check <b>{sentTo}</b> — tap the link to claim and land in the Hub. The link
          works for ten minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs font-bold text-dark-500 uppercase tracking-[0.15em] mb-2">
          Continue with email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={isRecommender ? "you@example.com" : "your email"}
          className="w-full px-4 py-3 border-2 border-dark-100 rounded-xl text-base focus:outline-none focus:border-cyan-400 transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-3.5 rounded-xl font-bold text-dark-900 border-2 border-dark-200 hover:border-dark-400 hover:bg-dark-50 transition-colors disabled:opacity-60"
      >
        {submitting ? "Sending…" : "✉️ Email me a magic link"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </form>
  );
}
