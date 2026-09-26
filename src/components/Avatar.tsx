/* eslint-disable @next/next/no-img-element */
type Props = {
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: number;
  tone?: "driver" | "rider";
};

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function Avatar({ name, photoUrl, size = 48, tone = "driver" }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? "Profile photo"}
        style={style}
        className="rounded-full object-cover border-2 border-white shadow-soft"
      />
    );
  }
  return (
    <div
      style={style}
      className={`flex items-center justify-center rounded-full font-heading font-semibold text-white border-2 border-white shadow-soft ${
        tone === "driver" ? "bg-ubc" : "bg-sky"
      }`}
    >
      {initials(name)}
    </div>
  );
}
