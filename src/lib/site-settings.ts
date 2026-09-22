// Site-wide appearance + content settings that admins control from the dashboard.
// Stored as a single row in the `site_settings` table (id = 'default').

import enLocale from "@/lib/i18n/locales/en.json";
import arLocale from "@/lib/i18n/locales/ar.json";
import { CATEGORY_DEFS } from "@/lib/categories";

const CATEGORY_LABELS_AR: Record<string, string> = {
  restaurant: "مطاعم",
  cafe: "مقاهي",
  bakery: "مخابز",
  fine_dining: "مطاعم راقية",
  dessert: "حلويات",
  delivery: "توصيل",
  home: "أسر منتجة",
  supermarket: "سوبرماركت",
};

export type SiteTheme = {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  secondary: string;
  fontScale: number; // 1 = default
  radius: number; // rem
};

export type LocalizedText = { en: string; ar: string };

/** Editable text blocks. Anything left empty falls back to the built-in translation. */
export type SiteContent = Record<string, LocalizedText>;

/** Toggles for showing / hiding whole sections of the site. */
export type SiteSections = Record<string, boolean>;

/** A button an admin can add / edit / hide anywhere it is supported. */
export type SiteButton = { id: string; label: LocalizedText; href: string; visible: boolean };

/** A card in the homepage quick-actions row. */
export type SiteCard = {
  id: string;
  title: LocalizedText;
  sub: LocalizedText;
  href: string;
  image?: string;
  visible: boolean;
};

/** A free-form section an admin created from the dashboard. */
export type SiteBlock = {
  id: string;
  name: string;
  title: LocalizedText;
  body: LocalizedText;
  image?: string;
  buttons: SiteButton[];
};

/** A filter (category) created by an admin from the dashboard. */
export type SiteFilter = {
  id: string;
  /** URL slug — the page lives at /c/<slug>. */
  slug: string;
  name_ar: string;
  name_en: string;
  /** Main filter (shown first) vs secondary category. */
  primary: boolean;
  visible: boolean;
  order: number;
};

/** Ordering, custom sections, media overrides and editable cards. */
export type SiteLayout = {
  order: string[];
  blocks: SiteBlock[];
  media: Record<string, string>;
  cards: SiteCard[];
  filters: SiteFilter[];
  /** Order of the action boxes on every business page (phone, maps, …). */
  actions: string[];
};

/** Action groups shown on a business page, in their default order. */
export const ACTION_GROUPS: { key: string; label: string }[] = [
  { key: "phone", label: "الاتصال / Phone" },
  { key: "whatsapp", label: "واتساب / WhatsApp" },
  { key: "maps", label: "الموقع على الخريطة / Location" },
  { key: "booking", label: "الحجز / Booking apps" },
  { key: "delivery", label: "تطبيقات التوصيل / Delivery apps" },
  { key: "website", label: "الموقع الإلكتروني / Website" },
  { key: "social", label: "حسابات التواصل / Social" },
];

export const DEFAULT_ACTION_ORDER = ACTION_GROUPS.map((a) => a.key);

/** Which action group a link platform belongs to. */
export function actionGroupOf(platform: string): string {
  if (platform === "phone") return "phone";
  if (platform === "whatsapp") return "whatsapp";
  if (platform === "maps") return "maps";
  if (platform === "requeue" || platform === "mytable") return "booking";
  if (["hungerstation", "jahez", "thechefz", "toyou", "keeta"].includes(platform))
    return "delivery";
  if (platform === "website") return "website";
  return "social";
}

export type SiteSettings = {
  theme: SiteTheme;
  content: SiteContent;
  sections: SiteSections;
  layout: SiteLayout;
};

export const DEFAULT_THEME: SiteTheme = {
  primary: "#2f7d54",
  primaryForeground: "#ffffff",
  background: "#ffffff",
  foreground: "#141414",
  secondary: "#f6f6f6",
  fontScale: 1,
  radius: 0.75,
};

/* -------------------------------------------------------------------------- */
/* Every sentence on the site is editable: the list below is generated from the */
/* translation files, so a new string becomes editable automatically.           */
/* -------------------------------------------------------------------------- */

export type TextEntry = { key: string; en: string; ar: string };
export type TextGroup = { group: string; label: string; entries: TextEntry[] };

const GROUP_LABELS: Record<string, string> = {
  brand: "الهوية / Brand",
  nav: "القائمة العلوية / Navigation",
  common: "أزرار وعبارات عامة / Common",
  cities: "المدن / Cities",
  filters: "الفلاتر / Filters",
  days: "أيام الأسبوع / Days",
  home: "الصفحة الرئيسية / Home page",
  categories: "بطاقات الأقسام / Category cards",
  pages: "عناوين صفحات الأقسام / Category pages",
  business: "صفحة النشاط / Business page",
  about: "من نحن / About",
  contact: "تواصل معنا / Contact",
  footer: "التذييل / Footer",
  safety: "نظام النقاط / Safety dots",
  auth: "تسجيل الدخول / Auth",
  banner: "شريط علوي / Banner",
};

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

