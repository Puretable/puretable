import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { Instagram, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Page } from "@/components/site/Layout";
import { submitContactMessage } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Pure Table — Get in Touch" },
      {
        name: "description",
        content: "Reach out to Pure Table to list your gluten-free business or share a suggestion.",
      },
      { property: "og:title", content: "Contact Pure Table" },
      {
        property: "og:description",
        content: "Get in touch to list your gluten-free business in Saudi Arabia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
    ],
  }),
  component: Contact,
});

const MessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).or(z.literal("")),
  subject: z.string().trim().max(200),
  message: z.string().trim().min(1).max(4000),
  company: z.string().trim().max(200).optional().default(""),
});

function Contact() {
  const { t } = useTranslation();
  const submit = useServerFn(submitContactMessage);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = MessageSchema.safeParse({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      message: String(fd.get("message") ?? ""),
      company: String(fd.get("company") ?? ""),
    });
    if (!parsed.success) {
      setError(t("contact.invalid"));
      return;
    }
    setBusy(true);
    try {
      await submit({ data: parsed.data });
    } catch {
      setError(t("contact.error"));
      setBusy(false);
      return;
    }
    setBusy(false);
    setSent(true);
    form.reset();
  }

  return (
    <Page>
      <section className="border-b border-border/60 bg-[var(--gradient-hero)]">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {t("contact.eyebrow")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {t("contact.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            {t("contact.subtitle")}
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:px-8">
        <div className="space-y-5">
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Instagram className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Instagram</p>
              <p className="mt-1 font-medium">@puretable.sa</p>
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8"
        >
          <h2 className="font-display text-2xl font-semibold">{t("contact.form_title")}</h2>

          {/* Honeypot: hidden from real visitors (and screen readers), bots that fill every field
              trip it. Never shown, never focusable. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute h-0 w-0 opacity-0"
            style={{ left: "-9999px" }}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field
              label={t("contact.your_name")}
              name="name"
              placeholder={t("contact.name_ph")}
              required
              maxLength={120}
            />
            <Field
              label={t("contact.email")}
              name="email"
              type="email"
              placeholder={t("contact.email_ph")}
              maxLength={255}
            />
          </div>
          <div className="mt-4">
            <Field
              label={t("contact.subject")}
              name="subject"
              placeholder={t("contact.subject_ph")}
              maxLength={200}
            />
          </div>
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("contact.message")}
            </label>
            <textarea
              name="message"
              rows={5}
              required
              maxLength={4000}
              placeholder={t("contact.message_placeholder")}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {sent && <p className="mt-3 text-sm font-medium text-primary">{t("contact.sent")}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("contact.send")}
          </button>
        </form>
      </section>
    </Page>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
