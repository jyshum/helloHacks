import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/types";

// Current user's profile row, or bounce to signup. Use in server components.
export async function requireProfile(): Promise<User> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signup");
  const { data } = await supabase.from("users").select("*").eq("auth_id", user.id).maybeSingle();
  if (!data) redirect("/signup");
  return data as User;
}

// Same as requireProfile but for API routes: returns null instead of redirecting.
export async function getProfile(): Promise<User | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("*").eq("auth_id", user.id).maybeSingle();
  return (data as User) ?? null;
}
