import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, Loader2, MessageSquareWarning } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Page } from "@/components/site/Layout";
import { submitComplaint } from "@/lib/complaint.functions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ogImageMeta } from "@/lib/seo";

export const Route = createFileRoute("/complaints")({
  head: () => ({
    meta: [
      { title: "تقديم شكوى — Pure Table" },
      {
        name: "description",
        content: "نموذج تقديم الشكاوى إلى منصة Pure Table ومواعيد الاستجابة والمعالجة.",
      },
      ...ogImageMeta(),
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/complaints" }],
  }),
  component: ComplaintsPage,
});

function ComplaintsPage() {
  const { lang } = useLanguage();
  const arabic = lang === "ar";
  const submit = useServerFn(submitComplaint);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await submit({
        data: {
          full_name: String(fields.get("full_name") ?? ""),
          email: String(fields.get("email") ?? ""),
          phone: String(fields.get("phone") ?? ""),
          complaint_type: String(fields.get("complaint_type") ?? ""),
          order_reference: String(fields.get("order_reference") ?? ""),
          details: String(fields.get("details") ?? ""),
          accepted: fields.get("accepted") === "on",
        },
      });
      setReference(result.id);
      form.reset();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : arabic
            ? "تعذر إرسال الشكوى. حاول مرة أخرى."
            : "The complaint could not be submitted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <section className="border-b border-border/60 bg-[var(--gradient-hero)]">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <MessageSquareWarning className="mx-auto h-9 w-9 text-primary" />
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">
            {arabic ? "تقديم شكوى" : "Submit a Complaint"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {arabic
              ? "نستقبل شكواك ونتابعها بسرية واهتمام."
              : "We receive and follow up on your complaint with care and confidentiality."}
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="h-fit rounded-2xl border bg-secondary/40 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clock3 className="h-5 w-5 text-primary" />{" "}
            {arabic ? "أوقات الاستجابة" : "Response times"}
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">
                {arabic ? "الرد الأولي" : "Initial response"}
              </dt>
              <dd className="mt-1 font-semibold">{arabic ? "خلال 24 ساعة" : "Within 24 hours"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {arabic ? "مدة المعالجة" : "Resolution period"}
              </dt>
              <dd className="mt-1 font-semibold">
                {arabic ? "من 3 إلى 5 أيام عمل" : "3–5 business days"}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            {arabic
              ? "قد نطلب معلومات إضافية إذا كانت ضرورية لمعالجة الشكوى."
              : "We may request additional information when needed to resolve the complaint."}
          </p>
        </aside>

        <div className="rounded-3xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
          {reference ? (
            <div role="status" className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold">
                {arabic ? "تم استلام شكواك" : "Complaint received"}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {arabic ? "احتفظ بالرقم المرجعي التالي:" : "Keep this reference number:"}
              </p>
              <code
                dir="ltr"
                className="mt-3 inline-block rounded-lg bg-secondary px-3 py-2 text-xs"
              >
                {reference}
              </code>
              <button
                type="button"
                onClick={() => setReference("")}
                className="mx-auto mt-6 block text-sm font-medium text-primary underline underline-offset-4"
              >
                {arabic ? "تقديم شكوى أخرى" : "Submit another complaint"}
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <h2 className="text-2xl font-semibold">
                {arabic ? "بيانات الشكوى" : "Complaint details"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="full_name"
                  label={arabic ? "الاسم الكامل" : "Full name"}
                  required
                  minLength={2}
                  maxLength={120}
                />
                <Field
                  name="phone"
                  label={arabic ? "رقم الجوال" : "Phone number"}
                  required
                  minLength={8}
                  maxLength={30}
                  dir="ltr"
                />
                <Field
                  name="email"
                  label={arabic ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}
                  type="email"
                  maxLength={255}
                  dir="ltr"
                />
                <Field
                  name="order_reference"
                  label={
                    arabic ? "رقم الطلب أو المرجع (اختياري)" : "Order/reference number (optional)"
                  }
                  maxLength={100}
                />
              </div>
              <label className="block text-sm">
                {arabic ? "نوع الشكوى" : "Complaint type"}
                <select
                  name="complaint_type"
                  required
                  defaultValue=""
                  className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
                >
                  <option value="" disabled>
                    {arabic ? "اختر النوع" : "Select a type"}
                  </option>
                  <option value="service">{arabic ? "الخدمة" : "Service"}</option>
                  <option value="listing">{arabic ? "بيانات منشأة" : "Business listing"}</option>
                  <option value="subscription">
                    {arabic ? "اشتراك أو دفعة" : "Subscription or payment"}
                  </option>
                  <option value="privacy">
                    {arabic ? "الخصوصية والبيانات" : "Privacy and data"}
                  </option>
                  <option value="other">{arabic ? "أخرى" : "Other"}</option>
                </select>
              </label>
              <label className="block text-sm">
                {arabic ? "تفاصيل الشكوى" : "Complaint details"}
                <textarea
                  name="details"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={7}
                  className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5"
                />
              </label>
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  name="accepted"
                  type="checkbox"
                  required
                  className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                {arabic
                  ? "أقر بصحة البيانات المدخلة وأوافق على استخدامها لمعالجة الشكوى."
                  : "I confirm the information is accurate and consent to its use to process this complaint."}
              </label>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <button
                disabled={busy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy
                  ? arabic
                    ? "جارٍ الإرسال…"
                    : "Submitting…"
                  : arabic
                    ? "إرسال الشكوى"
                    : "Submit complaint"}
              </button>
            </form>
          )}
        </div>
      </section>
    </Page>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm">
      {label}
      <input {...props} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3" />
    </label>
  );
}
