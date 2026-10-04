import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import {
  acceptPartnershipAgreementFn,
  getFirstLoginAgreementFn,
} from "@/lib/owner-manage.functions";
import { friendlyPortalError, type OwnerBusiness } from "@/lib/owner-portal";

/**
 * The first-login gate, shown instead of the whole dashboard whenever `business.terms_accepted_at`
 * is null. The agreement is filled with whatever is known about the business yet (its name, the
 * owner's account email) — everything else is shown exactly as unfilled as the source document,
 * since the full billing-info form happens later and separately (it only gates paid-plan selection,
 * not the dashboard). The business stays invisible to visitors until this step either way (enforced
 * in the database).
 */
export function AgreementGate({
  business,
  onDone,
}: {
  business: OwnerBusiness;
  onDone: () => void;
}) {
  const load = useServerFn(getFirstLoginAgreementFn);
  const accept = useServerFn(acceptPartnershipAgreementFn);
  const agreement = useQuery({
    queryKey: ["first-login-agreement", business.id],
    queryFn: () => load({ data: { businessId: business.id } }),
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onProceed() {
    setBusy(true);
    setError("");
    try {
      await accept({ data: { business_id: business.id, agree: true } });
      onDone();
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      dir="rtl"
      className="mx-auto max-w-3xl space-y-6 rounded-3xl border bg-card p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">اتفاقية الشراكة والإدراج والاشتراك</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            خطوة أخيرة قبل الدخول إلى لوحة التحكم.
          </p>
        </div>
      </div>
      {/* Safe here: `agreementHtml` is our own static legal-text template (never user input) with
          only the business's field values spliced in, and the server already HTML-escapes every one
          of those values before returning this string (see fill-template.ts). */}
      {/* The template's table is [English, Arabic] in that DOM order. The container is forced to
          dir="ltr" so the first (English) column lays out on the left and the second (Arabic) column
          on the right — matching the source document — then each column's direction/alignment is set
          explicitly so the Arabic text itself still shapes and reads correctly. */}
      <style>{`
        .agreement-document table { width: 100%; border-collapse: collapse; }
        .agreement-document table > tbody > tr > td { width: 50%; vertical-align: top; padding: 8px 10px; border: 1px solid var(--border); }
        .agreement-document table > tbody > tr > td:first-child { direction: ltr; text-align: left; }
        .agreement-document table > tbody > tr > td:last-child { direction: rtl; text-align: right; }
        .agreement-document table table { border: none; }
        .agreement-document table table td { border: none; padding: 2px 0; }
        .agreement-document p { margin: 0 0 8px; }
      `}</style>
      {agreement.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          جارٍ التحميل…
        </p>
      ) : agreement.isError ? (
        <p role="alert" className="text-sm text-destructive">
          تعذر تحميل الاتفاقية.
        </p>
      ) : (
        <div
          dir="ltr"
          className="agreement-document max-h-[60vh] overflow-y-auto rounded-2xl border p-4 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: agreement.data?.agreementHtml ?? "" }}
        />
      )}
      <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm">
        <input
          required
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={agree}
          disabled={busy}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <span>لقد قرأت ووافقت على اتفاقية الشراكة والإدراج والاشتراك.</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !agree || agreement.isLoading}
        onClick={() => void onProceed()}
        className="w-full min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "جارٍ الحفظ…" : "متابعة إلى لوحة التحكم"}
      </button>
    </section>
  );
}
