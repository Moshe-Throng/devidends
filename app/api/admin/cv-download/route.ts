/**
 * GET /api/admin/cv-download?profile_id=<uuid>
 *
 * Returns ONE profile's CV file as an attachment. Source priority:
 *   1. Supabase Storage `cv-downloads` bucket (where tg-ingest CVs are
 *      backed up daily by scripts/backfill-cv-backups.ts).
 *   2. Direct fetch of cv_url if it's an https URL (Supabase Storage
 *      `cvs` bucket public/signed link or external).
 *   3. Telegram getFile for `tg://<file_id>` URLs that haven't been
 *      backed up yet (works while Telegram still holds the file).
 *   4. cv_text fallback as `<Name>.txt`.
 *
 * Auth: caller must be in ADMIN_USER_IDS env allowlist via Supabase
 * session cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (ADMIN_IDS.length === 0) return { ok: false, reason: "ADMIN_USER_IDS not configured" };
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const sb = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, reason: "Not signed in" };
    if (!ADMIN_IDS.includes(user.id)) return { ok: false, reason: "Not an admin user" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

function sanitize(s: string): string {
  return (s || "unknown").replace(/[^a-zA-Z0-9\-_. ]+/g, "_").replace(/\s+/g, "_").slice(0, 60);
}

function extFromUrl(url: string, fallback = "pdf"): string {
  const m = url.toLowerCase().match(/\.(pdf|docx?|rtf|odt)(\?|$)/);
  return m ? m[1] : fallback;
}

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "pdf") return "application/pdf";
  if (e === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (e === "doc") return "application/msword";
  if (e === "rtf") return "application/rtf";
  if (e === "odt") return "application/vnd.oasis.opendocument.text";
  if (e === "txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 0 ? b : null;
  } catch { return null; }
}

async function fetchFromTelegram(fileId: string): Promise<{ buf: Buffer; ext: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!r.ok) return null;
    const d = await r.json() as any;
    if (!d.ok || !d.result?.file_path) return null;
    const filePath = d.result.file_path as string;
    const ext = (filePath.split(".").pop() || "pdf").toLowerCase();
    const buf = await fetchBuffer(`https://api.telegram.org/file/bot${token}/${filePath}`);
    return buf ? { buf, ext } : null;
  } catch { return null; }
}

async function fetchFromCvDownloads(
  sb: ReturnType<typeof getServiceClient>,
  fileId: string,
): Promise<{ buf: Buffer; ext: string } | null> {
  // Walk back up to 90 days of date-partitioned backups looking for the file.
  for (let i = 0; i < 90; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const { data: files } = await sb.storage.from("cv-downloads").list(`tg-ingest/${date}`, { limit: 1000 });
    const match = (files || []).find((f) => f.name.startsWith(fileId));
    if (!match) continue;
    const path = `tg-ingest/${date}/${match.name}`;
    const { data, error } = await sb.storage.from("cv-downloads").download(path);
    if (error || !data) return null;
    return {
      buf: Buffer.from(await data.arrayBuffer()),
      ext: (match.name.split(".").pop() || "pdf").toLowerCase(),
    };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden", reason: auth.reason }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profile_id");
  if (!profileId) {
    return NextResponse.json({ error: "Missing profile_id" }, { status: 400 });
  }

  const sb = getServiceClient();
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, name, cv_url, cv_text")
    .eq("id", profileId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const safeName = sanitize((profile as any).name || "unknown");
  const cvUrl = (profile as any).cv_url as string | null;
  const cvText = (profile as any).cv_text as string | null;

  let buf: Buffer | null = null;
  let ext: string = "pdf";
  let sourceTag = "none";

  if (cvUrl) {
    if (cvUrl.startsWith("tg://")) {
      const fileId = cvUrl.slice(5);
      const fromStorage = await fetchFromCvDownloads(sb, fileId);
      if (fromStorage) {
        buf = fromStorage.buf;
        ext = fromStorage.ext;
        sourceTag = "storage:cv-downloads";
      } else {
        const fromTg = await fetchFromTelegram(fileId);
        if (fromTg) { buf = fromTg.buf; ext = fromTg.ext; sourceTag = "telegram:live"; }
      }
    } else if (cvUrl.startsWith("http")) {
      const b = await fetchBuffer(cvUrl);
      if (b) { buf = b; ext = extFromUrl(cvUrl); sourceTag = "url"; }
    }
  }

  // Fallback to cv_text
  if (!buf && cvText && cvText.length > 100) {
    buf = Buffer.from(cvText, "utf-8");
    ext = "txt";
    sourceTag = "cv_text";
  }

  if (!buf) {
    return NextResponse.json(
      { error: "No CV file available", profile_id: profileId, has_cv_url: !!cvUrl, has_cv_text: !!cvText },
      { status: 404 },
    );
  }

  const filename = `${safeName}.${ext}`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeForExt(ext),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
      "X-CV-Source": sourceTag,
    },
  });
}
