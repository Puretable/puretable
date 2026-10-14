/**
 * The Pure Table mark: a circle (plate) over a table line with two legs. Colors are fixed per the
 * brand spec, not theme tokens — the mark must look the same regardless of theme.
 * - `thick`: use the 13px stroke meant for small sizes (16-48px), instead of the default 9px.
 * - `variant="onGreen"`: white mark on a green rounded square — for app icons and dark backgrounds.
 */
export function PureTableMark({
  className = "h-8",
  thick = false,
  variant = "default",
}: {
  className?: string;
  thick?: boolean;
  variant?: "default" | "onGreen";
}) {
  const stroke = thick ? 13 : 9;
  const green = variant === "onGreen" ? "#FFFFFF" : "#2E6B3F";
  const dark = variant === "onGreen" ? "#FFFFFF" : "#1F2A22";
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      {variant === "onGreen" && (
        <rect x="0" y="0" width="160" height="160" rx="28" fill="#2E6B3F" />
      )}
      <circle cx="80" cy="64" r="42" fill="none" stroke={green} strokeWidth={stroke} />
      <circle cx="80" cy="64" r="22" fill={green} />
      <path d="M24 124H136" stroke={dark} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      <path
        d="M46 124V148M114 124V148"
        stroke={dark}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
