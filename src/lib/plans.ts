/**
 * Subscription packages.
 *
 * Plans are set manually by an admin (no online payment, no renewal). This
 * module defines fixed tier identities and initial defaults. Live entitlements
 * come from subscription_plans via subscriptions.server.ts, for every business.
 *
 * "أسر منتجة" remains a business category, not a paid subscription tier.
 */
export type PlanTier = "free" | "pro" | "premium";

export const PLAN_TIERS: PlanTier[] = ["free", "pro", "premium"];

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free — مجاني",
  pro: "Pro — احترافي",
  premium: "Premium — مميز",
};

export const PLAN_SUMMARIES: Record<PlanTier, string> = {
  free: "معلومات أساسية وفرع واحد وصورة واحدة.",
  pro: "حتى 3 فروع، روابط التواصل، 8 صور وتحليلات أساسية.",
  premium: "فروع غير محدودة، ظهور مميز، روابط كاملة، 15 صورة وتحليلات كاملة.",
};

export type PlanFeatures = {
  /** Full business page vs. the very basic Free page. */
  fullPage: boolean;
  /** Max characters of the description shown to visitors (null = no limit). */
  descriptionLimit: number | null;
  /** Cover + gallery photos allowed in total. */
  photoLimit: number;
  /** Show delivery / booking / website / WhatsApp / menu links. */
  showLinks: boolean;
  /** Higher wins when ordering search and listing results. */
  rank: number;
  /** none = no analytics, basic = totals, full = totals + period comparison. */
  analytics: "none" | "basic" | "full";
  /** Appears in the homepage "Featured" section and on /featured. */
  featured: boolean;
  /** Automatic periodic performance report. */
  autoReport: boolean;
  /** Maximum visible branches; null means unlimited. */
  branchLimit: number | null;
};

const PRO_FEATURES: PlanFeatures = {
  fullPage: true,
  descriptionLimit: null,
  photoLimit: 8,
  showLinks: true,
  rank: 1,
  analytics: "basic",
  featured: false,
  autoReport: false,
  branchLimit: 3,
};

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    fullPage: false,
    descriptionLimit: 160,
    photoLimit: 1,
    showLinks: false,
    rank: 0,
    analytics: "none",
    featured: false,
    autoReport: false,
    branchLimit: 1,
  },
  pro: PRO_FEATURES,
  premium: {
    fullPage: true,
    descriptionLimit: null,
    photoLimit: 15,
    showLinks: true,
    rank: 2,
    analytics: "full",
    featured: true,
    autoReport: true,
    branchLimit: null,
  },
};

export function planOf(b: PlanAccess | null | undefined): PlanTier {
  // Read-only compatibility for legacy rows. "Family" is never exposed as a
  // package; old subscription values are treated as Pro while "أسر منتجة"
  // remains a normal business category (`home`).
  const raw = (b?.plan ?? "free").toLowerCase();
  const p = (raw === "family" ? "pro" : raw) as PlanTier;
  return PLAN_TIERS.includes(p) ? p : "free";
}

export type PlanAccess = { plan?: string | null; entitlements?: PlanFeatures };

/** Gluten-free menu items are a paid feature: Pro and Premium only. */
export function canUseMenu(b: PlanAccess | null | undefined): boolean {
  return planOf(b) !== "free";
}

export function featuresOf(b: PlanAccess | null | undefined): PlanFeatures {
  return b?.entitlements ?? PLAN_FEATURES[planOf(b)];
}

/** Sort key used by search and listing pages: premium > pro > free. */
export function planRank(b: PlanAccess) {
  return featuresOf(b).rank;
}

/** Remaining published branch slots for the package; null means unlimited. */
export function remainingBranchSlots(plan: PlanTier, publishedCount: number, features = PLAN_FEATURES[plan]): number | null {
  const limit = features.branchLimit;
  return limit === null ? null : Math.max(0, limit - publishedCount);
}

export function branchLimitLabel(plan: PlanTier, features = PLAN_FEATURES[plan]): string {
  const limit = features.branchLimit;
  return limit === null ? "غير محدود" : String(limit);
}

/**
 * Order results by package first, keeping the incoming order inside each tier
 * so the existing relevance / distance / creation order still decides ties.
 */
export function rankByPlan<T extends { plan?: string | null }>(items: T[]): T[] {
  return items
    .map((b, i) => ({ b, i }))
    .sort((x, y) => planRank(y.b) - planRank(x.b) || x.i - y.i)
    .map((x) => x.b);
}

/** Description shown to visitors — trimmed on the Free package. */
export function visibleDescription(b: PlanAccess, text: string) {
  const limit = featuresOf(b).descriptionLimit;
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

/** Cover + gallery photos a visitor may see, capped by the package. */
export function visiblePhotos(b: PlanAccess & { cover?: string | null; photos?: string[] | null }) {
  const all = [b.cover, ...(b.photos ?? [])].filter((p): p is string => !!p);
  return Array.from(new Set(all)).slice(0, featuresOf(b).photoLimit);
}
