import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { nextPathFor, syncVerified } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Link opened in a different browser: Supabase already confirmed the email,
    // but there's no session here. Ask them to log in.
    return NextResponse.redirect(new URL("/login?verified=1", url.origin));
  }

  const { verified } = await syncVerified(user);
  return NextResponse.redirect(new URL(verified ? nextPathFor() : "/verify", url.origin));
}
