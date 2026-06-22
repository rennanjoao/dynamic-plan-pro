import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/cors.ts";

interface NotifyBody {
  // [FIX ALTO] coachEmail removido da interface — o destino agora é sempre
  // determinado pelo banco de dados (coach vinculado ao aluno autenticado),
  // nunca pelo valor enviado pelo cliente. Isso impede que um aluno logado
  // envie e-mails para qualquer destinatário externo usando nosso remetente.
  studentName?: string;
  studentEmail?: string;
  kind: "anamnesis" | "checkin" | "question";
  subject?: string;
  summary?: string;
  data?: Record<string, unknown>;
  photos?: Record<string, string>;
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PHOTO_LABELS: Record<string, string> = {
  frente: "Frente",
  lateral_dir: "Lateral Direita",
  lateral_esq: "Lateral Esquerda",
  costas: "Costas",
};

function renderHtml(body: NotifyBody): string {
  const title =
    body.kind === "anamnesis" ? "Nova Anamnese" :
    body.kind === "checkin" ? "Novo Check-in" :
    "Nova Dúvida do Aluno";

  const studentLine = body.studentName
    ? `<p style="margin:0 0 4px 0"><strong>Aluno:</strong> ${escapeHtml(body.studentName)}</p>` : "";
  const emailLine = body.studentEmail
    ? `<p style="margin:0 0 4px 0"><strong>E-mail:</strong> ${escapeHtml(body.studentEmail)}</p>` : "";

  let dataBlock = "";
  if (body.data && Object.keys(body.data).length) {
    const rows = Object.entries(body.data)
      .filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "fotos")
      .map(([k, v]) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:#444;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#222">${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v))}</td>
        </tr>`
      ).join("");
    if (rows) dataBlock = `<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">${rows}</table>`;
  }

  let photosBlock = "";
  if (body.photos && Object.keys(body.photos).length) {
    const validPhotos = Object.entries(body.photos).filter(([, url]) => !!url);
    if (validPhotos.length) {
      const grid = validPhotos.map(([k, url]) => `
        <td style="padding:8px;text-align:center;vertical-align:top;width:25%">
          <a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(PHOTO_LABELS[k] ?? k)}"
              style="width:140px;height:180px;object-fit:cover;border-radius:8px;border:1px solid #eee;display:block;margin:0 auto" />
            <span style="display:block;margin-top:6px;font-size:12px;color:#555;font-weight:600">
              ${escapeHtml(PHOTO_LABELS[k] ?? k)}
            </span>
            <span style="display:block;font-size:10px;color:#888">clique para ampliar</span>
          </a>
        </td>`).join("");

      photosBlock = `
        <div style="margin-top:24px">
          <h3 style="margin:0 0 12px 0;font-size:15px;color:#0F172A;border-bottom:1px solid #eee;padding-bottom:8px">📸 Fotos do Aluno</h3>
          <table style="width:100%;border-collapse:collapse"><tr>${grid}</tr></table>
        </div>`;
    }
  }

  const summaryBlock = body.summary
    ? `<p style="margin:12px 0;color:#333;line-height:1.5">${escapeHtml(body.summary)}</p>` : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#111">
  <div style="max-width:680px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #eaeaea">
      <h1 style="margin:0 0 16px 0;font-size:20px;color:#0F172A">
        Elite Prime <span style="color:#E11D48">Hub</span> — ${title}
      </h1>
      ${studentLine}${emailLine}${summaryBlock}${dataBlock}${photosBlock}
      <p style="margin-top:28px;color:#888;font-size:12px;border-top:1px solid #f0f0f0;padding-top:16px">
        Mensagem automática — acesse o painel para responder.
      </p>
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Exige usuário autenticado (aluno ou coach logado) ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as NotifyBody;
    if (!body?.kind) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── [FIX ALTO] Buscar o e-mail do coach pelo banco, ignorando qualquer
    // valor que o cliente tenha tentado enviar. O destino do e-mail é sempre
    // determinado pelo vínculo coach_students → profiles do banco de dados. ──
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: coachLink, error: linkErr } = await adminClient
      .from("coach_students")
      .select("coach_id, profiles!coach_students_coach_id_fkey(notification_email, email)")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (linkErr || !coachLink) {
      return new Response(JSON.stringify({ error: "coach_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preferência: notification_email; fallback: email do perfil
    const coachProfile = coachLink.profiles as { notification_email?: string; email?: string } | null;
    const coachEmail = coachProfile?.notification_email || coachProfile?.email;
    if (!coachEmail) {
      return new Response(JSON.stringify({ error: "coach_email_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ── fim do fix ──

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = body.subject || (
      body.kind === "anamnesis" ? `Nova Anamnese — ${body.studentName ?? "Aluno"}` :
      body.kind === "checkin" ? `Novo Check-in — ${body.studentName ?? "Aluno"}` :
      `Nova Dúvida — ${body.studentName ?? "Aluno"}`
    );

    const r = await fetch("https://api.resend.com/emails", {
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
        html: renderHtml(body),
      }),
    });

    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "resend_failed", status: r.status, detail: out }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: out?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
