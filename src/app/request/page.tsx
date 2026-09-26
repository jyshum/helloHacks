import { redirect } from "next/navigation";

// Requesting now happens on the map ("Where to?").
export default function RequestPage() {
  redirect("/map");
}
