import { useLogoUrl } from "@/hooks/use-logo-url";
import { DEFAULT_LOGO_URL } from "@/lib/brand";
import { PureTableMark } from "./PureTableMark";

/**
 * The Pure Table mark. Renders the built-in vector mark unless an admin has published a
 * replacement image in Appearance, in which case that image is shown instead (unchanged
 * behavior — only the built-in default changed).
 */
export function LogoMark({ className = "h-8" }: { className?: string }) {
  const logoUrl = useLogoUrl();
  if (logoUrl !== DEFAULT_LOGO_URL) {
    return (
      <img
        src={logoUrl}
        alt="شعار Pure Table"
        decoding="async"
        className={`inline-block object-contain ${className}`}
      />
    );
  }
  return <PureTableMark className={`inline-block ${className}`} />;
}
