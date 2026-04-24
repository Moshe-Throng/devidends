import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

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

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const names = ["yonus", "aurora", "seblewongel", "petros"];
  for (const n of names) {
    const { data: p } = await sb
      .from("profiles")
      .select("id, name, telegram_id, email, claimed_at, claim_token, is_recommender, user_id")
      .ilike("name", `%${n}%`)
      .maybeSingle();
    if (!p) { console.log(`${n}: NO PROFILE`); continue; }
    console.log(`${p.name}`);
    console.log(`  tg=${p.telegram_id || "-"}  email=${p.email || "-"}`);
    console.log(`  claimed_at=${p.claimed_at || "NULL"}  user_id=${p.user_id || "none"}`);
    // Any active subscription?
    let subq = sb.from("subscriptions").select("id, channel, is_active, created_at");
    if (p.telegram_id) subq = subq.eq("telegram_id", p.telegram_id);
    else if (p.email) subq = subq.ilike("email", p.email);
    const { data: subs } = await subq;
    console.log(`  subscriptions: ${subs?.length || 0}`);
    for (const s of subs || []) console.log(`    ${s.channel} active=${s.is_active} created=${s.created_at?.slice(0, 10)}`);
    // Co-creator row?
    const { data: cc } = await sb.from("co_creators").select("id, status, joined_at, invite_token").eq("profile_id", p.id).maybeSingle();
    if (cc) console.log(`  co_creator: status=${cc.status} joined=${cc.joined_at?.slice(0, 10)} token=${cc.invite_token}`);
    console.log();
  }
})();
