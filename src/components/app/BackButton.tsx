"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/map"))}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-soft ${className}`}
      aria-label="Back"
    >
      <ArrowLeft size={20} aria-hidden />
    </button>
  );
}
