import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ShieldCheck } from "lucide-react";
import {
  acceptPartnershipAgreementFn,
  saveBusinessBillingFieldsFn,
} from "@/lib/owner-manage.functions";
import { friendlyPortalError, type OwnerBusiness } from "@/lib/owner-portal";

/**
 * The required post-payment step, shown instead of the whole dashboard whenever
 * `business.business_info_completed` is false. Two phases:
 *  1. Billing fields — saving them returns the Partnership Agreement filled with exactly those
 *     values, rendered as a normal page (no generated file).
 *  2. The owner reviews that filled agreement and accepts it, which is what actually unblocks the
 *     portal. The business stays invisible to visitors throughout (enforced in the database).
 */
export function BusinessInfoGate({
  business,
  accountEmail,
  onDone,
}: {
  business: OwnerBusiness;
  accountEmail: string;
  onDone: () => void;
}) {
  const [agreementHtml, setAgreementHtml] = useState<string | null>(null);

  if (agreementHtml) {
    return (
      <AgreementReview businessId={business.id} agreementHtml={agreementHtml} onDone={onDone} />
    );
  }
  return (
    <BillingFieldsForm
      businessId={business.id}
      accountEmail={accountEmail}
      onSaved={(html) => setAgreementHtml(html)}
    />
  );
}

function BillingFieldsForm({
  businessId,
  accountEmail,
  onSaved,
}: {
  businessId: string;
  accountEmail: string;
  onSaved: (agreementHtml: string) => void;
}) {
  const save = useServerFn(saveBusinessBillingFieldsFn);
  const [tradeName, setTradeName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(accountEmail);
  const [phone, setPhone] = useState("");
  const [repName, setRepName] = useState("");
  const [repTitle, setRepTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { agreementHtml } = await save({
        data: {
          business_id: businessId,
          trade_name: tradeName,
          cr_number: crNumber,
          tax_number: taxNumber || null,
          address,
          email,
          phone,
          representative_name: repName,
          representative_title: repTitle,
        },
      });
      onSaved(agreementHtml);
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      dir="rtl"
      className="mx-auto max-w-2xl space-y-6 rounded-3xl border bg-card p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">استكمال بيانات الفوترة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            خطوة أخيرة قبل الوصول إلى لوحة التحكم: أدخل بيانات عملك الرسمية، ثم راجع اتفاقية الشراكة
            والإدراج والاشتراك المعبّأة ببياناتك ووافق عليها. لن تظهر صفحة عملك للزوار حتى تكتمل هذه
            الخطوة.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            الاسم التجاري *
            <input
              required
              maxLength={200}
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            رقم السجل التجاري *
            <input
              required
              maxLength={50}
              dir="ltr"
              value={crNumber}
              onChange={(e) => setCrNumber(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            الرقم الضريبي (إن وجد)
            <input
              maxLength={50}
              dir="ltr"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder="اتركه فارغاً إن لم تكن منشأتك مسجّلة ضريبياً"
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            العنوان *
            <input
              required
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            البريد الإلكتروني للتواصل *
            <input
              required
              type="email"
              maxLength={320}
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            رقم الهاتف *
            <input
              required
              maxLength={40}
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            اسم ممثل المنشأة *
            <input
              required
              maxLength={200}
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            صفته (مثال: المالك، المدير) *
            <input
              required
              maxLength={100}
              value={repTitle}
              onChange={(e) => setRepTitle(e.target.value)}
              className="mt-2 w-full rounded-xl border bg-background p-3"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "جارٍ إنشاء الاتفاقية…" : "متابعة لمراجعة الاتفاقية"}
        </button>
      </form>
    </section>
  );
}

function AgreementReview({
  businessId,
  agreementHtml,
  onDone,
}: {
  businessId: string;
  agreementHtml: string;
  onDone: () => void;
}) {
  const accept = useServerFn(acceptPartnershipAgreementFn);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onProceed() {
    setBusy(true);
    setError("");
    try {
      await accept({ data: { business_id: businessId, agree: true } });
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
          <h1 className="text-xl font-semibold">مراجعة اتفاقية الشراكة والإدراج والاشتراك</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            راجع الاتفاقية المعبّأة ببيانات عملك أدناه قبل المتابعة.
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
      <div
        dir="ltr"
        className="agreement-document max-h-[60vh] overflow-y-auto rounded-2xl border p-4 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: agreementHtml }}
      />
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
        disabled={busy || !agree}
        onClick={() => void onProceed()}
        className="w-full min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "جارٍ الحفظ…" : "متابعة إلى لوحة التحكم"}
      </button>
    </section>
  );
}
