// notify-protocol-published — e-mail ao aluno quando o coach PUBLICA o protocolo.
//
// Antes o aluno só descobria uma atualização se abrisse o app (card
// "Diretriz Técnica"). Decisão do produto: avisar pelo e-mail cadastrado +
// o card no app (que já existia).
//
// Regras:
//  - só o coach com vínculo ATIVO com o aluno pode disparar;
//  - no máximo 1 e-mail por aluno a cada 6 h (várias publicações seguidas
//    viram um aviso só — o app mostra todas as mudanças acumuladas);
//  - nunca bloqueia o coach: falha de e-mail só é registrada no log.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const APP_URL = "https://app.eliteprimehub.com.br/student-area";
const THROTTLE_SECONDS = 6 * 60 * 60;

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Body {
  studentId?: string;
  isFirst?: boolean;
  changes?: unknown;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "unauthorized" });

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.studentId) return json(400, { error: "missing studentId" });

    const linkQuery = (cols: string) => admin
      .from("coach_students").select(cols)
      .eq("coach_id", user.id).eq("student_id", body.studentId).eq("status", "active")
      .maybeSingle();
    const first = await linkQuery("id, last_protocol_email_at");
    const linkErr = first.error;
    // migration 0007 ainda não aplicada → busca sem a coluna nova
    const link = linkErr ? (await linkQuery("id")).data : first.data;
    if (!link) return json(403, { error: "forbidden" });

    // 1 e-mail por aluno a cada 6 h (coluna da migration 0007).
    const last = (link as { last_protocol_email_at?: string | null }).last_protocol_email_at;
    if (last && Date.now() - new Date(last).getTime() < THROTTLE_SECONDS * 1000) {
      return json(200, { ok: true, sent: false, reason: "throttled" });
    }

    const [{ data: stu }, { data: coach }] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("user_id", body.studentId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    ]);
    const studentEmail = stu?.email ?? null;
    if (!RESEND_KEY || !studentEmail) return json(200, { ok: true, sent: false, reason: !RESEND_KEY ? "no_resend" : "no_email" });

    const coachName = (coach?.full_name ?? "").trim() || "Seu treinador";
    const firstName = String(stu?.full_name ?? "").trim().split(/\s+/)[0] || "";
    const labels = (Array.isArray(body.changes) ? body.changes : [])
      .map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 6);

    const subject = body.isFirst
      ? `Seu protocolo está pronto — ${coachName}`
      : `${coachName} atualizou seu protocolo`;
    const intro = body.isFirst
      ? `${esc(coachName)} terminou seu protocolo de treino e dieta. Já está tudo no app.`
      : `${esc(coachName)} fez ajustes no seu protocolo. Abra o app para ver o que mudou.`;
    const list = labels.length
      ? `<ul style="margin:0 0 16px 0;padding-left:18px;color:#333;line-height:1.6">${labels.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
      : "";

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #eaeaea">
      <p style="margin:0 0 4px 0;font-size:18px"><strong>${firstName ? `Olá, ${esc(firstName)}!` : "Olá!"}</strong></p>
      <p style="margin:0 0 16px 0;color:#444;font-size:15px;line-height:1.5">${intro}</p>
      ${list}
      <a href="${APP_URL}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;font-size:15px">Abrir meu protocolo</a>
      <p style="margin-top:20px;color:#888;font-size:12px;border-top:1px solid #f0f0f0;padding-top:14px">Mensagem automática — não responda este e-mail. Dúvidas? Use o botão "Tenho uma dúvida" no app.</p>
    </div>
  </div>
</body></html>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Elite Prime Hub <noreply@eliteprimehub.com.br>",
        to: [studentEmail],
        subject,
        html,
      }),
    });
    if (!r.ok) console.error("resend failed", await r.text().catch(() => ""));
    if (r.ok && !linkErr) {
      await admin.from("coach_students").update({ last_protocol_email_at: new Date().toISOString() })
        .eq("id", (link as { id: string }).id);
    }
    return json(200, { ok: true, sent: r.ok });
  } catch (e) {
    console.error("notify-protocol-published", e);
    return json(500, { error: e instanceof Error ? e.message : "unknown" });
  }
});
