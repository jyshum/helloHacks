import Link from "next/link";
import { Users } from "lucide-react";

// Glass pill back to "My pods" from the on-demand screens.
export default function PodsButton() {
  return (
    <Link href="/pods" className="glass pointer-events-auto flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-ubc">
      <Users size={16} aria-hidden /> Pods
    </Link>
  );
}
