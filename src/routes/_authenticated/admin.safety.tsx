import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSiteSettings, SITE_SETTINGS_KEY } from "@/hooks/use-site-settings";
import { DEFAULT_TEXT, type SiteContent, type SiteSettings } from "@/lib/site-settings";
import { saveSiteSettings } from "@/lib/site-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/safety")({
  head: () => ({
    meta: [{ title: "نظام نقاط الأمان — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: SafetySettingsPage,
});

const LEVELS = [
  {
    name: "النقطة الخضراء",
    className: "bg-safety-safe",
    fields: [
      { key: "safety.safe_label", label: "العنوان" },
      { key: "safety.safe_desc", label: "النص التوضيحي", multiline: true },
    ],
  },
  {
    name: "النقطة الحمراء",
    className: "bg-safety-caution",
    fields: [
      { key: "safety.caution_label", label: "العنوان" },
      { key: "safety.caution_desc", label: "النص التوضيحي", multiline: true },
    ],
  },
  {
    name: "النقطة البرتقالية — المطبخ المشترك",
    className: "bg-safety-shared",
    fields: [
      { key: "safety.shared_label", label: "العنوان" },
      { key: "safety.shared_desc", label: "النص التوضيحي", multiline: true },
    ],
  },
] as const;

const FOOTER_FIELDS = [
  { key: "safety.source_note", label: "تنبيه مصدر المعلومات", multiline: true },
  { key: "safety.see_disclaimer", label: "نص رابط إخلاء المسؤولية" },
] as const;

function SafetySettingsPage() {
  const queryClient = useQueryClient();
  const saveSettings = useServerFn(saveSiteSettings);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [content, setContent] = useState<SiteContent>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetchSiteSettings(false)
      .then((loaded) => {
        setSettings(loaded);
        setContent(loaded.content);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "تعذر تحميل نصوص نظام الأمان."),
      );
  }, []);

  function setText(key: string, language: "ar" | "en", value: string) {
    setContent((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { ar: "", en: "" }), [language]: value },
    }));
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = { ...settings, content };
      await saveSettings({ data: { settings: next } });
      setSettings(next);
      await queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
      setNotice("تم حفظ نصوص نظام الأمان ونشرها على الموقع.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ نصوص نظام الأمان.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> نظام نقاط الأمان
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            عدّل العنوان والنص الذي يراه الزائر لكل نقطة. الألوان نفسها ثابتة حتى تبقى تقييمات
            المنشآت الحالية صحيحة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !settings}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ ونشر
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-primary/10 p-4 text-sm text-primary"
        >
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </p>
      ) : null}

      {LEVELS.map((level) => (
        <section key={level.name} className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className={`h-3 w-3 rounded-full ${level.className}`} /> {level.name}
          </h2>
          <div className="mt-5 space-y-5">
            {level.fields.map((field) => (
              <LocalizedField key={field.key} field={field} content={content} onChange={setText} />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">التنبيه وإخلاء المسؤولية</h2>
        <div className="mt-5 space-y-5">
          {FOOTER_FIELDS.map((field) => (
            <LocalizedField key={field.key} field={field} content={content} onChange={setText} />
          ))}
        </div>
      </section>
    </div>
  );
}

function LocalizedField({
  field,
  content,
  onChange,
}: {
  field: { key: string; label: string; multiline?: boolean };
  content: SiteContent;
  onChange: (key: string, language: "ar" | "en", value: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{field.label}</h3>
      <div className="grid gap-3 lg:grid-cols-2">
        {(["ar", "en"] as const).map((language) => {
          const value = content[field.key]?.[language] ?? "";
          const placeholder = DEFAULT_TEXT[language][field.key] ?? "";
          const common = {
            value,
            placeholder,
            maxLength: field.multiline ? 2000 : 300,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onChange(field.key, language, event.target.value),
            className: "mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm",
          };
          return (
            <label key={language} className="text-xs text-muted-foreground">
              {language === "ar" ? "العربية" : "English"}
              {field.multiline ? (
                <textarea {...common} rows={4} dir={language === "ar" ? "rtl" : "ltr"} />
              ) : (
                <input {...common} dir={language === "ar" ? "rtl" : "ltr"} />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
