import { createFileRoute, notFound } from "@tanstack/react-router";
import { Page } from "@/components/site/Layout";
import { getAgreementVersionText } from "@/lib/agreement-text.functions";

export const Route = createFileRoute("/agreement-text/$version")({
  head: () => ({
    meta: [{ title: "نص اتفاقية الشراكة — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  loader: async ({ params }) => {
    const { text } = await getAgreementVersionText({ data: { version: params.version } });
    if (!text) throw notFound();
    return { text, version: params.version };
  },
  component: AgreementTextPage,
});

function AgreementTextPage() {
  const { text, version } = Route.useLoaderData();
  return (
    <Page>
      <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8" dir="rtl">
        <h1 className="font-display text-2xl font-semibold">
          نص اتفاقية الشراكة والإدراج والاشتراك — الإصدار {version}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          هذا هو النص الكامل للإصدار الذي وافقت عليه، كما هو محفوظ لدينا دون أي تعديل.
        </p>
        {/* Safe here: this is our own static legal-text template (never user input), stored
            server-side in agreement_versions.full_text and served read-only, byte-for-byte. */}
        <style>{`
          .agreement-document table { width: 100%; border-collapse: collapse; }
          .agreement-document table > tbody > tr > td { width: 50%; vertical-align: top; padding: 8px 10px; border: 1px solid var(--border); }
          .agreement-document table > tbody > tr > td:first-child { direction: ltr; text-align: left; }
          .agreement-document table > tbody > tr > td:last-child { direction: rtl; text-align: right; }
          .agreement-document table table { border: none; }
          .agreement-document table table td { border: none; padding: 2px 0; }
          .agreement-document p { margin: 0 0 8px; }
        `}</style>
        <div
          dir="ltr"
          className="agreement-document mt-6 overflow-x-auto rounded-2xl border p-4 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: text }}
        />
      </section>
    </Page>
  );
}
