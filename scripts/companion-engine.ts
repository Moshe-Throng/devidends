/**
 * Companion Engine — proactive outreach cron job.
 *
 * Runs every 6 hours. Finds users who would benefit from a message,
 * generates the content, and sends via Telegram Bot API.
 *
 * Usage: npx tsx scripts/companion-engine.ts
 * Cron:  0 0,6,12,18 * * *  (every 6h UTC)
 *
 * Principles:
 *  - Only message when there's genuine value (new matching jobs, CV tips)
 *  - Max 1 proactive message per user per 24h
 *  - Never spam. If nothing useful to say, send nothing.
 */

import * as path from "path";
import * as fs from "fs";

// Load env
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  const { generateProactiveMessages, buildProactiveMessage, logDripMessage, getSb } = await import("@/lib/companion");
  const { trackEvent } = await import("@/lib/logger");

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("[companion-engine] TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }

  console.log(`[companion-engine] Starting at ${new Date().toISOString()}`);

  // Kill switch: if .broadcast-allowlist.json exists at project root, restrict
  // outbound proactive messages to the allowlisted telegram_ids only. Set when
  // we pause subscriptions so we don't spam users while we iterate on content.
  let allowlist: Set<string> | null = null;
  const markerPath = path.join(__dirname, "..", ".broadcast-allowlist.json");
  if (fs.existsSync(markerPath)) {
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, "utf-8"));
      const ids: string[] = Array.isArray(marker.allowlist_tg_ids) ? marker.allowlist_tg_ids : [];
      allowlist = new Set(ids.map(String));
      console.log(`[companion-engine] BROADCAST PAUSED — allowlist only (${allowlist.size} ids): ${Array.from(allowlist).join(",")}`);
    } catch (e) {
      console.warn("[companion-engine] Failed to parse broadcast-allowlist marker:", e);
    }
  }

  // Find candidates
  let candidates = await generateProactiveMessages();
  console.log(`[companion-engine] Found ${candidates.length} candidates`);

  if (allowlist) {
    const before = candidates.length;
    candidates = candidates.filter((c) => allowlist!.has(String(c.telegram_id)));
    console.log(`[companion-engine] Allowlist filter: ${before} → ${candidates.length}`);
  }

  if (candidates.length === 0) {
    console.log("[companion-engine] Nothing to send. Done.");
    return;
  }

  const sb = getSb();
  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const reply = buildProactiveMessage(candidate);
    if (!reply.text) continue;

    try {
      // Build Telegram sendMessage payload
      const payload: Record<string, unknown> = {
        chat_id: candidate.telegram_id,
        text: reply.text,
      };

      if (reply.buttons && reply.buttons.length > 0) {
        payload.reply_markup = JSON.stringify({
          inline_keyboard: reply.buttons,
        });
      }

      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();

      if (data.ok) {
        sent++;

        // Log the drip message
        await logDripMessage(sb, {
          telegram_id: candidate.telegram_id,
          profile_id: candidate.profile.id,
          message_type: `proactive_${candidate.trigger}`,
          trigger_type: candidate.trigger,
          context: {
            bot_message: reply.text,
            ...candidate.context,
          },
        });

        trackEvent({
          event: "companion_proactive",
          profile_id: candidate.profile.id,
          telegram_id: candidate.telegram_id,
          metadata: { trigger: candidate.trigger },
        });
      } else {
        failed++;
        console.warn(
          `[companion-engine] Failed to send to ${candidate.telegram_id}:`,
          data.description,
        );

        // If user blocked the bot, mark them as opted out
        if (
          data.error_code === 403 ||
          data.description?.includes("bot was blocked") ||
          data.description?.includes("user is deactivated")
        ) {
          await sb
            .from("profiles")
            .update({ drip_opted_out: true })
            .eq("telegram_id", candidate.telegram_id);
          console.log(
            `[companion-engine] Opted out ${candidate.telegram_id} (blocked bot)`,
          );
        }
      }

      // Rate limit: 30 messages/sec Telegram limit, stay well under
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      failed++;
      console.error(
        `[companion-engine] Error sending to ${candidate.telegram_id}:`,
        err,
      );
    }
  }

  console.log(
    `[companion-engine] Done. Sent: ${sent}, Failed: ${failed}, Total candidates: ${candidates.length}`,
  );

  // Send summary to admin
  const ADMIN_TG = "297659579";
  if (sent > 0 || failed > 0) {
    try {
      await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_TG,
            text: `Companion Engine: ${sent} sent, ${failed} failed out of ${candidates.length} candidates.`,
          }),
        },
      );
    } catch {
      // Non-critical
    }
  }
}

main().catch((err) => {
  console.error("[companion-engine] Fatal:", err);
  process.exit(1);
});
