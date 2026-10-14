import { useTranslation } from "react-i18next";

/**
 * The mark + stacked brand text: the Arabic name, the "PURE TABLE" caption, then the caller's own
 * tagline underneath (unchanged — passed in as children, not generated here). "PURE TABLE" is a
 * fixed design element, kept in English in both site languages.
 */
export function WordmarkText({
  nameClassName = "",
  captionClassName = "",
}: {
  nameClassName?: string;
  captionClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <span
        className={`font-semibold tracking-tight ${nameClassName}`}
        style={{ fontFamily: "'El Messiri', var(--font-display)", color: "#1F2A22" }}
      >
        {t("brand.name")}
      </span>
      <span
        className={`font-medium ${captionClassName}`}
        style={{
          fontFamily: "'El Messiri', var(--font-display)",
          color: "#2E6B3F",
          letterSpacing: "0.14em",
        }}
      >
        PURE TABLE
      </span>
    </>
  );
}
