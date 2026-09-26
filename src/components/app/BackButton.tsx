"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/map"))}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow-soft ${className}`}
      aria-label="Back"
    >
      ←
    </button>
  );
}
