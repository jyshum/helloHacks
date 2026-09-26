import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextPathFor, syncVerified } from "@/lib/session";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { verified, role } = await syncVerified(user);
  return NextResponse.json({ verified, role, next: verified ? nextPathFor() : "/verify" });
}
