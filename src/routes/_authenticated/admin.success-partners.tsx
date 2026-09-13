import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  Building2,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Search,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signCoverUploadUrl } from "@/lib/admin.functions";
import {
  addBusinessSuccessPartner,
  addExternalSuccessPartner,
  listSuccessPartnersAdmin,
  removeSuccessPartner,
  setSuccessPartnerActive,
} from "@/lib/success-partners.functions";

export const Route = createFileRoute("/_authenticated/admin/success-partners")({
  head: () => ({
    meta: [{ title: "شركاء الانطلاق — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: SuccessPartnersAdmin,
});

function SuccessPartnersAdmin() {
  const qc = useQueryClient();
  const fetchPartners = useServerFn(listSuccessPartnersAdmin);
  const addBusiness = useServerFn(addBusinessSuccessPartner);
  const addExternal = useServerFn(addExternalSuccessPartner);
  const setActive = useServerFn(setSuccessPartnerActive);
  const removePartner = useServerFn(removeSuccessPartner);
  const signUpload = useServerFn(signCoverUploadUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin", "success-partners"],
    queryFn: () => fetchPartners(),
  });
  const partners = query.data?.partners ?? [];
  const selected = useMemo(
    () =>
      new Map(
        partners
          .filter((partner) => partner.business_id)
          .map((partner) => [partner.business_id!, partner]),
      ),
    [partners],
  );
  const businesses = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    return (query.data?.businesses ?? []).filter((business) =>
      !term
        ? true
        : [business.name, business.name_ar, business.city]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase("ar").includes(term)),
    );
  }, [query.data?.businesses, search]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["admin", "success-partners"] });
    await qc.invalidateQueries({ queryKey: ["success-partners"] });
  }
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    if (busy) return false;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ الطلب.");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function toggleBusiness(businessId: string) {
    const partner = selected.get(businessId);
    if (partner) {
      await run(
        `business-${businessId}`,
        () => removePartner({ data: { id: partner.id } }),
        "تمت إزالة المحل من شركاء الانطلاق.",
      );
    } else {
      await run(
        `business-${businessId}`,
        () => addBusiness({ data: { businessId } }),
        "أُضيف المحل وسيظهر تلقائياً في الصفحة الرئيسية.",
      );
    }
  }
  async function upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("اختر شعار PNG أو JPG أو WebP بحجم لا يتجاوز 5 ميجابايت.");
      return;
    }
    await run(
      "upload",
      async () => {
        const signed = await signUpload({ data: { filename: `partner-${file.name}` } });
        const { error: uploadError } = await supabase.storage
          .from("business-covers")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        setLogoUrl(signed.readUrl);
      },
      "تم رفع الشعار. أكمل البيانات ثم اضغط إضافة الشريك.",
    );
  }
  async function submitExternal(event: FormEvent) {
    event.preventDefault();
    const added = await run(
      "external",
      () =>
        addExternal({
          data: {
            name,
            nameAr: nameAr || undefined,
            logoUrl: logoUrl || undefined,
            linkUrl: linkUrl || undefined,
          },
        }),
      "أُضيف الشريك وسيظهر تلقائياً في الصفحة الرئيسية.",
    );
    if (added) {
      setName("");
      setNameAr("");
      setLogoUrl("");
      setLinkUrl("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-2xl font-semibold">شركاء الانطلاق</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          اختر محلاً مسجلاً بنقرة واحدة، أو أضف جهة مستقلة. كل شريك مفعّل يظهر تلقائياً قبل تذييل
          الصفحة الرئيسية.
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-primary/10 p-4 text-sm text-primary">
          {notice}
        </p>
      )}

      <section
        aria-labelledby="business-partners-heading"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="business-partners-heading"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Store className="h-5 w-5 text-primary" /> اختيار من المحلات
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              التفعيل لا يغيّر حالة نشر المحل أو باقته.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">ابحث عن محل</span>
            <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو المدينة…"
              className="min-h-11 w-full rounded-xl border bg-background ps-10 pe-3 text-sm"
            />
          </label>
        </div>
        {query.isLoading ? (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ تحميل المحلات…
          </p>
        ) : query.isError ? (
          <button
            onClick={() => void query.refetch()}
            className="mt-6 text-sm text-destructive underline"
          >
            تعذر التحميل — إعادة المحاولة
          </button>
        ) : (
          <div className="mt-5 grid max-h-[32rem] gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
            {businesses.map((business) => {
              const partner = selected.get(business.id);
              return (
                <label
                  key={business.id}
                  className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:border-primary/35"
                >
                  <input
                    type="checkbox"
                    checked={!!partner}
                    disabled={!!busy}
                    onChange={() => void toggleBusiness(business.id)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">
                    {business.cover_url ? (
                      <img src={business.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {business.name_ar || business.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {business.city} · {business.published ? "منشور" : "غير منشور"}
                    </span>
                  </span>
                  {busy === `business-${business.id}` && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby="external-partner-heading"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2 id="external-partner-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5 text-primary" /> إضافة جهة مستقلة
        </h2>
        <form onSubmit={submitExternal} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            الاسم بالإنجليزية أو الاسم الأساسي
            <input
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            الاسم بالعربية <span className="text-muted-foreground">(اختياري)</span>
            <input
              maxLength={160}
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            رابط موقع الشريك <span className="text-muted-foreground">(اختياري)</span>
            <input
              type="url"
              dir="ltr"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
            />
          </label>
          <label className="text-sm">
            رابط الشعار <span className="text-muted-foreground">(اختياري)</span>
            <input
              type="url"
              dir="ltr"
              placeholder="https://…"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
            />
          </label>
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm">
                {busy === "upload" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                رفع شعار
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    event.target.files?.[0] && void upload(event.target.files[0])
                  }
                />
              </label>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="معاينة شعار الشريك"
                  className="h-16 w-28 rounded-xl border bg-background object-contain p-2"
                />
              ) : (
                <span className="flex h-16 w-28 items-center justify-center rounded-xl border bg-background text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </span>
              )}
            </div>
          </div>
          <button
            disabled={!!busy}
            className="min-h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-2 sm:w-fit"
          >
            {busy === "external" ? "جارٍ الإضافة…" : "إضافة الشريك"}
          </button>
        </form>
      </section>

      <section aria-labelledby="current-partners-heading">
        <h2 id="current-partners-heading" className="text-lg font-semibold">
          الشركاء المختارون ({partners.length})
        </h2>
        {!partners.length ? (
          <p className="mt-4 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            لم تتم إضافة شركاء بعد.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((partner) => (
              <article
                key={partner.id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4"
              >
                <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-background">
                  {partner.logo_url ? (
                    <img
                      src={partner.logo_url}
                      alt=""
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">
                    {partner.name_ar || partner.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {partner.kind === "business" ? "محل مسجل" : "جهة مستقلة"} ·{" "}
                    {partner.active ? "ظاهر" : "مخفي"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    title={partner.active ? "إخفاء" : "إظهار"}
                    aria-label={partner.active ? `إخفاء ${partner.name}` : `إظهار ${partner.name}`}
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        `active-${partner.id}`,
                        () => setActive({ data: { id: partner.id, active: !partner.active } }),
                        partner.active ? "تم إخفاء الشريك." : "تم إظهار الشريك.",
                      )
                    }
                    className="grid h-10 w-10 place-items-center rounded-lg border"
                  >
                    {busy === `active-${partner.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : partner.active ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    title="إزالة"
                    aria-label={`إزالة ${partner.name}`}
                    disabled={!!busy}
                    onClick={() =>
                      confirm("إزالة الشريك من القسم؟ لن يُحذف المحل نفسه.") &&
                      void run(
                        `remove-${partner.id}`,
                        () => removePartner({ data: { id: partner.id } }),
                        "تمت إزالة الشريك.",
                      )
                    }
                    className="grid h-10 w-10 place-items-center rounded-lg border text-destructive"
                  >
                    {busy === `remove-${partner.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
