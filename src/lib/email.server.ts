import { Resend } from "resend";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  renderPureTableEmail,
  renderPureTableText,
  type PureTableEmailContent,
} from "@/lib/email-template";

export type NotificationType =
  | "contact_admin"
  | "contact_receipt"
  | "partner_admin"
  | "partner_receipt"
  | "waitlist_admin"
  | "waitlist_receipt"
  | "complaint_admin"
  | "complaint_receipt";

type SendNotificationInput = {
  eventKey: string;
  type: NotificationType;
  to: string;
  subject: string;
  content: PureTableEmailContent;
  metadata?: Record<string, string | null>;
};

const from = () => process.env["EMAIL_FROM"] || "PureTable <no-reply@puretable.co>";
const adminRecipient = () => process.env["EMAIL_ADMIN_RECIPIENT"] || "info@puretable.co";
const siteOrigin = () => (process.env["APP_URL"] || "https://puretable.co").replace(/\/$/, "");

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown email error");
  return message.slice(0, 1000);
}

export async function sendNotification(input: SendNotificationInput) {
  const { error: claimError } = await supabaseAdmin.from("email_deliveries").insert({
    event_key: input.eventKey,
    notification_type: input.type,
    recipient: input.to,
    subject: input.subject,
    metadata: input.metadata ?? {},
  });
  if (claimError?.code === "23505") return { skipped: true as const };
  if (claimError) throw new Error(`Could not record email delivery: ${claimError.message}`);

  try {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: from(),
        to: input.to,
        subject: input.subject,
        html: renderPureTableEmail(input.content, siteOrigin()),
        text: renderPureTableText(input.content),
      },
      { idempotencyKey: input.eventKey },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("email_deliveries")
      .update({ status: "sent", provider_id: data?.id ?? null, sent_at: new Date().toISOString() })
      .eq("event_key", input.eventKey);
    return { skipped: false as const, id: data?.id ?? null };
  } catch (error) {
    await supabaseAdmin
      .from("email_deliveries")
      .update({ status: "failed", error: errorMessage(error) })
      .eq("event_key", input.eventKey);
    throw error;
  }
}

export async function notifyContactSubmission(input: {
  id: string;
  name: string;
  email?: string | null;
  subject?: string | null;
  message: string;
}) {
  const jobs = [
    sendNotification({
      eventKey: `contact/${input.id}/admin`,
      type: "contact_admin",
      to: adminRecipient(),
      subject: `رسالة جديدة من ${input.name}`,
      content: {
        preheader: "وصلت رسالة جديدة عبر صفحة التواصل في Pure Table.",
        title: "رسالة تواصل جديدة",
        intro: "وصلت رسالة جديدة عبر الموقع، ويمكنك مراجعتها والرد عليها من بيانات المرسل أدناه.",
        details: [
          { label: "الاسم", value: input.name },
          { label: "البريد", value: input.email },
          { label: "الموضوع", value: input.subject || "بدون عنوان" },
          { label: "الرسالة", value: input.message },
        ],
        action: { label: "فتح لوحة الرسائل", url: `${siteOrigin()}/admin/messages` },
      },
      metadata: { submission_id: input.id },
    }),
  ];
  if (input.email) {
    jobs.push(
      sendNotification({
        eventKey: `contact/${input.id}/receipt`,
        type: "contact_receipt",
        to: input.email,
        subject: "استلمنا رسالتك — Pure Table",
        content: {
          preheader: "تم استلام رسالتك بنجاح.",
          title: `شكراً لك ${input.name}`,
          intro: "استلمنا رسالتك بنجاح، وسيطّلع عليها فريق Pure Table ويتواصل معك عند الحاجة.",
        },
        metadata: { submission_id: input.id },
      }),
    );
  }
  await Promise.allSettled(jobs);
}

export async function notifyComplaintSubmission(input: {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  complaintType: string;
  orderReference?: string | null;
  details: string;
}) {
  const jobs = [
    sendNotification({
      eventKey: `complaint/${input.id}/admin`,
      type: "complaint_admin",
      to: adminRecipient(),
      subject: `شكوى جديدة من ${input.name}`,
      content: {
        preheader: "وصلت شكوى جديدة عبر موقع Pure Table.",
        title: "شكوى جديدة",
        intro: "تحتاج الشكوى إلى رد أولي خلال 24 ساعة، ومعالجة خلال 3–5 أيام عمل.",
        details: [
          { label: "الاسم", value: input.name },
          { label: "الجوال", value: input.phone },
          { label: "البريد", value: input.email },
          { label: "نوع الشكوى", value: input.complaintType },
          { label: "رقم الطلب أو المرجع", value: input.orderReference },
          { label: "التفاصيل", value: input.details },
          { label: "الرقم المرجعي", value: input.id },
        ],
        action: { label: "فتح لوحة الشكاوى", url: `${siteOrigin()}/admin/complaints` },
      },
      metadata: { complaint_id: input.id },
    }),
  ];
  if (input.email) {
    jobs.push(
      sendNotification({
        eventKey: `complaint/${input.id}/receipt`,
        type: "complaint_receipt",
        to: input.email,
        subject: "استلمنا شكواك — Pure Table",
        content: {
          preheader: "تم استلام شكواك بنجاح.",
          title: `شكراً لك ${input.name}`,
          intro:
            "استلمنا شكواك بنجاح. سيكون الرد الأولي خلال 24 ساعة، ومدة المعالجة من 3 إلى 5 أيام عمل.",
          details: [{ label: "الرقم المرجعي", value: input.id }],
        },
        metadata: { complaint_id: input.id },
      }),
    );
  }
  await Promise.allSettled(jobs);
}

export async function notifyWaitlistSignup(input: {
  id: string;
  email: string;
  city?: string | null;
  source?: string | null;
}) {
  await Promise.allSettled([
    sendNotification({
      eventKey: `waitlist/${input.id}/admin`,
      type: "waitlist_admin",
      to: adminRecipient(),
      subject: "تسجيل جديد في قائمة انتظار Pure Table",
      content: {
        preheader: "انضم شخص جديد إلى قائمة الانتظار.",
        title: "تسجيل جديد في قائمة الانتظار",
        intro: "أُضيف بريد جديد إلى قائمة انتظار إطلاق Pure Table.",
        details: [
          { label: "البريد", value: input.email },
          { label: "المدينة", value: input.city },
          { label: "المصدر", value: input.source },
        ],
        action: { label: "فتح قائمة الانتظار", url: `${siteOrigin()}/admin/leads` },
      },
      metadata: { signup_id: input.id },
    }),
    sendNotification({
      eventKey: `waitlist/${input.id}/receipt`,
      type: "waitlist_receipt",
      to: input.email,
      subject: "أنت الآن ضمن قائمة انتظار Pure Table",
      content: {
        preheader: "تم تسجيلك في قائمة الانتظار.",
        title: "أهلاً بك في Pure Table",
        intro:
          "تم تسجيل بريدك بنجاح. سنخبرك عند إطلاق المنصة وأهم التحديثات المتعلقة بتوفر الدليل.",
      },
      metadata: { signup_id: input.id },
    }),
  ]);
}
