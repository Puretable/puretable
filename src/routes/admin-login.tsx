import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogoMark } from "@/components/site/Logo";
export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [{ title: "دخول الإدارة — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLogin,
});
/** Last admin email used on this device, so it's pre-filled after a sign-out. Never the password. */
function lastAdminEmail(): string {
  try {
    return window.localStorage.getItem("pt_admin_last_email") ?? "";
  } catch {
    return "";
  }
}

function AdminLogin() {
  const [email, setEmail] = useState(lastAdminEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      try {
        window.localStorage.setItem("pt_remember_session", remember ? "1" : "0");
        window.localStorage.setItem("pt_admin_last_email", email);
      } catch {
        // Storage may be unavailable (private mode); sign-in still works, it just won't persist.
      }
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) throw loginError;
      const { data: allowed, error: roleError } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      if (roleError || !allowed) {
        await supabase.auth.signOut({ scope: "local" });
        setError("هذا الحساب لا يملك صلاحية الإدارة. استخدم تسجيل دخول الأعضاء.");
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError("تعذر الدخول. تحقق من البريد وكلمة المرور واتصالك.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      dir="rtl"
      className="grid min-h-screen place-items-center bg-background px-4 py-12 text-foreground"
    >
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <LogoMark className="h-14" />
        <h1 className="mt-6 text-2xl font-semibold">دخول الإدارة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          للحسابات المصرح لها فقط. لا تتوفر خدمة إنشاء حساب إداري.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">
            البريد الإلكتروني
            <input
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-lg border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            كلمة المرور
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border bg-background p-3"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4"
            />
            تذكرني
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="min-h-11 w-full rounded-lg bg-primary p-3 text-primary-foreground disabled:opacity-60"
          >
            {busy ? "جارٍ التحقق…" : "دخول الإدارة"}
          </button>
        </form>
        <a href="/auth" className="mt-6 inline-block text-sm underline">
          تسجيل دخول الأعضاء
        </a>
      </section>
    </main>
  );
}
