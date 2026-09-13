import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, Inbox, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  adminListComplaints,
  COMPLAINTS_QUERY_KEY,
  deleteComplaint,
  updateComplaint,
  type ComplaintStatus,
} from "@/lib/complaint.functions";

export const Route = createFileRoute("/_authenticated/admin/complaints")({
  head: () => ({
    meta: [{ title: "الشكاوى — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: ComplaintsAdminPage,
});

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "جديدة",
  in_review: "قيد المراجعة",
  resolved: "تمت المعالجة",
  closed: "مغلقة",
};

const TYPE_LABELS: Record<string, string> = {
  service: "الخدمة",
  listing: "بيانات منشأة",
  subscription: "اشتراك أو دفعة",
  privacy: "الخصوصية والبيانات",
  other: "أخرى",
};

function ComplaintsAdminPage() {
  const list = useServerFn(adminListComplaints);
  const query = useQuery({ queryKey: COMPLAINTS_QUERY_KEY, queryFn: () => list() });
  const newCount = query.data?.filter((item) => item.status === "new").length ?? 0;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <Inbox className="h-6 w-6 text-primary" /> الشكاوى
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {newCount
            ? `${newCount} شكوى جديدة بانتظار الرد الأولي.`
            : "لا توجد شكاوى جديدة بانتظار الرد."}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">الرد الأولي</p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
            <Clock3 className="h-4 w-4 text-primary" /> خلال 24 ساعة
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">مدة المعالجة</p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
            <Clock3 className="h-4 w-4 text-primary" /> من 3 إلى 5 أيام عمل
          </p>
        </div>
      </div>
      {query.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الشكاوى…
        </p>
      ) : query.isError ? (
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="text-sm text-destructive underline"
        >
          تعذر تحميل الشكاوى — إعادة المحاولة
        </button>
      ) : !query.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          لم تصل أي شكوى بعد.
        </div>
      ) : (
        <div className="space-y-4">
          {query.data.map((complaint) => (
            <ComplaintCard key={complaint.id} complaint={complaint} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComplaintCard({
  complaint,
}: {
  complaint: Awaited<ReturnType<typeof adminListComplaints>>[number];
}) {
  const queryClient = useQueryClient();
  const saveComplaint = useServerFn(updateComplaint);
  const removeComplaint = useServerFn(deleteComplaint);
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status as ComplaintStatus);
  const [notes, setNotes] = useState(complaint.admin_notes ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setStatus(complaint.status as ComplaintStatus);
    setNotes(complaint.admin_notes ?? "");
  }, [complaint.status, complaint.admin_notes]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: COMPLAINTS_QUERY_KEY });
  }

  async function save() {
    setBusy("save");
    setError("");
    setSaved(false);
    try {
      await saveComplaint({ data: { id: complaint.id, status, admin_notes: notes } });
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الشكوى.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm("حذف هذه الشكوى نهائيًا؟")) return;
    setBusy("delete");
    setError("");
    try {
      await removeComplaint({ data: { id: complaint.id } });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف الشكوى.");
      setBusy("");
    }
  }

  const ageHours = (Date.now() - new Date(complaint.created_at).getTime()) / 3_600_000;
  const responseLate = !complaint.initial_response_at && ageHours > 24;

  return (
    <article
      className={`rounded-2xl border bg-card p-5 sm:p-6 ${responseLate ? "border-destructive/50" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{complaint.full_name}</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs ${complaint.status === "new" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}
            >
              {STATUS_LABELS[complaint.status as ComplaintStatus]}
            </span>
            {responseLate ? (
              <span className="rounded-full bg-destructive px-2.5 py-1 text-xs text-destructive-foreground">
                تجاوز 24 ساعة
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            استُلمت{" "}
            {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(complaint.created_at),
            )}
          </p>
          <p dir="ltr" className="mt-2 text-start text-sm">
            {complaint.phone}
            {complaint.email ? ` · ${complaint.email}` : ""}
          </p>
        </div>
        <code dir="ltr" className="rounded-lg bg-secondary px-2 py-1 text-[11px]">
          {complaint.id}
        </code>
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">نوع الشكوى</dt>
          <dd className="mt-1 font-medium">
            {TYPE_LABELS[complaint.complaint_type] ?? complaint.complaint_type}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">رقم الطلب أو المرجع</dt>
          <dd className="mt-1 font-medium">{complaint.order_reference || "—"}</dd>
        </div>
      </dl>
      <div className="mt-5 rounded-xl bg-secondary/50 p-4 text-sm leading-7 whitespace-pre-line">
        {complaint.details}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
        <label className="text-sm">
          الحالة
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ComplaintStatus)}
            className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ملاحظات داخلية
          <textarea
            value={notes}
            maxLength={4000}
            rows={3}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-3 text-sm text-primary">
          تم حفظ التحديث.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void save()}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}{" "}
          حفظ التحديث
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void remove()}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm text-destructive disabled:opacity-60"
        >
          {busy === "delete" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}{" "}
          حذف
        </button>
      </div>
    </article>
  );
}
