import { Languages } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function LanguageSwitcher({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { lang, setLang } = useLanguage();
  const next = lang === "en" ? "ar" : "en";
  const label = lang === "en" ? "العربية" : "English";
  const shortLabel = lang === "en" ? "ع" : "EN";

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setLang(next)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-sm font-semibold text-foreground transition hover:bg-accent"
        aria-label="Toggle language"
        title={label}
      >
        {shortLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      className={
        compact
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          : "inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
      }
      aria-label="Toggle language"
    >
      <Languages className="h-4 w-4" />
      {label}
    </button>
  );
}
