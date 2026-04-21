"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[cc/dashboard]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#0f1117] font-[Montserrat] text-[#c8ccd4] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-xs tracking-widest uppercase font-bold text-[#27ABD2] mb-2">Something broke</div>
        <h1 className="text-2xl font-bold text-[#e0e2e7] mb-3">Couldn&apos;t load your dashboard</h1>
        <pre className="text-xs text-[#8b95a5] bg-[#161923] border border-[#1e2130] rounded-lg p-4 text-left whitespace-pre-wrap mb-4 max-h-48 overflow-auto">
          {error.message || "Unknown error"}
          {error.digest && `\n\ndigest: ${error.digest}`}
        </pre>
        <button onClick={reset} className="bg-[#27ABD2] hover:bg-[#1e98bd] text-white text-sm font-bold px-4 py-2 rounded-lg">
          Try again
        </button>
      </div>
    </main>
  );
}
