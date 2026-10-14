import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyContactSubmission } from "@/lib/email.server";
import { allow, clientKey } from "@/lib/rate-limit.server";

const MessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).or(z.literal("")),
  subject: z.string().trim().max(200),
  message: z.string().trim().min(1).max(4000),
  // Honeypot: a field real visitors never see or fill (hidden in the UI). Any value here means a bot
  // filled every field on the form, so the submission is dropped — the caller still gets a normal
  // success response, same as every other silent anti-abuse check in this app.
  company: z.string().trim().max(200).optional().default(""),
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => MessageSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.company) return { ok: true };
    const request = getRequest();
    if (
      !allow(clientKey(request, "contact"), 5, 600_000) ||
      !allow(`contact:${data.email || "anon"}`, 3, 600_000)
    ) {
      throw new Error("محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.");
    }
    const id = crypto.randomUUID();
    const email = data.email || null;
    const subject = data.subject || null;
    const { error } = await supabaseAdmin.from("contact_messages").insert({
      id,
      name: data.name,
      email,
      subject,
      message: data.message,
    });
    if (error) throw new Error(error.message);
    await notifyContactSubmission({ id, name: data.name, email, subject, message: data.message });
    return { ok: true };
  });
