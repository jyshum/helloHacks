// Re-runs supabase/seed.sql against the linked project so demo rides get fresh
// departure times. Needs SUPABASE_ACCESS_TOKEN (personal access token) in the env.
import { readFileSync } from "node:fs";

const ref = process.env.SUPABASE_PROJECT_REF ?? "ceolosikpfrvtdueuwwl";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN first.");
  process.exit(1);
}
const query = readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
console.log(res.ok ? "Seed refreshed." : `Failed (${res.status}): ${await res.text()}`);
process.exit(res.ok ? 0 : 1);
