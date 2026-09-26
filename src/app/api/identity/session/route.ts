import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { IDV_COOKIE, stripe } from "@/lib/stripe";

// Starts a Stripe Identity check: driver's license photo + matching selfie.
export async function POST() {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  if (me.role === "rider") return jsonError("Only drivers verify a license.", 403);

  const session = await stripe().identity.verificationSessions.create({
    type: "document",
    options: {
      document: {
        allowed_types: ["driving_license"],
        require_matching_selfie: true,
        require_live_capture: true,
      },
    },
    metadata: { user_id: me.id },
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/driver-verify?returned=1`,
  });

  const res = NextResponse.json({ url: session.url });
  res.cookies.set(IDV_COOKIE, session.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 });
  return res;
}
