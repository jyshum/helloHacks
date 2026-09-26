import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isDevEnvironment } from "@/lib/auth";

// Local demo only: confirm the email and hand back a one-time token to sign in.
export async function POST(req: Request) {
  if (!isDevEnvironment()) return NextResponse.json({ error: "Not available" }, { status: 404 });

  const { email } = await req.json();
  const admin = createAdminClient();
  const { data: row } = await admin.from("users").select("auth_id").eq("ubc_email", email).maybeSingle();
  if (!row?.auth_id) return NextResponse.json({ error: "No account for that email" }, { status: 404 });

  const { error: confirmErr } = await admin.auth.admin.updateUserById(row.auth_id, { email_confirm: true });
  if (confirmErr) return NextResponse.json({ error: confirmErr.message }, { status: 500 });
  await admin.from("users").update({ email_verified: true }).eq("auth_id", row.auth_id);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ token_hash: link.properties.hashed_token });
}
