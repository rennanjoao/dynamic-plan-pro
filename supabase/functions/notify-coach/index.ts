// supabase/functions/notify-coach/index.ts
// Notifica o coach vinculado ao aluno autenticado: grava o sino em
// coach_notifications e, best-effort, envia e-mail (via Resend).
// Recebe { coachEmail?, studentName, studentEmail, kind, subject?, summary?, data?, photos? }.
// O campo coachEmail vindo do cliente é IGNORADO — o e-mail correto é buscado
// server-side via coach_students + profiles (duas queries, sem JOIN com hint).
//
// Contrato de resposta: a partir do momento em que tentamos gravar o sino,
// toda resposta volta com HTTP 200 e um `ok` definitivo (true = sino
// gravado ou nada a fazer; false = falha real de persistência). O cliente
// (src/lib/notifyCoach.ts) trata qualquer corpo JSON como final e não
// repete a chamada — só retenta em erro de transporte (sem corpo algum) —
// então nunca devolvemos um status não-2xx depois desse ponto: isso faria
// o cliente reter e re-inserir o sino, duplicando a notificação.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface NotifyBody {
  coachEmail?: string;
  studentName?: string;
  studentEmail?: string;
  kind: "anamnesis" | "checkin" | "question";
  subject?: string;
  summary?: string;
  data?: Record<string, unknown>;
  photos?: Record<string, string>;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderDataTable(data?: Record<string, unknown>): string {
  if (!data || typeof data !== "object") return "";
  const rows = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;"><strong>${esc(k)}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(val)}</td></tr>`;
    })
    .join("");
  if (!rows) return "";
  return `<table style="border-collapse:collapse;width:100%;margin-top:12px;font-size:13px;">${rows}</table>`;
}

function renderPhotos(photos?: Record<string, string>): string {
  if (!photos) return "";
  const imgs = Object.entries(photos)
    .filter(([, url]) => !!url)
    .map(
      ([label, url]) =>
        `<div style="display:inline-block;margin:4px;text-align:center;font-size:12px;color:#666;"><img src="${esc(url)}" alt="${esc(label)}" style="max-width:140px;border-radius:8px;display:block;"/>${esc(label)}</div>`
    )
    .join("");
  return imgs ? `<div style="margin-top:12px;">${imgs}</div>` : "";
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as NotifyBody;
    if (!body?.kind) {
      return new Response(JSON.stringify({ error: "missing kind" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Busca o coach vinculado ao aluno autenticado (duas queries — sem hint de FK).
    const { data: link } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!link?.coach_id) {
      // Não é uma falha: não há coach ativo vinculado a este aluno agora, e
      // retentar não muda isso. ok:true encerra o retry no cliente.
      return new Response(JSON.stringify({ ok: true, reason: "no_coach_linked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: coachProfile } = await admin
      .from("profiles")
      .select("full_name, email, notification_email")
      .eq("user_id", link.coach_id)
      .maybeSingle();

    const coachEmail = coachProfile?.notification_email || coachProfile?.email || null;
    const coachName = coachProfile?.full_name || "Coach";

    // Grava notificação persistente no sininho do coach (mesmo padrão do fluxo
    // de "dúvida do aluno"). Fazemos isso ANTES do e-mail para garantir que,
    // mesmo se o Resend falhar ou não houver e-mail configurado, o coach ainda
    // veja o alerta ao entrar no painel.
    const contextLabel =
      body.kind === "anamnesis" ? "Anamnese"
      : body.kind === "checkin" ? "Check-in"
      : "Dúvida do aluno";
    const persistedMessage = (body.summary && body.summary.trim())
      || (body.kind === "anamnesis" ? "Nova anamnese enviada."
          : body.kind === "checkin" ? "Novo check-in enviado."
          : "Nova dúvida.");
    let bellPersisted = false;
    try {
      await admin.from("coach_notifications").insert({
        coach_id: link.coach_id,
        student_id: user.id,
        student_name: body.studentName || "Aluno",
        context: contextLabel,
        message: persistedMessage,
      });
      bellPersisted = true;
    } catch (persistErr) {
      console.warn("[notify-coach] persist coach_notifications falhou", persistErr);
    }

    // Dali em diante, `ok` reflete só se o sino foi gravado — é a garantia
    // que este endpoint promete. O e-mail é um bônus best-effort: sua falha
    // não deve fazer o cliente achar que precisa retentar (o que só
    // duplicaria o INSERT acima) nem reportar a operação como um todo como
    // falha quando o coach já vai ver o alerta ao abrir o painel.
    if (!coachEmail) {
      return new Response(JSON.stringify({ ok: bellPersisted, reason: "coach_without_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_KEY) {
      console.warn("[notify-coach] RESEND_API_KEY ausente — pulando envio");
      return new Response(JSON.stringify({ ok: bellPersisted, reason: "no_resend_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const kindLabel =
      body.kind === "anamnesis" ? "Nova anamnese"
      : body.kind === "checkin" ? "Novo check-in"
      : "Nova dúvida do aluno";

    const subject = body.subject || `${kindLabel} — ${body.studentName || "Aluno"}`;
    const summary = body.summary || "";

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <div style="background:#0f172a;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;">
    <h2 style="margin:0;font-size:18px;">${esc(kindLabel)}</h2>
    <p style="margin:4px 0 0 0;font-size:13px;opacity:.8;">Olá, ${esc(coachName)}</p>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 8px 0;"><strong>Aluno:</strong> ${esc(body.studentName || "—")}${body.studentEmail ? ` &lt;${esc(body.studentEmail)}&gt;` : ""}</p>
    ${summary ? `<p style="margin:8px 0;color:#444;">${esc(summary)}</p>` : ""}
    ${renderDataTable(body.data)}
    ${renderPhotos(body.photos)}
    <p style="margin-top:18px;font-size:12px;color:#888;">Enviado automaticamente pelo Elite Prime Hub.</p>
  </div>
</div>`.trim();

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Elite Prime Hub <noreply@eliteprimehub.com.br>",
        to: [coachEmail],
        reply_to: body.studentEmail || undefined,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("[notify-coach] Resend falhou", resendRes.status, errText);
      // HTTP 200 (não 502): o sino já foi gravado acima, então isto não é
      // mais retryable — um 502 aqui faria o cliente reter e duplicar o
      // INSERT em coach_notifications sem nunca conseguir enviar o e-mail.
      return new Response(JSON.stringify({ ok: bellPersisted, emailSent: false, reason: "resend_failed", status: resendRes.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, emailSent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[notify-coach] exception", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
