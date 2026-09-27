"use client";

/* eslint-disable @next/next/no-img-element */
import { Car } from "lucide-react";
import { initials } from "@/components/Avatar";

// Round profile photo for the map. Drivers get a small car badge.
export default function AvatarPin({
  name,
  photo,
  kind,
  size = 40,
  live,
  onClick,
}: {
  name: string;
  photo?: string | null;
  kind: "driver" | "rider";
  size?: number;
  live?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative block rounded-full transition hover:scale-110"
      style={{ width: size, height: size }}
      aria-label={name}
    >
      <span
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[3px] bg-white text-xs font-semibold shadow-lift ${
          kind === "driver" ? "border-white text-ubc" : "border-sky text-ubc"
        }`}
      >
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(name)}
      </span>
      {kind === "driver" && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-ubc text-white">
          <Car size={10} strokeWidth={2.5} aria-hidden />
        </span>
      )}
      {live && <span className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-green" />}
    </button>
  );
}
