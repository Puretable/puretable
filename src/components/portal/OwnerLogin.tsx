import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requestOwnerCode } from "@/lib/owner-portal.functions";
import { OTP_CODE, emailSchema } from "@/lib/owner-portal";

const EMAIL_KEY = "pt-owner-email";

/** Email → one-time code. Ownership is verified afterwards by the database, not by this form. */
export function OwnerLogin() {
  const sendCode = useServerFn(requestOwnerCode);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(() => {
    try {
      return window.localStorage.getItem(EMAIL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("أدخل بريداً إلكترونياً صحيحاً.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendCode({ data: { email: parsed.data } });
      try {
        window.localStorage.setItem(EMAIL_KEY, parsed.data);
      } catch {
        /* remembering the email is optional */
      }
      setEmail(parsed.data);
      setCode("");
      setStep("code");
      setNotice("إذا كان هذا البريد مرتبطاً بعمل مسجل، فقد أرسلنا إليه رمز التحقق.");
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("محاولات")
          ? e.message
          : "تعذر إرسال الرمز. حاول مجدداً بعد قليل.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const token = code.replace(/\s/g, "");
    if (!OTP_CODE.test(token)) {
      setError("أدخل رمز التحقق المكوّن من أرقام فقط.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (verifyError) throw verifyError;
      // The portal route reacts to the new session and loads the owner's business.
    } catch {
      setError("الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً.");
      setBusy(false);
    }
  }

  return (
    <section
      dir="rtl"
      className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16"
    >
      <p className="text-xs font-medium text-primary">بوابة أصحاب الأعمال</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">تسجيل الدخول</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        أدخل بريدك الإلكتروني المسجل لدى Pure Table وسنرسل لك رمز تحقق. لا حاجة لكلمة مرور.
      </p>
      {step === "email" ? (
        <form
          onSubmit={submitEmail}
          className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
        >
          <label htmlFor="owner-email" className="block text-xs font-medium">
            البريد الإلكتروني
          </label>
          <input
            id="owner-email"
            type="email"
            dir="ltr"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال رمز التحقق
          </button>
        </form>
      ) : (
        <form
          onSubmit={submitCode}
          className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
        >
          <div className="flex items-start gap-3 text-sm">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p role="status">{notice}</p>
          </div>
          <p dir="ltr" className="break-all text-right text-xs text-muted-foreground">
            {email}
          </p>
          <label htmlFor="owner-code" className="block text-xs font-medium">
            رمز التحقق
          </label>
          <input
            id="owner-code"
            inputMode="numeric"
            dir="ltr"
            autoComplete="one-time-code"
            required
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            إذا وصلك رابط بدلاً من رمز، افتحه من نفس المتصفح وسيتم تسجيل دخولك تلقائياً.
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد ودخول
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError("");
              setCode("");
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            تغيير البريد أو طلب رمز جديد
          </button>
        </form>
      )}
    </section>
  );
}
