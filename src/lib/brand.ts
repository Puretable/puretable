// The previous wheat mark (src/assets/pure-table-logo.png) is kept in the repo, unreferenced, so
// rolling back is a one-line import change.
import defaultLogoUrl from "@/assets/pure-table-mark.png";

/** The fallback brand image used until an administrator publishes a replacement. */
export const DEFAULT_LOGO_URL = defaultLogoUrl;
