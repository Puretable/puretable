import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Edit3, Eye, EyeOff, HelpCircle, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { adminListFaqs, deleteFaq, FAQ_QUERY_KEY, upsertFaq, type Faq } from "@/lib/faq.functions";

export const Route = createFileRoute("/_authenticated/admin/faqs")({
  head: () => ({
    meta: [{ title: "الأسئلة الشائعة — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: FaqAdminPage,
});

type FaqDraft = Pick<
  Faq,
  "question_ar" | "answer_ar" | "question_en" | "answer_en" | "visible" | "sort_order"
> & {
  id?: string;
};

const EMPTY: FaqDraft = {
  question_ar: "",
  answer_ar: "",
  question_en: "",
  answer_en: "",
  visible: false,
  sort_order: 0,
};

function FaqAdminPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(adminListFaqs);
  const saveFaq = useServerFn(upsertFaq);
  const removeFaq = useServerFn(deleteFaq);
  const query = useQuery({ queryKey: ["admin", ...FAQ_QUERY_KEY], queryFn: () => list() });
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", ...FAQ_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: FAQ_QUERY_KEY }),
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      await saveFaq({ data: draft });
      await refresh();
      setDraft(null);
      setNotice("تم حفظ السؤال.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ السؤال.");
    } finally {
      setBusy("");
    }
  }

  async function toggle(item: Faq) {
    setBusy(`toggle-${item.id}`);
    setError("");
    try {
      await saveFaq({ data: { ...item, visible: !item.visible } });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تغيير حالة السؤال.");
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("حذف هذا السؤال نهائيًا؟")) return;
    setBusy(`delete-${id}`);
    setError("");
    try {
      await removeFaq({ data: { id } });
      await refresh();
      if (draft?.id === id) setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف السؤال.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <HelpCircle className="h-6 w-6 text-primary" /> الأسئلة الشائعة
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            أضف الأسئلة ورتّبها، ولن يظهر في صفحة الموقع إلا ما تم نشره.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY, sort_order: (query.data?.length ?? 0) * 10 })}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> إضافة سؤال
        </button>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-primary/10 p-4 text-sm text-primary">
          {notice}
        </p>
      ) : null}

      {draft ? (
        <form onSubmit={save} className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{draft.id ? "تعديل السؤال" : "سؤال جديد"}</h2>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label="إغلاق النموذج"
              className="rounded-lg border p-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <LanguageFields
              language="ar"
              question={draft.question_ar}
              answer={draft.answer_ar}
              onQuestion={(value) =>
                setDraft((current) => (current ? { ...current, question_ar: value } : current))
              }
              onAnswer={(value) =>
                setDraft((current) => (current ? { ...current, answer_ar: value } : current))
              }
              required
            />
            <LanguageFields
              language="en"
              question={draft.question_en}
              answer={draft.answer_en}
              onQuestion={(value) =>
                setDraft((current) => (current ? { ...current, question_en: value } : current))
              }
              onAnswer={(value) =>
                setDraft((current) => (current ? { ...current, answer_en: value } : current))
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <label className="text-sm">
              ترتيب العرض
              <input
                type="number"
                min={0}
                max={10000}
                value={draft.sort_order}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, sort_order: Number(event.target.value) } : current,
                  )
                }
                className="ms-2 w-24 rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.visible}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, visible: event.target.checked } : current,
                  )
                }
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              منشور في الموقع
            </label>
          </div>
          <button
            disabled={!!busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy === "save" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </button>
        </form>
      ) : null}

      {query.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
        </p>
      ) : query.isError ? (
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="text-sm text-destructive underline"
        >
          تعذر التحميل — إعادة المحاولة
        </button>
      ) : !query.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          لا توجد أسئلة بعد. الصفحة العامة جاهزة وستبقى فارغة حتى تضيف أول سؤال منشور.
        </div>
      ) : (
        <div className="space-y-3">
          {query.data.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">
                {item.sort_order}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{item.question_ar}</h2>
                <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                  {item.answer_ar}
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs ${item.visible ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                >
                  {item.visible ? "منشور" : "مخفي"}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...item })}
                  aria-label={`تعديل ${item.question_ar}`}
                  className="grid h-10 w-10 place-items-center rounded-lg border"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void toggle(item)}
                  aria-label={item.visible ? "إخفاء السؤال" : "نشر السؤال"}
                  className="grid h-10 w-10 place-items-center rounded-lg border"
                >
                  {busy === `toggle-${item.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : item.visible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void remove(item.id)}
                  aria-label={`حذف ${item.question_ar}`}
                  className="grid h-10 w-10 place-items-center rounded-lg border text-destructive"
                >
                  {busy === `delete-${item.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageFields({
  language,
  question,
  answer,
  onQuestion,
  onAnswer,
  required = false,
}: {
  language: "ar" | "en";
  question: string;
  answer: string;
  onQuestion: (value: string) => void;
  onAnswer: (value: string) => void;
  required?: boolean;
}) {
  const arabic = language === "ar";
  return (
    <fieldset dir={arabic ? "rtl" : "ltr"} className="space-y-4 rounded-xl border p-4">
      <legend className="px-2 text-sm font-semibold">{arabic ? "العربية" : "English"}</legend>
      <label className="block text-sm">
        {arabic ? "السؤال" : "Question"}
        <input
          required={required}
          maxLength={300}
          value={question}
          onChange={(event) => onQuestion(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
        />
      </label>
      <label className="block text-sm">
        {arabic ? "الإجابة" : "Answer"}
        <textarea
          required={required}
          maxLength={4000}
          rows={5}
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5"
        />
      </label>
    </fieldset>
  );
}
