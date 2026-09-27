/* eslint-disable @next/next/no-img-element */
// The Hopped logo as plain images (navy for light screens, white for dark ones).
// Images, not a CSS mask: a mask shows as a solid block for a moment while it loads.
const ART = {
  full: { ratio: 688 / 106, file: "logo" },
  mark: { ratio: 416 / 148, file: "mark" },
};

export default function Logo({
  variant = "full",
  height = 24,
  tone = "navy",
  className = "",
}: {
  variant?: keyof typeof ART;
  height?: number;
  tone?: "navy" | "white";
  className?: string;
}) {
  const { ratio, file } = ART[variant];
  return (
    <img
      src={`/brand/${file}${tone === "navy" ? "-navy" : ""}.png`}
      alt="Hopped"
      width={Math.round(height * ratio)}
      height={height}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}
