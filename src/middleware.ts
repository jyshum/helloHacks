import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const GUARDED = ["/map", "/request", "/driver", "/trip", "/match"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Refreshes the session cookie on every request.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const guarded = GUARDED.some((p) => path === p || path.startsWith(`${p}/`));
  if (!guarded) return response;

  if (!user) return NextResponse.redirect(new URL("/signup", request.url));

  const { data: profile } = await supabase
    .from("users")
    .select("email_verified")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!profile?.email_verified) return NextResponse.redirect(new URL("/signup", request.url));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
