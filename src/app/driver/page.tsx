import { redirect } from "next/navigation";

// Driver mode now lives on the map (GO button).
export default function DriverPage() {
  redirect("/map");
}
