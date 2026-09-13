import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Palette,
  RotateCcw,
  Save,
  ScrollText,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signCoverUploadUrl } from "@/lib/admin.functions";
import { fetchSiteSettings, SITE_SETTINGS_KEY, useSiteSettings } from "@/hooks/use-site-settings";
import { applyTheme, DEFAULT_SETTINGS, DEFAULT_TEXT, type SiteSettings } from "@/lib/site-settings";
import { DEFAULT_LOGO_URL } from "@/lib/brand";
import heroImageFallback from "@/assets/hero.jpg";
import { logAudit } from "@/lib/audit";
import { saveSiteSettings, setSiteLive } from "@/lib/site-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/appearance")({
  component: AppearancePage,
});

const WELCOME_FIELDS = [
  { key: "home.badge", label: "الجملة التعريفية القصيرة" },
  { key: "home.title_1", label: "العنوان الرئيسي — السطر الأول" },
  { key: "home.title_2", label: "العنوان الرئيسي — السطر الملوّن" },
  { key: "home.subtitle", label: "النص الترحيبي" },
] as const;

/**
 * Long-form legal text shown on /privacy and /terms. Edited from
 * the admin so the page copy stays in sync with what lawyers sign off on.
 * Line breaks in the body are preserved by `whitespace-pre-line` in LegalPage.
 */
const LEGAL_FIELDS = [
  { key: "legal.privacy_body", label: "نص سياسة الخصوصية" },
  { key: "legal.terms_body", label: "نص الشروط والأحكام" },
] as const;

/**
 * Pure Table's official contact handles — shown as footer icons (and the
 * phone/email as text under "Get in touch"). Each field accepts either a
 * full URL or a plain handle / number; `contact.ts` helpers normalise them.
 */
const CONTACT_FIELDS = [
  {
    key: "contact_info.email",
    label: "البريد الرسمي",
    placeholder: "hello@pure-table.example",
    type: "email" as const,
    help: "يظهر كأيقونة Mail في الفوتر، وأيضاً كرابط في قسم «تواصل».",
  },
  {
    key: "contact_info.phone",
    label: "رقم الهاتف",
    placeholder: "05xxxxxxxx أو +9665xxxxxxxx",
    type: "tel" as const,
    help: "يظهر كنص قابل للضغط في قسم «تواصل» تحت الأيقونات.",
  },
  {
    key: "contact_info.instagram",
    label: "Instagram",
    placeholder: "@pure_table أو رابط كامل",
    type: "text" as const,
    help: "يظهر كأيقونة Instagram في الفوتر.",
  },
  {
    key: "contact_info.tiktok",
    label: "TikTok",
    placeholder: "@pure_table أو رابط كامل",
    type: "text" as const,
    help: "يظهر كأيقونة TikTok في الفوتر.",
  },
  {
    key: "contact_info.whatsapp",
    label: "WhatsApp",
    placeholder: "05xxxxxxxx أو wa.me/9665xxxxxxxx",
    type: "text" as const,
    help: "يظهر كأيقونة WhatsApp في الفوتر.",
  },
] as const;

