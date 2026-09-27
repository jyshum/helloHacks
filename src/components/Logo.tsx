// The Hopped logo. The white PNGs are used as a mask, so the logo takes any colour
// (navy on light screens, white on dark ones) and stays crisp.
const ART = {
  full: { src: "/brand/logo.png", ratio: 688 / 106 },
  mark: { src: "/brand/mark.png", ratio: 416 / 148 },
};

export default function Logo({ variant = "full", height = 24, className = "bg-ubc" }: { variant?: keyof typeof ART; height?: number; className?: string }) {
  const { src, ratio } = ART[variant];
  const mask = `url(${src}) center / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label="Hopped"
      className={`inline-block shrink-0 ${className}`}
      style={{ height, width: Math.round(height * ratio), WebkitMask: mask, mask }}
    />
  );
}
