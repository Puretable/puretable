import { z } from "zod";
import { PLAN_FEATURES, PLAN_TIERS, type PlanTier } from "./plans";

/**
 * Business Owner Portal — shared types and pure helpers.
 *
 * Plans and feature limits come from `subscription_plans` (already the source of
 * truth for the public site). This module only adds subscription *history*.
 * No payment is processed; `payment_*` fields exist so a provider can be added later.
 */
export const SUBSCRIPTION_STATUSES = [
  "pending",
  "active",
  "suspended",
  "expired",
  "superseded",
  "cancelled",
  "rejected",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PaymentStatus = "not_required" | "unpaid" | "pending" | "paid" | "failed" | "refunded";

export type SubscriptionRow = {
  id: string;
  business_id: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  source: "owner" | "admin" | "legacy" | "system";
  period_months: number | null;
  requested_at: string;
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  payment_status: PaymentStatus;
  payment_provider: string | null;
  payment_reference: string | null;
  amount_halalas: number | null;
  currency: string;
  notes: string | null;
};

export type OwnerBusiness = {
  id: string;
  slug: string;
  name: string;
  name_ar: string | null;
  city: string;
  published: boolean;
  plan: PlanTier;
  cover_url: string | null;
  entitlements: {
    branch_limit: number | null;
    photo_limit: number;
    description_limit: number | null;
    show_links: boolean;
    analytics: "none" | "basic" | "full";
  };
  usage: {
    branches_published: number;
    branches_hidden_by_plan: number;
    branches_total: number;
    photos: number;
    links: number;
    menu_items: number;
  };
  current: SubscriptionRow | null;
  pending: SubscriptionRow | null;
  activated_count: number;
  /** An admin has suspended access: paid features stop and the portal becomes read-only. */
  access_suspended: boolean;
  suspension_reason: string | null;
};

export type OwnerReport = {
  level: "basic" | "full";
  days: 7 | 30 | 90;
  views: number;
  impressions: number;
  clicks: number;
  contactClicks: number;
  maps?: number;
  delivery?: number;
  booking?: number;
  whatsapp?: number;
  website?: number;
  phone?: number;
  social?: number;
  favorites?: number;
  previous?: { views: number; clicks: number };
  timeseries?: { date: string; views: number; clicks: number }[];
};

export const OWNER_REPORT_DAYS = [7, 30, 90] as const;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email("أدخل بريداً إلكترونياً صحيحاً."));

/** Supabase email codes are numeric; the length is a project setting (6 by default). */
export const OTP_CODE = /^\d{6,10}$/;

export const PLAN_PERIODS = [1, 12] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: "بانتظار التفعيل · Pending",
  active: "نشط · Active",
  suspended: "معلّق · Suspended",
  expired: "منتهي · Expired",
  superseded: "تم استبداله · Replaced",
  cancelled: "ملغى · Cancelled",
  rejected: "مرفوض · Rejected",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  not_required: "لا يوجد دفع",
  unpaid: "غير مدفوع",
  pending: "قيد المعالجة",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مسترد",
};

export const SOURCE_LABELS: Record<SubscriptionRow["source"], string> = {
  owner: "طلب المالك",
  admin: "الإدارة",
  legacy: "الباقة الحالية عند الإطلاق",
  system: "تلقائي",
};

const DAY_MS = 86_400_000;

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "Asia/Riyadh",
});

export function formatDate(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? empty : DATE_FORMAT.format(date);
}

/** Whole days left, rounded up; null for open-ended plans, 0 when already past. */
export function daysRemaining(endsAt: string | null, now = new Date()): number | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS));
}

export function isExpiringSoon(endsAt: string | null, now = new Date(), windowDays = 7) {
  const left = daysRemaining(endsAt, now);
  return left !== null && left <= windowDays;
}

/** Number of subscriptions that were actually activated (requests never approved don't count). */
export function activatedCount(history: Pick<SubscriptionRow, "starts_at">[]): number {
  return history.filter((row) => row.starts_at !== null).length;
}

export type PlanMove = "current" | "upgrade" | "downgrade";

export function planMove(current: PlanTier, target: PlanTier): PlanMove {
  if (current === target) return "current";
  return PLAN_TIERS.indexOf(target) > PLAN_TIERS.indexOf(current) ? "upgrade" : "downgrade";
}