function AppearancePage() {
  const queryClient = useQueryClient();
  const saved = useSiteSettings();
  const signUpload = useServerFn(signCoverUploadUrl);
  const saveSettings = useServerFn(saveSiteSettings);
  const updateSiteLive = useServerFn(setSiteLive);
  const [draft, setDraft] = useState<SiteSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [launchReady, setLaunchReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSiteSettings(false)
      .then((settings) => {
        setDraft(settings);
        setLaunchReady(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    applyTheme(draft.theme);
    return () => applyTheme(saved.theme);
  }, [draft.theme, saved.theme]);

  const logoUrl = draft.layout.media["logo"]?.trim() || DEFAULT_LOGO_URL;
  const heroUrl = draft.layout.media["hero"]?.trim() || heroImageFallback;
  const primaryText = readableText(draft.theme.primary);
  const primaryContrast = contrastRatio(draft.theme.primary, primaryText);
  const secondaryContrast = contrastRatio(draft.theme.secondary, draft.theme.foreground);

  function setColor(key: "primary" | "secondary", value: string) {
    if (!isHexColor(value)) return;
    setDraft((current) => ({
      ...current,
      theme: {
        ...current.theme,
        [key]: value,
        ...(key === "primary" ? { primaryForeground: readableText(value) } : {}),
      },
    }));
  }

  function setText(key: string, language: "ar" | "en", value: string) {
    setDraft((current) => ({
      ...current,
      content: {
        ...current.content,
        [key]: { ...(current.content[key] ?? { ar: "", en: "" }), [language]: value },
      },
    }));
  }

  function setMedia(key: "logo" | "hero", value: string) {
    setDraft((current) => ({
      ...current,
      layout: {
        ...current.layout,
        media: { ...current.layout.media, [key]: value },
      },
    }));
  }

  async function upload(file: File, purpose: "logo" | "hero") {
    validateImage(file);
    const { token, path, readUrl } = await signUpload({
      data: { filename: `site-${purpose}-${file.name}` },
    });
    const { error: uploadError } = await supabase.storage
      .from("business-covers")
      .uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    setMedia(purpose, readUrl);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const next: SiteSettings = {
      ...draft,
      theme: { ...draft.theme, primaryForeground: readableText(draft.theme.primary) },
    };
    try {
      await saveSettings({ data: { settings: next } });
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "تعذر حفظ إعدادات الموقع.");
      return;
    }
    setBusy(false);
    setDraft(next);
    logAudit("publish_settings", "site_settings", "default");
    await queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
    setMessage("تم حفظ الهوية ونشرها على الموقع.");
  }

  function resetIdentity() {
    setDraft((current) => {
      const content = { ...current.content };
      for (const field of WELCOME_FIELDS) delete content[field.key];
      for (const field of LEGAL_FIELDS) delete content[field.key];
      for (const field of CONTACT_FIELDS) delete content[field.key];
      const media = { ...current.layout.media };
      delete media.logo;
      delete media.hero;
      return {
        ...current,
        theme: {
          ...current.theme,
          primary: DEFAULT_SETTINGS.theme.primary,
          primaryForeground: DEFAULT_SETTINGS.theme.primaryForeground,
          secondary: DEFAULT_SETTINGS.theme.secondary,
        },
        content,
        layout: { ...current.layout, media },
      };
    });
    setMessage(null);
    setError(null);
  }

  async function toggleLaunch() {
    const live = draft.sections.site_live === false;
    if (
      !window.confirm(
        live
          ? "إطلاق الموقع وإخفاء صفحة قريباً؟ ستظهر فقط المحلات التي وافقت على نشرها."
          : "تفعيل صفحة قريباً للزوار؟ سيبقى دخول الأدمن متاحاً.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { sections } = await updateSiteLive({ data: { live } });
      setDraft((previous) => ({ ...previous, sections }));
      await queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
      logAudit(live ? "launch_site" : "enable_coming_soon", "site_settings", "default");
      setMessage(live ? "تم إطلاق الموقع وإخفاء صفحة قريباً." : "تم تفعيل صفحة قريباً للزوار.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تغيير حالة الموقع.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">المظهر والهوية</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            التحكم بإطلاق الموقع والشعار والألوان وصورة الواجهة والنصوص الترحيبية والنصوص القانونية
            وحسابات التواصل.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetIdentity}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:border-primary/40"
          >
            <RotateCcw className="h-4 w-4" /> استعادة الافتراضي
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !launchReady}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ ونشر
          </button>
        </div>
      </header>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft p-3 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Panel title="إطلاق الموقع / صفحة قريباً" icon={Monitor}>
        <p className="text-sm font-medium">
          {!launchReady
            ? "جارٍ تحميل حالة الموقع…"
            : draft.sections.site_live === false
              ? "صفحة قريباً مفعّلة للزوار"
              : "الموقع مفتوح للزوار"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          يمكن للزوار تسجيل اهتمامهم أثناء التجهيز. عند الإطلاق، أخفِ الصفحة من الزر أدناه. هذا لا
          ينشر أي محل مخفي، ولا يغيّر إعدادات المظهر.
        </p>
        <button
          type="button"
          disabled={busy || !launchReady}
          onClick={() => void toggleLaunch()}
          className="mt-4 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy
            ? "جارٍ الحفظ…"
            : draft.sections.site_live === false
              ? "إطلاق الموقع وإخفاء صفحة قريباً"
              : "إعادة تفعيل صفحة قريباً"}
        </button>
      </Panel>

      <Panel title="الشعار الموحّد" icon={ImageIcon}>
        <p className="text-sm text-muted-foreground">
          هذه الصورة نفسها تُستخدم في الهيدر والفوتر ولوحة الإدارة وأيقونة المتصفح. لا توجد نسخة
          شعار منفصلة.
        </p>
        <MediaField
          kind="logo"
          value={draft.layout.media["logo"] ?? ""}
          fallback={DEFAULT_LOGO_URL}
          onChange={(value) => setMedia("logo", value)}
          onUpload={(file) => upload(file, "logo")}
          onError={setError}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <LogoPreview label="أيقونة المتصفح" className="h-10 w-10 rounded-lg" url={logoUrl} />
          <LogoPreview label="رأس الموقع" className="h-14 w-14" url={logoUrl} />
          <LogoPreview label="تذييل الموقع" className="h-16 w-16" url={logoUrl} />
        </div>
      </Panel>

      <Panel title="الألوان الأساسية" icon={Palette}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="اللون الأساسي"
            value={draft.theme.primary}
            onChange={(value) => setColor("primary", value)}
            contrast={primaryContrast}
          />
          <ColorField
            label="اللون الثانوي"
            value={draft.theme.secondary}
            onChange={(value) => setColor("secondary", value)}
            contrast={secondaryContrast}
          />
        </div>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-background p-4">
          <button className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
            زر أساسي
          </button>
          <span className="rounded-full bg-secondary px-5 py-2 text-sm text-secondary-foreground">
            عنصر ثانوي
          </span>
        </div>
      </Panel>

      <Panel title="صورة الواجهة الرئيسية" icon={Monitor}>
        <MediaField
          kind="hero"
          value={draft.layout.media["hero"] ?? ""}
          fallback={heroImageFallback}
          onChange={(value) => setMedia("hero", value)}
          onUpload={(file) => upload(file, "hero")}
          onError={setError}
        />
        <div className="overflow-hidden rounded-3xl border border-border bg-secondary">
          <img
            src={heroUrl}
            alt="معاينة صورة الواجهة"
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/7]"
          />
        </div>
      </Panel>

      <Panel title="النصوص الترحيبية">
        <div className="space-y-5">
          {WELCOME_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2 rounded-2xl border border-border p-4">
              <h3 className="text-sm font-semibold">{field.label}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="العربية"
                  dir="rtl"
                  value={draft.content[field.key]?.ar ?? ""}
                  placeholder={DEFAULT_TEXT.ar[field.key] ?? ""}
                  onChange={(value) => setText(field.key, "ar", value)}
                />
                <TextField
                  label="English"
                  dir="ltr"
                  value={draft.content[field.key]?.en ?? ""}
                  placeholder={DEFAULT_TEXT.en[field.key] ?? ""}
                  onChange={(value) => setText(field.key, "en", value)}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="النصوص القانونية" icon={ScrollText}>
        <p className="text-sm text-muted-foreground">
          محتوى صفحتي «سياسة الخصوصية» و«الشروط والأحكام». النص الافتراضي موجود في ملفات الترجمة —
          اكتب فوقه ثم اضغط «حفظ ونشر» ليتحدّث ما يراه الزائر فوراً. الفراغات بين الفقرات والسطور
          تُحفظ كما هي.
        </p>
        <div className="space-y-5">
          {LEGAL_FIELDS.map((field) => (
            <div key={field.key} className="space-y-3 rounded-2xl border border-border p-4">
              <h3 className="text-sm font-semibold">{field.label}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <LongTextField
                  label="العربية"
                  dir="rtl"
                  rows={14}
                  value={draft.content[field.key]?.ar ?? ""}
                  placeholder={DEFAULT_TEXT.ar[field.key] ?? ""}
                  onChange={(value) => setText(field.key, "ar", value)}
                />
                <LongTextField
                  label="English"
                  dir="ltr"
                  rows={14}
                  value={draft.content[field.key]?.en ?? ""}
                  placeholder={DEFAULT_TEXT.en[field.key] ?? ""}
                  onChange={(value) => setText(field.key, "en", value)}
                />
              </div>
              <a
                href={field.key === "legal.privacy_body" ? "/privacy" : "/terms"}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                معاينة الصفحة كما يراها الزائر
              </a>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="التواصل والحسابات" icon={AtSign}>
        <p className="text-sm text-muted-foreground">
          الحسابات الرسمية وأرقام التواصل. أيقونات الفوتر (Instagram و TikTok و WhatsApp و Mail)
          ورابط الهاتف تظهر فقط حين تكون القيمة مدخلة هنا. القيم الافتراضية فارغة — ما تكتب شيء، ما
          يطلع شيء.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5 rounded-2xl border border-border p-4">
              <InputField
                label={field.label}
                dir="ltr"
                type={field.type}
                value={draft.content[field.key]?.ar ?? ""}
                placeholder={field.placeholder}
                onChange={(value) => setText(field.key, "ar", value)}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{field.help}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="معاينة سريعة">
        <div className="grid items-center gap-6 overflow-hidden rounded-3xl border border-border bg-background p-5 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <img src={logoUrl} alt="شعار Pure Table" className="h-12 w-12 object-contain" />
              <span className="font-display text-lg font-semibold">Pure Table</span>
            </div>
            <p className="mt-5 text-xs font-medium text-primary">
              {localizedPreview(draft, "home.badge", "ar")}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              {localizedPreview(draft, "home.title_1", "ar")}
              <span className="block text-primary">
                {localizedPreview(draft, "home.title_2", "ar")}
              </span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {localizedPreview(draft, "home.subtitle", "ar")}
            </p>
          </div>
          <img
            src={heroUrl}
            alt="معاينة الواجهة"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
        </div>
      </Panel>
    </div>
  );
}

function localizedPreview(settings: SiteSettings, key: string, language: "ar" | "en") {
  return settings.content[key]?.[language]?.trim() || DEFAULT_TEXT[language][key] || "";
}

function validateImage(file: File) {
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("الصيغ المدعومة: PNG أو JPG أو WebP فقط.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميجابايت.");
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function rgb(hex: string) {
  const safe = isHexColor(hex) ? hex.slice(1) : "000000";
  return [0, 2, 4].map((offset) => Number.parseInt(safe.slice(offset, offset + 2), 16));
}

function luminance(hex: string) {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function readableText(background: string) {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#141414")
    ? "#ffffff"
    : "#141414";
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Palette;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        {Icon && <Icon className="h-5 w-5 text-primary" />} {title}
      </h2>
      {children}
    </section>
  );
}

function LogoPreview({ label, url, className }: { label: string; url: string; className: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
      <span className="grid h-16 w-16 place-items-center rounded-xl bg-white p-2 shadow-sm">
        <img src={url} alt="" className={`object-contain ${className}`} />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function MediaField({
  kind,
  value,
  fallback,
  onChange,
  onUpload,
  onError,
}: {
  kind: "logo" | "hero";
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  onUpload: (file: File) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            onError(null);
            try {
              await onUpload(file);
            } catch (uploadError) {
              onError(uploadError instanceof Error ? uploadError.message : "تعذّر رفع الصورة.");
            } finally {
              setUploading(false);
              if (inputRef.current) inputRef.current.value = "";
            }
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:border-primary/40 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "جارٍ الرفع…" : "رفع صورة"}
        </button>
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          استخدام الصورة الافتراضية
        </button>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">أو رابط الصورة</span>
        <input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback}
          dir="ltr"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {kind === "logo"
          ? "يفضل PNG أو WebP بخلفية شفافة ودقة 512 بكسل على الأقل. ستبقى الصورة نفسها في جميع المواضع."
          : "يفضل مقاس أفقي 1600×900 أو أعلى. الحد الأقصى 5 ميجابايت."}
      </p>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  contrast,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  contrast: number;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-3 rounded-xl border border-border bg-background p-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          value={value}
          readOnly
          dir="ltr"
          aria-label={`${label} بصيغة HEX`}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase outline-none"
        />
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${contrast >= 4.5 ? "bg-primary-soft text-primary" : "bg-amber-100 text-amber-800"}`}
        >
          {contrast >= 4.5 ? "واضح" : "تباين ضعيف"}
        </span>
      </span>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  dir,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  dir: "rtl" | "ltr";
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        dir={dir}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

/**
 * Larger textarea for legal body content. Plain line breaks render on the
 * public page (whitespace-pre-line in LegalPage), so authors can write
 * naturally with blank lines between sections.
 */
function LongTextField({
  label,
  value,
  placeholder,
  dir,
  rows = 12,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  dir: "rtl" | "ltr";
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={rows}
        dir={dir}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm leading-7 outline-none focus:border-primary"
      />
    </label>
  );
}

/**
 * Single-line input for short fields (contact handles, numbers, email).
 * Renders <input dir="..." /> with the same visual language as TextField so
 * the panel feels consistent.
 */
function InputField({
  label,
  value,
  placeholder,
  dir,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  dir: "rtl" | "ltr";
  type?: "text" | "email" | "tel" | "url";
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        dir={dir}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
