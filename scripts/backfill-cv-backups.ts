/**
 * Backfill: re-download every telegram_ingest profile's CV via its stored
 * tg://<file_id> and upload to Supabase Storage at
 * cv-downloads/tg-ingest/<YYYY-MM-DD>/<file_id>.<ext>.
 *
 * Skips profiles where the backup already exists.
 *
 * Usage:
 *   npx tsx scripts/backfill-cv-backups.ts           (dry run — count + first 5)
 *   npx tsx scripts/backfill-cv-backups.ts --apply   (apply)
 *   npx tsx scripts/backfill-cv-backups.ts --apply --limit 20
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim(), v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const APPLY = process.argv.includes("--apply");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] || "0", 10) : 0;

async function getFileLink(botToken: string, fileId: string): Promise<{ url: string; fileName: string } | null> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  if (!res.ok) return null;
  const d: any = await res.json();
  if (!d.ok || !d.result?.file_path) return null;
  return {
    url: `https://api.telegram.org/file/bot${botToken}/${d.result.file_path}`,
    fileName: d.result.file_path.split("/").pop() || fileId,
  };
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill CV backups ${APPLY ? "(APPLY)" : "(DRY RUN)"}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, name, cv_url, created_at")
    .like("cv_url", "tg://%")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  console.log(`Candidates (tg:// cv_url): ${profiles?.length || 0}`);

  // Preload existing backups to skip
  const existing = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const { data: files } = await sb.storage.from("cv-downloads").list(`tg-ingest/${date}`, { limit: 1000 });
    for (const f of files || []) existing.add(f.name.replace(/\.(pdf|docx?|doc)$/i, ""));
  }
  console.log(`Existing backups (last 30d): ${existing.size}\n`);

  const todo = (profiles || []).filter((p: any) => {
    const fid = p.cv_url?.slice(5);
    return fid && !existing.has(fid);
  });
  console.log(`Need backup: ${todo.length}`);
  const effective = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;
  console.log(`Will process: ${effective.length}${LIMIT > 0 ? ` (--limit ${LIMIT})` : ""}\n`);

  if (!APPLY) {
    for (const p of effective.slice(0, 5)) {
      console.log(`  would back up: ${p.name.padEnd(30)} file_id=${p.cv_url.slice(5, 25)}…`);
    }
    if (effective.length > 5) console.log(`  … and ${effective.length - 5} more`);
    console.log(`\nRe-run with --apply.`);
    return;
  }

  let ok = 0, failed = 0, skipped = 0;
  for (let i = 0; i < effective.length; i++) {
    const p: any = effective[i];
    const fileId = p.cv_url.slice(5);
    const prefix = `[${i + 1}/${effective.length}]`;
    try {
      const link = await getFileLink(botToken, fileId);
      if (!link) { console.log(`${prefix} ⚠ ${p.name} — getFile failed (file may be expired)`); failed++; continue; }
      const ext = (link.fileName.split(".").pop() || "pdf").toLowerCase();
      const r = await fetch(link.url);
      if (!r.ok) { console.log(`${prefix} ⚠ ${p.name} — download ${r.status}`); failed++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const date = new Date(p.created_at).toISOString().slice(0, 10);
      const key = `tg-ingest/${date}/${fileId}.${ext}`;
      const contentType =
        ext === "pdf" ? "application/pdf" :
        ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
        ext === "doc" ? "application/msword" : "application/octet-stream";
      const { error: upErr } = await sb.storage.from("cv-downloads").upload(key, buf, { contentType, upsert: true });
      if (upErr) { console.log(`${prefix} ✗ ${p.name} — upload: ${upErr.message}`); failed++; continue; }
      console.log(`${prefix} ✓ ${p.name.padEnd(28)} (${(buf.length / 1024).toFixed(0)} KB)`);
      ok++;
    } catch (e: any) {
      console.log(`${prefix} ✗ ${p.name} — ${e.message}`);
      failed++;
    }
    // Small delay to stay under Telegram's rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backed up: ${ok}  ·  Failed: ${failed}  ·  Skipped: ${skipped}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
