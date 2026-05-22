/**
 * POST /api/cv/save-anon
 *
 * Persists CV + identity from any anonymous intake point so we stop losing
 * users. Called from:
 *   - /score page (after the score modal, ask for email to "save your score")
 *   - /cv-builder page (after extraction, when no auth/TG session)
 *   - Telegram bot non-recommender DM path (file forwarded server-side)
 *
 * Behavior:
 *   1. Upsert a profile row keyed by email (case-insensitive).
 *      - If a real (claimed) profile already exists for that email, do NOT
 *        clobber it. Patch only the cv_* fields if they were empty.
 *      - Otherwise create/update a profile with source='scored_anon'.
 *   2. If a file is provided, upload to scored-anon storage bucket and
 *      set cv_url to the public storage path.
 *   3. Return { profile_id, was_new } so the caller can show a
 *      confirmation and/or send a magic claim link.
 *
 * Body (multipart/form-data OR application/json):
 *   email           required
 *   name            optional
 *   phone           optional
 *   cv_text         required (extracted plain text)
 *   cv_score        optional (number, if /score already ran)
 *   source_tag      optional (defaults to 'web_score_anon')
 *   file            optional File (PDF/DOCX) — if multipart
 *   file_base64     optional (alternative to file in JSON body)
 *   file_name       required if file_base64 used
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_SOURCES = new Set([
  "web_score_anon",
  "web_cv_builder_anon",
  "bot_dm_anon",
  "telegram_score_command",
]);

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function emailLooksValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "cv";
}

function extFromName(name: string, fallback = "pdf"): string {
  const m = name.toLowerCase().match(/\.(pdf|docx?|rtf|odt|txt)$/);
  return m ? m[1] : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let email = "";
    let name: string | null = null;
    let phone: string | null = null;
    let cvText = "";
    let cvScore: number | null = null;
    let sourceTag = "web_score_anon";
    let fileBuf: Buffer | null = null;
    let fileName = "";

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      email = String(fd.get("email") || "").trim().toLowerCase();
      name = (fd.get("name") as string) || null;
      phone = (fd.get("phone") as string) || null;
      cvText = String(fd.get("cv_text") || "");
      const scoreStr = fd.get("cv_score");
      cvScore = scoreStr != null && scoreStr !== "" ? Number(scoreStr) : null;
      const st = (fd.get("source_tag") as string) || "";
      if (ALLOWED_SOURCES.has(st)) sourceTag = st;
      const f = fd.get("file") as File | null;
      if (f && typeof (f as any).arrayBuffer === "function") {
        fileBuf = Buffer.from(await f.arrayBuffer());
        fileName = sanitizeFilename(f.name || "cv");
      }
    } else {
      const body = await req.json();
      email = String(body.email || "").trim().toLowerCase();
      name = body.name ?? null;
      phone = body.phone ?? null;
      cvText = String(body.cv_text || "");
      cvScore = typeof body.cv_score === "number" ? body.cv_score : null;
      if (ALLOWED_SOURCES.has(body.source_tag)) sourceTag = body.source_tag;
      if (body.file_base64 && body.file_name) {
        try {
          fileBuf = Buffer.from(String(body.file_base64), "base64");
          fileName = sanitizeFilename(String(body.file_name));
        } catch { /* ignore — file is optional */ }
      }
    }

    if (!email || !emailLooksValid(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!cvText || cvText.length < 100) {
      return NextResponse.json({ error: "cv_text too short (min 100 chars)" }, { status: 400 });
    }

    const sb = svc();

    // 1. Look up existing profile by email
    const { data: existing } = await sb
      .from("profiles")
      .select("id, name, email, phone, claimed_at, source, cv_url, cv_text, cv_score, telegram_id")
      .ilike("email", email)
      .maybeSingle();

    // 2. Upload file (if any). Path scheme:
    //    scored-anon/<sha256(email)[0..16]>-<ts>.<ext>
    let cvUrl: string | null = null;
    if (fileBuf && fileBuf.length > 200) {
      const emailHash = crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
      const ext = extFromName(fileName);
      const path = `${emailHash}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("scored-anon")
        .upload(path, fileBuf, {
          contentType: ext === "pdf" ? "application/pdf"
            : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/octet-stream",
          upsert: false,
        });
      if (!upErr) cvUrl = `scored-anon://${path}`;
      else console.warn("[save-anon] upload failed:", upErr.message);
    }

    // 3. Build patch — only touch CV fields if existing record is empty for them
    //    (we never clobber a richer profile)
    const patch: Record<string, unknown> = {
      email,
      updated_at: new Date().toISOString(),
    };
    if (name && (!existing || !existing.name || /^unknown/i.test(existing.name))) patch.name = name;
    if (phone && (!existing || !existing.phone)) patch.phone = phone;
    if (cvText && (!existing || !existing.cv_text || existing.cv_text.length < cvText.length)) patch.cv_text = cvText.slice(0, 80000);
    if (cvScore != null && (!existing || existing.cv_score == null)) patch.cv_score = cvScore;
    if (cvUrl && (!existing || !existing.cv_url)) patch.cv_url = cvUrl;
    if (!existing) {
      patch.source = sourceTag;
      patch.name = name || (email.split("@")[0] || "Unknown");
      patch.admin_notes = `Anonymous intake from ${sourceTag} on ${new Date().toISOString().slice(0, 10)} — email captured for later claim.`;
    } else if (!existing.cv_text && cvText) {
      patch.admin_notes = `Anonymous intake from ${sourceTag} added missing CV on ${new Date().toISOString().slice(0, 10)}`;
    }

    let profileId: string;
    let wasNew = false;
    if (existing) {
      const { error: upErr } = await sb.from("profiles").update(patch).eq("id", existing.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      profileId = existing.id;
    } else {
      // New row needs claim_token so the user can claim later.
      patch.claim_token = crypto.randomBytes(4).toString("hex");
      const { data: created, error: insErr } = await sb
        .from("profiles")
        .insert(patch)
        .select("id")
        .single();
      if (insErr || !created) {
        return NextResponse.json({ error: insErr?.message || "Insert failed" }, { status: 500 });
      }
      profileId = (created as any).id;
      wasNew = true;
    }

    return NextResponse.json({
      ok: true,
      profile_id: profileId,
      was_new: wasNew,
      saved: {
        email,
        name: patch.name ?? existing?.name ?? null,
        cv_score: cvScore,
        has_file: !!cvUrl,
        source: sourceTag,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