const FLAT_EN = flatten(enLocale as unknown as Record<string, unknown>);
const FLAT_AR = flatten(arLocale as unknown as Record<string, unknown>);

/** All editable text, grouped by page/section. */
export const TEXT_GROUPS: TextGroup[] = (() => {
  const groups = new Map<string, TextEntry[]>();
  for (const key of Object.keys(FLAT_EN)) {
    const group = key.split(".")[0] ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ key, en: FLAT_EN[key] ?? "", ar: FLAT_AR[key] ?? "" });
  }
  return [...groups.entries()].map(([group, entries]) => ({
    group,
    label: GROUP_LABELS[group] ?? group,
    entries,
  }));
})();

export const DEFAULT_TEXT = { en: FLAT_EN, ar: FLAT_AR };

/**
 * Content keys the admin edits in Arabic only — the English side is generated automatically on
 * save (see `saveSiteSettings`) and never typed by hand. Keep this in sync with the field lists in
 * `admin.appearance.tsx`; both reference these exact dotted keys.
 */
export const AUTO_TRANSLATE_KEYS = [
  "home.badge",
  "home.title_1",
  "home.title_2",
  "home.subtitle",
  "legal.privacy_body",
  "legal.terms_body",
  "pages.restaurants_desc",
  "pages.cafes_desc",
  "pages.bakeries_desc",
  "pages.desserts_desc",
  "pages.home_desc",
  "pages.supermarkets_desc",
] as const;

/** Turn dotted overrides into a nested i18next resource bundle. */
export function toResourceBundle(content: SiteContent, lang: "en" | "ar") {
  const bundle: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    const v = value?.[lang]?.trim();
    if (!v) continue;
    const parts = key.split(".");
    let node = bundle;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) node[p] = v;
      else {
        if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
        node = node[p] as Record<string, unknown>;
      }
    });
  }
  return bundle;
}

/** Sections that can be hidden site-wide. */
/** Categories that can be shown / hidden on the homepage "Discover" grid. */
const HOMEPAGE_CATEGORIES: { key: string; label: string }[] = CATEGORY_DEFS.map((c) => ({
  key: `cat_${c.value}`,
  label: `فلتر: ${CATEGORY_LABELS_AR[c.value] ?? c.value} / ${c.value}`,
}));

export const EDITABLE_SECTIONS: { key: string; label: string }[] = [
  { key: "site_live", label: "الموقع مفتوح للزوار (إطفاؤه يعرض صفحة قريبًا) / Site live" },
  { key: "home_quick_actions", label: "الخيارات الأربعة الرئيسية / Quick actions" },
  { key: "home_discover", label: "قسم اكتشف / Discover" },
  { key: "home_nearest", label: "قسم الأقرب إليك / Nearest to you" },
  { key: "home_all_places", label: "قسم جميع الأماكن / All places" },
  ...HOMEPAGE_CATEGORIES,
  { key: "hero_image", label: "صورة الهيرو / Hero image" },
  { key: "home_badge", label: "الجملة التعريفية أعلى الصفحة / Intro badge" },
  { key: "hero_search", label: "شريط البحث / Search bar" },
  { key: "hero_cities", label: "أزرار المدن / City buttons" },
  { key: "categories", label: "قسم الأقسام / Categories" },
  { key: "featured", label: "الأماكن المميزة / Featured places" },
  { key: "why", label: "لماذا بيور تيبل / Why Pure Table" },
  { key: "header_cta", label: "زر بوابة أصحاب الأعمال / Business Owner Portal button" },
  { key: "header_sign_in", label: "زر تسجيل الدخول / Sign in button" },
  { key: "header_language", label: "زر تغيير اللغة / Language switch" },
];

/** Homepage sections, in their default top-to-bottom order. */
export const HOME_SECTION_ORDER = [
  "hero_image",
  "hero_search",
  "home_quick_actions",
  "home_discover",
  "home_nearest",
  "home_all_places",
] as const;

const card = (id: string, titleKey: string, subKey: string, href: string): SiteCard => ({
  id,
  title: { en: FLAT_EN[titleKey] ?? "", ar: FLAT_AR[titleKey] ?? "" },
  sub: { en: FLAT_EN[subKey] ?? "", ar: FLAT_AR[subKey] ?? "" },
  href,
  visible: true,
});

/** Quick-action cards used until the admin customises them. */
export const DEFAULT_CARDS: SiteCard[] = [
  card("near", "home.q_near", "home.q_near_sub", "#near-me"),
  card("book", "home.q_book", "home.q_book_sub", "/s/dine-in"),
  card("featured", "home.q_featured", "home.q_featured_sub", "/featured"),
];

