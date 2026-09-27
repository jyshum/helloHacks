import { redirect } from "next/navigation";

// One-off "ride today" is deferred: everything happens in pods.
export default function Page() {
  redirect("/pods");
}
