import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { jsonError } from "@/lib/api";
import { directoryFits, driverPod } from "@/lib/pods/match";

export const dynamic = "force-dynamic";

export type PersonCard = {
  id: string;
  full_name: string;
  photo_url: string | null;
  faculty: string | null;
  year: number | null;
  rating_avg: number;
  rating_count: number;
  license_verified: boolean;
  mode: "driver" | "rider";
  area: string | null;
  campus: string;
  fits: boolean;
  fitNote: string;
  podId: string | null; // a driver's pod (for Request to join)
  full: boolean; // driver has no free seats
  relation: "none" | "in_pod" | "invited" | "requested";
};

export type PeopleResponse = { me: { mode: "driver" | "rider" | null; podId: string | null }; people: PersonCard[] };

type Row = {
  user_id: string;
  mode: "driver" | "rider";
  seats: number;
  home_area: string | null;
  campus_label: string;
  user: { id: string; full_name: string | null; photo_url: string | null; faculty: string | null; year: number | null; rating_avg: number | null; rating_count: number | null; license_verified: boolean | null; email_verified: boolean | null } | null;
};

// "Find commuters": everyone with an active commute, searchable by name, faculty or area.
// Only the neighbourhood is shown, never an address. Best fits for you come first.
export async function GET(req: Request) {
  const me = await getProfile();
  if (!me) return jsonError("Sign in first.", 401);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const role = url.searchParams.get("role");

  const admin = createAdminClient();
  const [{ data: mine }, { data: rows, error }] = await Promise.all([
    admin.from("commute_profiles").select("mode").eq("user_id", me.id).maybeSingle(),
    admin
      .from("commute_profiles")
      .select("user_id, mode, seats, home_area, campus_label, user:users!commute_profiles_user_id_fkey(id, full_name, photo_url, faculty, year, rating_avg, rating_count, license_verified, email_verified)")
      .eq("active", true)
      .neq("user_id", me.id)
      .limit(1000),
  ]);
  if (error) return jsonError(error.message, 500);

  const matches = (rows ?? []) as unknown as Row[];
  const found = matches.filter((r) => {
    if (!r.user?.email_verified) return false;
    if ((role === "driver" || role === "rider") && r.mode !== role) return false;
    if (!q) return true;
    return [r.user.full_name, r.user.faculty, r.home_area].some((v) => v?.toLowerCase().includes(q));
  });

  const myMode = (mine?.mode as "driver" | "rider" | undefined) ?? null;
  const myPod = myMode === "driver" ? await driverPod(me.id) : null;
  const fits = await directoryFits(me.id, found.map((r) => r.user_id));

  // Drivers' pods (to request to join), and anyone you're already connected with.
  const driverIds = found.filter((r) => r.mode === "driver").map((r) => r.user_id);
  const [{ data: pods }, { data: myRows }] = await Promise.all([
    driverIds.length ? admin.from("pods").select("id, driver_id").eq("status", "active").in("driver_id", driverIds) : Promise.resolve({ data: [] as { id: string; driver_id: string }[] }),
    myPod
      ? admin.from("pod_members").select("user_id, status").eq("pod_id", myPod.id).in("status", ["invited", "requested", "active"])
      : admin.from("pod_members").select("status, pod:pods!inner(driver_id, status)").eq("user_id", me.id).in("status", ["invited", "requested", "active"]).in("pod.status", ["active", "paused"]),
  ]);
  const podOf = new Map((pods ?? []).map((p) => [p.driver_id, p.id]));
  const taken = new Map<string, number>(); // riders holding a seat, per pod
  if (pods?.length) {
    const { data: seated } = await admin.from("pod_members").select("pod_id").eq("role", "rider").in("status", ["invited", "requested", "active"]).in("pod_id", pods.map((p) => p.id));
    for (const s of seated ?? []) taken.set(s.pod_id, (taken.get(s.pod_id) ?? 0) + 1);
  }
  const relation = new Map<string, PersonCard["relation"]>();
  for (const m of (myRows ?? []) as { user_id?: string; status: string; pod?: unknown }[]) {
    const other = myPod ? m.user_id : (m.pod as { driver_id: string } | null)?.driver_id;
    if (other) relation.set(other, m.status === "active" ? "in_pod" : (m.status as "invited" | "requested"));
  }

  const rank = (p: PersonCard) => (p.fits ? (p.full ? 1 : 2) : 0);
  const people: PersonCard[] = found
    .map((r) => {
      const f = fits.get(r.user_id);
      return {
        id: r.user_id,
        full_name: r.user!.full_name ?? "UBC student",
        photo_url: r.user!.photo_url,
        faculty: r.user!.faculty,
        year: r.user!.year,
        rating_avg: Number(r.user!.rating_avg ?? 5),
        rating_count: r.user!.rating_count ?? 0,
        license_verified: !!r.user!.license_verified,
        mode: r.mode,
        area: r.home_area,
        campus: r.campus_label,
        fits: !!f?.fits,
        fitNote: f?.note ?? (myMode ? "" : "Set up your commute to see who fits"),
        podId: r.mode === "driver" ? podOf.get(r.user_id) ?? null : null,
        full: r.mode === "driver" && (taken.get(podOf.get(r.user_id) ?? "") ?? 0) >= r.seats,
        relation: relation.get(r.user_id) ?? "none",
      };
    })
    // Fits with a free seat first, then full fits, then everyone else.
    .sort((a, b) => rank(b) - rank(a) || a.full_name.localeCompare(b.full_name))
    .slice(0, 40);

  const body: PeopleResponse = { me: { mode: myMode, podId: myPod?.status === "active" ? myPod.id : null }, people };
  return NextResponse.json(body);
}
