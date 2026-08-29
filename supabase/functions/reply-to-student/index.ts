import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/cors.ts";
interface ReplyBody {
  studentId: string;
  message: string;
  notificationId?: string;
  context?: string;
  originalMessage?: string;
}

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReplyBody;
    if (!body?.studentId || !body?.message?.trim()) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Coach must own this student
    const { data: link } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("coach_id", user.id)
      .eq("student_id", body.studentId)
      .eq("status", "active")
      .maybeSingle();
    if (!link) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch student + coach profiles
    const [{ data: stuProf }, { data: coachProf }] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("user_id", body.studentId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    ]);

    const coachName = coachProf?.full_name || "Seu Treinador";
    const studentEmail = stuProf?.email || null;
    const studentName = stuProf?.full_name || "Aluno";
    const today = new Date().toISOString().slice(0, 10);

    // 1) Insert daily_alert (once) for student.
    //    CORREÇÃO: usamos frequency="once" e target_date=today, mas o TrainerAlert
    //    no frontend agora exibe alertas "once" por até 7 dias após created_at,
    //    garantindo que o aluno veja a resposta mesmo abrindo amanhã ou depois.
    const alertMessage = body.context
      ? `💬 Resposta de ${coachName} (${body.context}): ${body.message.trim()}`
      : `💬 Resposta de ${coachName}: ${body.message.trim()}`;
    const { error: alertErr } = await admin.from("daily_alerts").insert({
      trainer_id: user.id,
      student_id: body.studentId,
      message: alertMessage,
      frequency: "once",
      target_date: today,
      is_active: true,
    });
    if (alertErr) console.error("daily_alerts insert error", alertErr);

    // 2) Send email to student (if RESEND configured and student has email)
    let emailOk = false;
    if (RESEND_KEY && studentEmail) {
      const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#111">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #eaeaea">
      <h1 style="margin:0 0 12px 0;font-size:20px;color:#0F172A">
        Elite Prime <span style="color:#E11D48">Hub</span> — Resposta do seu treinador
      </h1>
      <p style="margin:0 0 4px 0"><strong>Olá ${esc(studentName)},</strong></p>
      <p style="margin:0 0 16px 0;color:#444">${esc(coachName)} respondeu sua dúvida${body.context ? ` sobre <strong>${esc(body.context)}</strong>` : ""}:</p>
      ${body.originalMessage ? `<blockquote style="margin:0 0 16px 0;padding:10px 14px;border-left:3px solid #E11D48;background:#fafafa;color:#555;font-size:13px">${esc(body.originalMessage)}</blockquote>` : ""}
      <div style="margin:16px 0;padding:16px;background:#fff7f7;border-radius:10px;border:1px solid #fde2e2;color:#222;white-space:pre-wrap;line-height:1.5">${esc(body.message)}</div>
      <p style="margin-top:12px;color:#444;font-size:13px">Acesse sua área do aluno para ver a mensagem completa na plataforma.</p>
      <p style="margin-top:20px;color:#888;font-size:12px;border-top:1px solid #f0f0f0;padding-top:14px">Mensagem automática — não responda este e-mail.</p>
    </div>
  </div>
</body></html>`;

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Elite Prime Hub <noreply@eliteprimehub.com.br>",
          to: [studentEmail],
          subject: `Resposta do seu treinador${body.context ? ` — ${body.context}` : ""}`,
          html,
        }),
      });
      emailOk = r.ok;
      if (!r.ok) console.error("resend failed", await r.text().catch(() => ""));
    }

    // 3) Mark notification read
    if (body.notificationId) {
      await admin.from("coach_notifications").update({ is_read: true }).eq("id", body.notificationId).eq("coach_id", user.id);
    }

    return new Response(JSON.stringify({ ok: true, emailOk, hasEmail: !!studentEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
