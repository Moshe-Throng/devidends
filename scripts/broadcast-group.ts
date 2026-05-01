/**
 * Broadcast daily digest to Telegram group + notify individual subscribers.
 * Called from daily pipeline after crawl engine completes.
 *
 * Usage: npx tsx scripts/broadcast-group.ts
 *
 * Requires env vars:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_GROUP_ID         — chat ID of the target group
 *   TELEGRAM_JOBS_TOPIC_ID    — forum topic ID for "jobs" (optional)
 *   NEXT_PUBLIC_SUPABASE_URL  — for subscriber lookups
 *   SUPABASE_SERVICE_ROLE_KEY — for subscriber lookups
 */

import * as fs from "fs";
import * as path from "path";

// Load env vars
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  // Read the normalized opportunities file
  const normalizedPath = path.join(__dirname, "..", "test-output", "_all_normalized.json");
  if (!fs.existsSync(normalizedPath)) {
    console.error("No _all_normalized.json found. Run crawl engine first.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(normalizedPath, "utf-8"));
  const opportunities = Array.isArray(raw) ? raw : [];
  console.log(`Loaded ${opportunities.length} opportunities`);

  // Find truly NEW jobs by comparing against yesterday's snapshot
  const snapshotPath = path.join(__dirname, "..", "test-output", "_last_broadcast_urls.json");
  let lastUrls = new Set<string>();
  try {
    if (fs.existsSync(snapshotPath)) {
      lastUrls = new Set(JSON.parse(fs.readFileSync(snapshotPath, "utf-8")));
    }
  } catch {}

  const allUrls = opportunities.map((o: any) => o.source_url || o.url).filter(Boolean);

  // Relevance filter: jobs Ethiopians can actually apply to.
  // Rule: Ethiopia-based roles PLUS jobs that are clearly international/regional/remote
  // (open to nationals of any country, including Ethiopia).
  // Exclude: country-specific roles in non-Ethiopia locations, non-English postings.
  function isRelevantForEthiopians(opp: any): boolean {
    const country = (opp.country || "").toLowerCase();
    const title = (opp.title || "").toLowerCase();
    const city = (opp.city || "").toLowerCase();
    const desc = (opp.description || "").toLowerCase();
    const allText = [country, title, city, desc].join(" ");

    // Exclude non-English postings (Spanish/French/Danish/Arabic) — clearly regional
    if (/\b(oficial|asistente|gerente|equipo|l[íi]der|atenci[óo]n|protecci[óo]n)\b/i.test(title)) return false;
    if (/\b(projektleder|medarbejder|partnerskab)\b/i.test(title)) return false;
    if (/\b(responsable|coordinateur|assistant[e]?\s+(de|du|\u00e0))\b/i.test(title) && !title.includes("english")) return false;

    // Ethiopia-based — always include
    if (country.includes("ethiopia") || title.includes("ethiopia") || city.includes("addis") || city.includes("ethiopia")) return true;

    // Explicit Africa regional / Horn of Africa tags
    if (/\b(horn of africa|east africa|eastern africa|greater horn|ethiopia\/somalia)\b/i.test(allText)) return true;

    // International / global / regional / remote roles — open to anyone
    if (/\b(international consultant|international expert|international staff|international specialist|international advisor|international officer)\b/i.test(title)) return true;
    if (/\b(global|regional|remote|work from anywhere|home-?based)\b/i.test(title)) return true;
    if (/\b(headquarter|roving|multi-country|pan-african|continent[a-z]*)\b/i.test(title)) return true;

    // HQ-based positions at major donor agencies (open globally)
    if (/\b(hq|headquarters?)\b/i.test(country) || /\b(new york|geneva|vienna|rome,\s*italy|paris,\s*france|washington|nairobi.*regional)\b/i.test(country)) {
      // Only include HQ roles that aren't country-coordinator type
      if (!/\b(national|country)\s+(coordinator|manager|director|lead)\b/i.test(title)) return true;
    }

    // Exclude: clearly country-specific role in another country
    // (Default exclude for everything else — country-specific jobs in non-Ethiopia locations)
    return false;
  }

  const recent = opportunities.filter((o: any) => {
    const url = o.source_url || o.url;
    if (!url || lastUrls.has(url)) return false;
    return isRelevantForEthiopians(o);
  });

  // Save today's URLs (ALL, not just filtered — so dedup stays correct)
  fs.writeFileSync(snapshotPath, JSON.stringify(allUrls));
  const newTotal = opportunities.filter((o: any) => {
    const url = o.source_url || o.url;
    return url && !lastUrls.has(url);
  }).length;
  console.log(`${recent.length} relevant opportunities (of ${newTotal} new, ${opportunities.length} overall)`);

  // Load news articles
  const newsPath = path.join(__dirname, "..", "test-output", "news.json");
  let newsArticles: { title: string; url: string; source_name: string; category: string }[] = [];
  if (fs.existsSync(newsPath)) {
    try {
      newsArticles = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
      console.log(`Loaded ${newsArticles.length} news articles`);
    } catch {
      console.warn("Failed to parse news.json");
    }
  }

  // Also dedup news against yesterday
  const newsSnapshotPath = path.join(__dirname, "..", "test-output", "_last_broadcast_news.json");
  let lastNewsUrls = new Set<string>();
  try {
    if (fs.existsSync(newsSnapshotPath)) {
      lastNewsUrls = new Set(JSON.parse(fs.readFileSync(newsSnapshotPath, "utf-8")));
    }
  } catch {}
  const newNews = newsArticles.filter((a) => !lastNewsUrls.has(a.url));
  fs.writeFileSync(newsSnapshotPath, JSON.stringify(newsArticles.map((a) => a.url)));
  console.log(`${newNews.length} new news articles (not in yesterday's digest)`);
  newsArticles = newNews;

  if (recent.length === 0 && newsArticles.length === 0) {
    console.log("No new opportunities or news to broadcast. Skipping.");
    return;
  }

  // Approval chain: build the digest, queue it, send a preview to the
  // admin DM with inline approve/decline buttons. The actual group
  // broadcast happens later from the webhook handler when admin taps
  // approve. Subscriber DMs go out unchanged (those don't route through
  // approval — they're personalised per-user filters and approve/decline
  // applies to the public group post only).
  const { buildGroupDigest, notifySubscribersDaily } = await import("../lib/telegram-broadcast");
  const built = buildGroupDigest(recent, newsArticles);
  console.log(`Built digest: ${built.jobCount} jobs, ${built.newsCount} news, ${built.messages.length} message(s)`);

  if (built.messages.length > 0) {
    const ADMIN_TG = process.env.TELEGRAM_ADMIN_CHAT_ID || "297659579";
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const groupId = process.env.TELEGRAM_GROUP_ID;
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not set");
    } else if (!groupId) {
      console.error("TELEGRAM_GROUP_ID not set; queueing skipped");
    } else {
      // 1. Insert queue row
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supaUrl && supaKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(supaUrl, supaKey);
        const { data: queueRow, error: qErr } = await sb
          .from("broadcast_queue")
          .insert({
            status: "pending",
            payload_messages: built.messages,
            urls: built.urls,
            news_urls: built.newsUrls,
            job_count: built.jobCount,
            news_count: built.newsCount,
            preview_chat_id: ADMIN_TG,
          })
          .select("id")
          .single();
        if (qErr || !queueRow) {
          console.error(`queue insert failed: ${qErr?.message}`);
        } else {
          const queueId = (queueRow as { id: string }).id;
          console.log(`Queued broadcast ${queueId}`);

          // 2. Send each digest message to admin DM (so admin sees what
          // would go out). Capture the message_ids for editing later.
          const previewIds: number[] = [];
          for (let i = 0; i < built.messages.length; i++) {
            const r = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: ADMIN_TG,
                  text: built.messages[i],
                  parse_mode: "HTML",
                  disable_web_page_preview: true,
                }),
              },
            );
            const j = (await r.json()) as { ok: boolean; result?: { message_id: number } };
            if (j.ok && j.result?.message_id) previewIds.push(j.result.message_id);
            await new Promise((r) => setTimeout(r, 600));
          }

          // 3. Send the approval prompt with inline buttons.
          const approvalText =
            `📋 <b>Daily digest ready for review</b>\n` +
            `${built.jobCount} jobs · ${built.newsCount} news article${built.newsCount === 1 ? "" : "s"} · ${built.messages.length} message${built.messages.length === 1 ? "" : "s"}\n\n` +
            `Approve to post to the Jobs group, decline to skip today.`;
          const ar = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: ADMIN_TG,
                text: approvalText,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[
                    { text: "✅ Approve & broadcast", callback_data: `bcq:approve:${queueId}` },
                    { text: "❌ Decline", callback_data: `bcq:decline:${queueId}` },
                  ]],
                },
              }),
            },
          );
          const aj = (await ar.json()) as { ok: boolean; result?: { message_id: number } };
          const approvalId = aj.result?.message_id || null;

          // 4. Save the preview/approval message IDs back to the row.
          await sb
            .from("broadcast_queue")
            .update({
              preview_message_ids: previewIds,
              approval_message_id: approvalId,
            })
            .eq("id", queueId);
          console.log(`Sent ${previewIds.length} preview message(s) + approval prompt to admin ${ADMIN_TG}`);
        }
      } else {
        console.error("Supabase env vars missing; queue insert skipped");
      }
    }
  }

  // Subscriber DMs (personalised per-user filters) — these go out without
  // approval since each one is a one-to-one delivery to a subscriber who
  // has explicitly opted in.
  const digestResult = await notifySubscribersDaily(recent, newsArticles);
  console.log(`Daily digest: notified=${digestResult.notified}, skipped=${digestResult.skipped}, failed=${digestResult.failed}`);
}

main().catch((err) => {
  console.error("Broadcast failed:", err);
  process.exit(1);
});
