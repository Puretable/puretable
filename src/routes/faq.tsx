import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { Page } from "@/components/site/Layout";
import { FAQ_QUERY_KEY, listFaqs } from "@/lib/faq.functions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ogImageMeta } from "@/lib/seo";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "الأسئلة الشائعة — Pure Table" },
      { name: "description", content: "إجابات عن الأسئلة الشائعة حول منصة Pure Table." },
      ...ogImageMeta(),
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/faq" }],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { lang } = useLanguage();
  const list = useServerFn(listFaqs);
  const query = useQuery({ queryKey: FAQ_QUERY_KEY, queryFn: () => list() });
  const arabic = lang === "ar";

  return (
    <Page>
      <section className="border-b border-border/60 bg-[var(--gradient-hero)]">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <HelpCircle className="mx-auto h-9 w-9 text-primary" />
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">
            {arabic ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {arabic
              ? "إجابات واضحة عن أكثر الأسئلة تكرارًا."
              : "Clear answers to the most common questions."}
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-3xl space-y-3 px-4 py-14 sm:px-6">
        {query.isLoading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> {arabic ? "جارٍ التحميل…" : "Loading…"}
          </p>
        ) : query.isError ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {arabic ? "تعذر تحميل الأسئلة حاليًا." : "Questions could not be loaded right now."}
          </p>
        ) : !query.data?.length ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
            {arabic ? "لا توجد أسئلة منشورة حاليًا." : "No questions have been published yet."}
          </div>
        ) : (
          query.data.map((item) => {
            const question = arabic ? item.question_ar : item.question_en || item.question_ar;
            const answer = arabic ? item.answer_ar : item.answer_en || item.answer_ar;
            return (
              <details
                key={item.id}
                className="group rounded-2xl border bg-card px-5 py-4 open:shadow-[var(--shadow-soft)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {question}
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <p className="mt-4 whitespace-pre-line border-t pt-4 text-sm leading-7 text-muted-foreground">
                  {answer}
                </p>
              </details>
            );
          })
        )}
      </section>
    </Page>
  );
}
