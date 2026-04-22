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
  const { data, error } = await sb
    .from("co_creators")
    .select("member_number, name, profile_id, invite_token")
    .order("member_number", { ascending: false })
    .limit(15);
  console.log("Top 15 by member_number:");
  for (const r of data || []) console.log(`  #${r.member_number}  ${r.name}  profile=${r.profile_id?.slice(0, 8)}  token=${r.invite_token}`);
  const { count } = await sb.from("co_creators").select("id", { count: "exact", head: true });
  console.log("Total co_creators:", count);
  const { data: all } = await sb.from("co_creators").select("member_number");
  const nums = (all || []).map((r: any) => r.member_number).filter((n: any) => n != null).sort((a: number, b: number) => a - b);
  const dups = nums.filter((n, i) => nums.indexOf(n) !== i);
  console.log("Duplicate member_numbers:", dups);
  if (error) console.log("Error:", error);
})();
