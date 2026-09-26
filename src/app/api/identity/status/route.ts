import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { IDV_COOKIE, stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Checks the driver's latest verification session and records a pass.
export async function GET() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  if (me.license_verified) return NextResponse.json({ status: "verified", verified: true });

  const sessionId = cookies().get(IDV_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ status: "none", verified: false });

  const session = await stripe().identity.verificationSessions.retrieve(sessionId);
  if (session.metadata?.user_id !== me.id) return jsonError("Session doesn't belong to you.", 403);

  const verified = session.status === "verified";
  if (verified) {
    await createAdminClient().from("users").update({ license_verified: true }).eq("id", me.id);
  }
  return NextResponse.json({
    status: session.status,
    verified,
    error: session.last_error?.reason ?? null,
  });
}
