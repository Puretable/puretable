import { useTranslation } from "react-i18next";
import type { SafetyLevel } from "@/data/businesses";

/**
 * green = 100% dedicated gluten-free / celiac safe.
 * red   = gluten-free options available, customer must confirm with staff.
 * none  = no rating shown at all (chosen per business in the admin).
 */
export function SafetyDot({ level, className = "" }: { level: SafetyLevel; className?: string }) {
  if (level === "none") return null;
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${level === "green" ? "bg-safety-safe" : "bg-safety-caution"} ${className}`}
    />
  );
}

export function SafetyBadge({ level, size = "sm" }: { level: SafetyLevel; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  if (level === "none") return null;
  const safe = level === "green";
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border bg-background/90 font-medium backdrop-blur ${
        safe
          ? "border-safety-safe/40 text-safety-safe"
          : "border-safety-caution/40 text-safety-caution"
      } ${size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"}`}
    >
      <SafetyDot level={level} />
      {t(safe ? "safety.safe_label" : "safety.caution_label")}
    </span>
  );
}

/** Orange dot shown when the place cooks in a kitchen shared with gluten. */
export function SharedKitchenBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-safety-shared/40 bg-background/90 font-medium text-safety-shared backdrop-blur ${
        size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-shared" />
      {t("safety.shared_label")}
    </span>
  );
}

/**
 * The one merged disclaimer (not verified, not a medical guarantee, confirm ingredients and
 * allergens, link to the full page). Rendered exactly once per page, inside whichever box is
 * shown first — the main green/red box, or the shared-kitchen box when there is no main box, or
 * as a standalone line when neither box is shown (safety level "none").
 */
function DisclaimerLine({ disclaimerHref }: { disclaimerHref: string }) {
  const { t } = useTranslation();
  return (
    <>
      {t("safety.source_note")}{" "}
      <a href={disclaimerHref} className="font-medium text-primary underline underline-offset-2">
        {t("safety.see_disclaimer")}
      </a>
    </>
  );
}

export function SafetyNote({
  level,
  sharedKitchen = false,
  precautionsNote,
  disclaimerHref = "#disclaimer",
}: {
  level: SafetyLevel;
  sharedKitchen?: boolean;
  precautionsNote?: string | null;
  /** Where the "read the disclaimer" link points (anchor on the business page). */
  disclaimerHref?: string;
}) {
  const { t } = useTranslation();
  const safe = level === "green";
  const hasMainBox = level !== "none";
  return (
    <div className="space-y-3">
      {hasMainBox && (
        <div
          className={`rounded-2xl border p-4 ${
            safe
              ? "border-safety-safe/30 bg-safety-safe/5"
              : "border-safety-caution/30 bg-safety-caution/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <SafetyDot level={level} />
            <span
              className={`text-sm font-semibold ${safe ? "text-safety-safe" : "text-safety-caution"}`}
            >
              {t(safe ? "safety.safe_label" : "safety.caution_label")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <DisclaimerLine disclaimerHref={disclaimerHref} />
          </p>
        </div>
      )}
      {sharedKitchen && (
        <div className="rounded-2xl border border-safety-shared/30 bg-safety-shared/5 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-shared" />
            <span className="text-sm font-semibold text-safety-shared">
              {t("safety.shared_label")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {precautionsNote?.trim() || t("safety.shared_desc")}
          </p>
          {!hasMainBox && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <DisclaimerLine disclaimerHref={disclaimerHref} />
            </p>
          )}
        </div>
      )}
      {!hasMainBox && !sharedKitchen && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <DisclaimerLine disclaimerHref={disclaimerHref} />
        </p>
      )}
    </div>
  );
}

/** The establishment's overall kitchen level, in the same green/orange/red domain as menu-item
 * safety badges — used to hide a per-item badge that just repeats the establishment's own level. */
export function establishmentMenuLevel(
  level: SafetyLevel,
  sharedKitchen: boolean,
): "green" | "orange" | "red" | null {
  if (sharedKitchen) return "orange";
  if (level === "none") return null;
  return level;
}
