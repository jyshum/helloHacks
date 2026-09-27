import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api";
import { loadReviews } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ?count=1 returns just the pending count (for the menu badge).
export async function GET(req: Request) {
  const me = await getProfile();
  if (!isAdmin(me)) return jsonError("Not found.", 404);
  if (new URL(req.url).searchParams.get("count")) {
    const { count } = await createAdminClient()
      .from("license_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return NextResponse.json({ pending: count ?? 0 });
  }
  return NextResponse.json(await loadReviews());
}