/** Cards removed from the homepage — dropped from any saved layout. */
export const RETIRED_CARD_IDS = ["delivery", "pickup"];

export const DEFAULT_LAYOUT: SiteLayout = {
  order: [...HOME_SECTION_ORDER],
  blocks: [],
  media: {},
  cards: DEFAULT_CARDS,
  filters: [],
  actions: [...DEFAULT_ACTION_ORDER],
};

export const DEFAULT_SETTINGS: SiteSettings = {
  theme: DEFAULT_THEME,
  content: {},
  sections: Object.fromEntries(EDITABLE_SECTIONS.map((s) => [s.key, true])),
  layout: DEFAULT_LAYOUT,
};

export function normalizeLayout(raw: unknown): SiteLayout {
  const l = (raw ?? {}) as Partial<SiteLayout>;
  const blocks = Array.isArray(l.blocks) ? l.blocks : [];
  const savedOrder = Array.isArray(l.order) ? l.order : [];
  const known = [...HOME_SECTION_ORDER, ...blocks.map((b) => b.id)];
  const order = [
    ...savedOrder.filter((k) => known.includes(k)),
    ...known.filter((k) => !savedOrder.includes(k)),
  ];
  return {
    order,
    blocks,
    media: (l.media as Record<string, string>) ?? {},
    // Saved layouts keep their order, but retired cards are dropped and cards
    // added later (e.g. "Featured places") are appended automatically.
    cards: (() => {
      const saved = (Array.isArray(l.cards) ? l.cards : []).filter(
        (c) => !RETIRED_CARD_IDS.includes(String(c?.id)),
      );
      if (!saved.length) return DEFAULT_CARDS;
      const missing = DEFAULT_CARDS.filter((d) => !saved.some((c) => c.id === d.id));
      return [...saved, ...missing];
    })(),
    filters: (Array.isArray(l.filters) ? l.filters : []).map((f, i) => {
      const clean = (s: unknown) =>
        String(s ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
      // A filter must never be dropped for a missing slug — fall back to the
      // English name, then to its id, so admin-created filters always persist.
      const slug = clean(f.slug) || clean(f.name_en) || clean(f.id) || `filter-${i + 1}`;
      return {
        id: String(f.id ?? `flt_${i}`),
        slug,
        name_ar: String(f.name_ar ?? ""),
        name_en: String(f.name_en ?? ""),
        primary: !!f.primary,
        visible: f.visible !== false,
        order: typeof f.order === "number" ? f.order : i,
      };
    }),
    // Unknown / removed keys are dropped and new ones appended, so the saved
    // order keeps working when the action list changes.
    actions: [
      ...(Array.isArray(l.actions) ? l.actions : []).filter((k) =>
        DEFAULT_ACTION_ORDER.includes(k),
      ),
      ...DEFAULT_ACTION_ORDER.filter(
        (k) => !(Array.isArray(l.actions) ? l.actions : []).includes(k),
      ),
    ],
  };
}

export function normalizeSettings(row: unknown): SiteSettings {
  const r = (row ?? {}) as Partial<Record<"theme" | "content" | "sections" | "layout", unknown>>;
  const theme = { ...DEFAULT_THEME, ...((r.theme as Partial<SiteTheme>) ?? {}) };
  const sections = { ...DEFAULT_SETTINGS.sections, ...((r.sections as SiteSections) ?? {}) };
  const content = ((r.content as SiteContent) ?? {}) as SiteContent;
  return { theme, content, sections, layout: normalizeLayout(r.layout) };
}

/** Label shown in the admin section list. */
export function sectionLabel(key: string, blocks: SiteBlock[]): string {
  const custom = blocks.find((b) => b.id === key);
  if (custom) return custom.name || custom.title.ar || custom.title.en || key;
  return EDITABLE_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

/** Push the admin theme onto the document as CSS variables. */
export function applyTheme(theme: SiteTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--card", theme.background);
  root.style.setProperty("--popover", theme.background);
  root.style.setProperty("--foreground", theme.foreground);
  root.style.setProperty("--card-foreground", theme.foreground);
  root.style.setProperty("--popover-foreground", theme.foreground);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-foreground", theme.foreground);
  root.style.setProperty("--muted", theme.secondary);
  root.style.setProperty(
    "--primary-soft",
    `color-mix(in oklab, ${theme.primary} 12%, ${theme.background})`,
  );
  root.style.setProperty(
    "--accent",
    `color-mix(in oklab, ${theme.primary} 14%, ${theme.background})`,
  );
  root.style.setProperty("--accent-foreground", theme.primary);
  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, ${theme.primary}, color-mix(in oklab, ${theme.primary} 65%, white))`,
  );
  root.style.setProperty("--radius", `${theme.radius}rem`);
  root.style.fontSize = `${Math.round(16 * theme.fontScale)}px`;
}