export type OwnerFeature = {
  key: string;
  label: string;
  available: boolean;
  detail: string;
  /** Lowest plan that unlocks the feature when it is not available. */
  unlockedBy?: PlanTier;
};

const ANALYTICS_LABEL = { none: "غير متاحة", basic: "أساسية", full: "كاملة" } as const;

/** Features shown on the dashboard. Every value comes from the business's live plan definition. */
export function ownerFeatures(b: OwnerBusiness): OwnerFeature[] {
  const e = b.entitlements;
  const branchLimit = e.branch_limit === null ? "غير محدود" : String(e.branch_limit);
  return [
    {
      key: "branches",
      label: "الفروع",
      available: true,
      detail: `${b.usage.branches_published} من ${branchLimit}`,
    },
    {
      key: "photos",
      label: "الصور",
      available: true,
      detail: `${Math.min(b.usage.photos, e.photo_limit)} من ${e.photo_limit} تظهر للزوار`,
    },
    {
      key: "links",
      label: "روابط التواصل والتوصيل",
      available: e.show_links,
      detail: e.show_links ? `${b.usage.links} رابط` : "غير ظاهرة للزوار في هذه الباقة",
      unlockedBy: e.show_links ? undefined : "pro",
    },
    {
      key: "analytics",
      label: "التحليلات",
      available: e.analytics !== "none",
      detail: ANALYTICS_LABEL[e.analytics],
      unlockedBy: e.analytics === "none" ? "pro" : undefined,
    },
    {
      key: "comparison",
      label: "مقارنة الفترات وتفصيل النقرات",
      available: e.analytics === "full",
      detail: e.analytics === "full" ? "متاحة" : "متاحة في Premium",
      unlockedBy: e.analytics === "full" ? undefined : "premium",
    },
    {
      key: "featured",
      label: "الظهور المميز",
      available: PLAN_FEATURES[b.plan].featured,
      detail: PLAN_FEATURES[b.plan].featured ? "ضمن الأعمال المميزة" : "متاح في Premium",
      unlockedBy: PLAN_FEATURES[b.plan].featured ? undefined : "premium",
    },
  ];
}

const MESSAGES: [pattern: RegExp, message: string][] = [
  [/already on this plan/i, "عملك على هذه الباقة بالفعل."],
  [/forbidden|permission denied|42501/i, "لا تملك صلاحية تنفيذ هذا الإجراء."],
  [/does not include analytics/i, "التحليلات غير متاحة في باقتك الحالية."],
  [/only pending requests/i, "هذا الطلب لم يعد بانتظار المراجعة."],
  [/end date must be in the future/i, "يجب أن يكون تاريخ الانتهاء في المستقبل."],
  [/duplicate key|unique constraint|23505/i, "هذا السجل موجود مسبقاً."],
  [/access suspended/i, "تم تعليق وصولك من قبل الإدارة. تواصل معنا لإعادة التفعيل."],
  [/branch limit reached/i, "وصلت إلى الحد الأقصى للفروع في باقتك. أخفِ فرعاً أو ارفع الباقة."],
  [/photo limit reached/i, "وصلت إلى الحد الأقصى للصور في باقتك."],
  [/photo must be uploaded/i, "ارفع الصور من خلال البوابة."],
  [/menu item limit/i, "وصلت إلى الحد الأقصى لأصناف القائمة (200)."],
  [/only jpg, png/i, "الصور المسموحة: JPG أو PNG أو WebP أو GIF."],
  [/too many uploads/i, "عدد كبير من الرفع. حاول لاحقاً."],
  [/reactivate the suspended/i, "أعد تفعيل الوصول المعلّق أولاً."],
  [/already suspended/i, "الوصول معلّق بالفعل."],
  [/not suspended/i, "الوصول غير معلّق."],
  [/no current subscription/i, "لا يوجد اشتراك حالي لتعليقه."],
];

/** Turns database/server errors into a short Arabic message; never leaks internals. */
export function friendlyPortalError(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return MESSAGES.find(([pattern]) => pattern.test(text))?.[1] ?? "تعذر إكمال الطلب. حاول مجدداً.";
}
