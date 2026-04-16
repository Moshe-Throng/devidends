"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  invite_token: string;
  member_number: number | null;
  status: string;
  invited_at: string;
  joined_at: string | null;
  preferred_channel: string | null;
  ask_frequency: string | null;
  preferred_sectors: string[] | null;
  interests: string[] | null;
  email: string | null;
  whatsapp_number: string | null;
  profile_id: string | null;
};

export default function AdminCoCreators() {
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await fetch("/api/co-creators/admin");
    const d = await r.json();
    setMembers(d.members || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createInvite() {
    if (!newName.trim()) return;
    setCreating(true);
    const r = await fetch("/api/co-creators/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await r.json();
    setCreating(false);
    if (d.error) {
      alert(d.error);
      return;
    }
    setNewName("");
    load();
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://devidends.net";

  return (
    <main className="min-h-screen bg-[#f7f9fb] font-[Montserrat] p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#212121]">Devidends Co-Creators</h1>
          <div className="text-sm text-[#666]">{members.length} invited · {members.filter(m=>m.status==="joined").length} joined</div>
        </div>

        <div className="bg-white border border-[#e5e9ed] rounded-lg p-5 mb-6 flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name (e.g. Mussie Tsegaye)"
            className="flex-1 border border-[#d5dade] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#27ABD2]"
          />
          <button onClick={createInvite} disabled={creating} className="bg-[#27ABD2] hover:bg-[#1e98bd] disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-md text-sm">
            {creating ? "Creating…" : "Generate invite"}
          </button>
        </div>

        {loading ? (
          <div className="text-[#666] text-sm">Loading…</div>
        ) : (
          <div className="bg-white border border-[#e5e9ed] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f7f9fb] text-xs uppercase tracking-wider text-[#666]">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Channel</th>
                  <th className="px-4 py-3 text-left">Invite link</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const url = `${origin}/cc/${m.invite_token}`;
                  return (
                    <tr key={m.id} className="border-t border-[#e5e9ed]">
                      <td className="px-4 py-3 text-[#666]">{m.member_number || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-[#212121] font-medium">{m.name}</div>
                        {m.joined_at && (
                          <div className="text-xs text-[#888]">
                            {m.preferred_sectors?.slice(0, 2).join(", ")}
                            {m.interests?.length ? ` · ${m.interests.length} interests` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          m.status === "joined" ? "bg-[#27ABD2]/15 text-[#1e98bd]" :
                          m.status === "declined" ? "bg-red-100 text-red-700" :
                          "bg-[#f0f0f0] text-[#666]"
                        }`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#666]">
                        {m.preferred_channel ? `${m.preferred_channel} · ${m.ask_frequency}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-[#f7f9fb] px-2 py-1 rounded text-[#444]">{m.invite_token}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(url); alert("Copied"); }}
                            className="text-xs text-[#27ABD2] hover:underline"
                          >
                            Copy link
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
