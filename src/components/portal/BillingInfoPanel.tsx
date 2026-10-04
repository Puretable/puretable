import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { saveBusinessBillingFieldsFn } from "@/lib/owner-manage.functions";
import { friendlyPortalError, type OwnerBusiness } from "@/lib/owner-portal";

/**
 * Billing/invoice info. While packages are platform-disabled, only trade name + CR number are
 * collected (trade name defaults to the business's own name, so it's never asked twice) and
 * submitting unblocks the dashboard — see `packagesEnabled`. Once packages are re-enabled, the full
 * form (tax number, address, phone, representative) reappears exactly as built, reachable any time
 * from its own tab, and only gates selecting a paid package rather than the whole dashboard.
 */
export function BillingInfoPanel({
  business,
  accountEmail,
  packagesEnabled,
  onDone,
}: {
  business: OwnerBusiness;
  accountEmail: string;
  packagesEnabled: boolean;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveBusinessBillingFieldsFn);
  const [tradeName, setTradeName] = useState(business.name_ar || business.name);
  const [crNumber, setCrNumber] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(accountEmail);
  const [phone, setPhone] = useState("");
  const [repName, setRepName] = useState("");
  const [repTitle, setRepTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await save({
        data: {
          business_id: business.id,
          trade_name: tradeName,
          cr_number: crNumber,
          tax_number: taxNumber || null,
          address: packagesEnabled ? address : null,
          email: packagesEnabled ? email : null,
          phone: packagesEnabled ? phone : null,
          representative_name: packagesEnabled ? repName : null,
          representative_title: packagesEnabled ? repTitle : null,
        },
      });
      setMessage(
        packagesEnabled
          ? "تم الحفظ. يمكنك الآن الاشتراك في باقة مدفوعة من تبويب الباقات."
          : "تم الحفظ.",
      );
      await qc.invalidateQueries({ queryKey: ["owner-overview"] });
      onDone?.();
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">بيانات الفوترة</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {!packagesEnabled
              ? "خطوة أخيرة قبل الدخول إلى لوحة التحكم: تأكيد الاسم التجاري ورقم السجل التجاري."
              : business.business_info_completed
                ? "بياناتك محفوظة. يمكنك تحديثها هنا في أي وقت."
                : "أدخل بيانات عملك الرسمية لإصدار الفواتير. إكمال هذه البيانات شرط للاشتراك في باقة Pro أو Premium."}
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
          {packagesEnabled && (
            <>
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
            </>
          )}
        </fieldset>
        {message && (
          <p role="status" className="text-sm text-primary">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
        >
          {busy ? "جارٍ الحفظ…" : packagesEnabled ? "حفظ بيانات الفوترة" : "متابعة إلى لوحة التحكم"}
        </button>
      </form>
    </section>
  );
}
