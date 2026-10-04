import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { Page } from "@/components/site/Layout";
import { supabase } from "@/integrations/supabase/client";
import { signupCreateBusiness } from "@/lib/owner-portal.functions";
import { OTP_CODE, emailSchema } from "@/lib/owner-portal";

export const Route = createFileRoute("/signup")({
  ssr: false,
  head: () => ({
    meta: [{ title: "إنشاء حساب عمل — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: SignupPage,
});

/**
 * Fully open self-service signup — no admin involved. Creates the business and owner link, sends
 * the sign-in code, then verifies it, all on this one page. The new business starts unpublished
 * (same as any admin-created one) and the owner is required to accept the Partnership Agreement on
 * their very first landing in /portal before reaching anything else.
 */
function SignupPage() {
  const create = useServerFn(signupCreateBusiness);
  const [step, setStep] = useState<"form" | "code">("form");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setError("أدخل بريداً إلكترونياً صحيحاً.");
      return;
    }
    if (!businessName.trim()) {
      setError("أدخل اسم العمل.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await create({ data: { businessName: businessName.trim(), email: parsedEmail.data } });
      setEmail(parsedEmail.data);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إنشاء الحساب. حاول مجدداً.");
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
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (verifyError) throw verifyError;
      window.location.href = "/portal";
    } catch {
      setError("الرمز غير صحيح أو انتهت صلاحيته.");
      setBusy(false);
    }
  }

  return (
    <Page>
      <section
        dir="rtl"
        className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16"
      >
        <p className="text-xs font-medium text-primary">بوابة أصحاب الأعمال</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">أنشئ حساب عملك</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          لا حاجة لموافقة الإدارة لإنشاء الحساب. أدخل اسم عملك وبريدك الإلكتروني وسنرسل لك رمز تحقق
          — لا حاجة لكلمة مرور.
        </p>
        {step === "form" ? (
          <form
            onSubmit={submitForm}
            className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
          >
            <label htmlFor="signup-name" className="block text-xs font-medium">
              اسم العمل
            </label>
            <input
              id="signup-name"
              required
              maxLength={200}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <label htmlFor="signup-email" className="block text-xs font-medium">
              البريد الإلكتروني
            </label>
            <input
              id="signup-email"
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
              إنشاء الحساب
            </button>
            <p className="text-center text-xs text-muted-foreground">
              لديك حساب بالفعل؟{" "}
              <a href="/portal" className="text-primary underline">
                تسجيل الدخول
              </a>
            </p>
          </form>
        ) : (
          <form
            onSubmit={submitCode}
            className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-start gap-3 text-sm">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p role="status">أرسلنا رمز تحقق إلى بريدك إن كان صحيحاً.</p>
            </div>
            <p dir="ltr" className="break-all text-right text-xs text-muted-foreground">
              {email}
            </p>
            <label htmlFor="signup-code" className="block text-xs font-medium">
              رمز التحقق
            </label>
            <input
              id="signup-code"
              inputMode="numeric"
              dir="ltr"
              autoComplete="one-time-code"
              required
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.4em] outline-none focus:border-primary"
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
              تأكيد والدخول
            </button>
          </form>
        )}
      </section>
    </Page>
  );
}
