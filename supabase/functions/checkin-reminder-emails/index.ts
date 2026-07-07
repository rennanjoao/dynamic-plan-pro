// supabase/functions/checkin-reminder-emails/index.ts
// Motor de e-mails transacionais de check-in — D-1 (aviso prévio),
// D-0 (dia do feedback) e D+2 (repescagem, se ainda pendente).
//
// Invocado diariamente via pg_cron (ver migration
// checkin_reminder_engine.sql). NÃO é chamado pelo frontend — por isso
// não usa o padrão de CORS/JWT de usuário das demais functions; a
// autenticação é feita via header `x-cron-secret` comparado a um
// secret configurado nas Edge Function Secrets (CRON_SECRET).
//
// Cadência: lida por aluno a partir de coach_students
// (warning_days = D-0, critical_days = D+2, D-1 = warning_days - 1),
// com fallback para os defaults 14/16 — mesma lógica de
// src/components/student/FeedbackCountdownAlert.tsx, para o e-mail
// nunca contradizer o alerta que o aluno já vê dentro do app.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCheckinEmailHtml, type EmailType } from "../_shared/checkinCopy.ts";

const APP_CTA_URL = "https://app.eliteprimehub.com.br/check-in";
const FROM_ADDRESS = "Elite Prime Hub <noreply@eliteprimehub.com.br>";
const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Maior timestamp entre submitted_at/updated_at — mesmo critério do app. */
function effectiveTimeMs(row: { submitted_at?: string | null; updated_at?: string | null }): number {
  const sub = row.submitted_at ? new Date(row.submitted_at).getTime() : NaN;
  const upd = row.updated_at ? new Date(row.updated_at).getTime() : NaN;
  const values = [sub, upd].filter((v) => !isNaN(v));
  return values.length ? Math.max(...values) : NaN;
}

function daysSinceMs(ms: number): number | null {
  if (!isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

interface CoachStudentLink {
  student_id: string;
  coach_id: string | null;
  feedback_interval_days: number | null;
  warning_days: number | null;
  critical_days: number | null;
}

interface CandidateRow {
  student_id: string;
  coach_id: string | null;
  email_type: EmailType;
  reference_date: string;
  days_since_feedback: number;
  variant_index: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    // ── Autenticação: segredo compartilhado com o job do pg_cron ──
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const incoming = req.headers.get("x-cron-secret");
    if (!CRON_SECRET || incoming !== CRON_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const today = todayISODate();

    // 1) Vínculos ativos coach-aluno + configuração de cadência de cada um
    const { data: links, error: linksErr } = await admin
      .from("coach_students")
      .select("student_id, coach_id, feedback_interval_days, warning_days, critical_days")
      .eq("status", "active");
    if (linksErr) throw linksErr;

    if (!links || links.length === 0) {
      return json({ ok: true, processed: 0, sent: 0, reason: "no_active_students" });
    }

    const studentIds = [...new Set((links as CoachStudentLink[]).map((l) => l.student_id))];
    const coachIds = [
      ...new Set((links as CoachStudentLink[]).map((l) => l.coach_id).filter(Boolean) as string[]),
    ];

    const [{ data: studentProfiles }, { data: coachProfiles }, { data: lastCheckins }, { data: lastAnamnesis }] =
      await Promise.all([
        admin.from("profiles").select("user_id, full_name, email").in("user_id", studentIds),
        admin
          .from("profiles")
          .select("user_id, full_name, team_name")
          .in("user_id", coachIds.length ? coachIds : [PLACEHOLDER_UUID]),
        admin
          .from("check_ins")
          .select("student_id, submitted_at, updated_at")
          .in("student_id", studentIds)
          .order("submitted_at", { ascending: false })
          .limit(studentIds.length * 3),
        admin
          .from("anamnesis")
          .select("student_id, submitted_at, updated_at")
          .in("student_id", studentIds),
      ]);

    const lastCheckinMsByStudent = new Map<string, number>();
    lastCheckins?.forEach((c: { student_id: string; submitted_at: string; updated_at?: string | null }) => {
      const t = effectiveTimeMs(c);
      if (!isFinite(t)) return;
      const prev = lastCheckinMsByStudent.get(c.student_id);
      if (prev === undefined || t > prev) lastCheckinMsByStudent.set(c.student_id, t);
    });

    const lastAnaMsByStudent = new Map<string, number>();
    lastAnamnesis?.forEach((a: { student_id: string; submitted_at: string | null; updated_at?: string | null }) => {
      const t = effectiveTimeMs(a);
      if (!isFinite(t)) return;
      const prev = lastAnaMsByStudent.get(a.student_id);
      if (prev === undefined || t > prev) lastAnaMsByStudent.set(a.student_id, t);
    });

    // 2) Calcula o bucket (d1 / d0 / d2) de cada aluno e monta o conteúdo
    //    do e-mail (a variação aleatória é escolhida aqui, uma única vez,
    //    para o log e o envio usarem exatamente o mesmo texto).
    const candidates: CandidateRow[] = [];
    const contentByKey = new Map<string, { subject: string; html: string; email: string | null }>();

    for (const link of links as CoachStudentLink[]) {
      const sid = link.student_id;
      const anaMs = lastAnaMsByStudent.get(sid);
      if (anaMs === undefined) continue; // sem anamnese ainda -> onboarding, não notifica

      const ciMs = lastCheckinMsByStudent.get(sid);
      const referenceMs = ciMs !== undefined ? ciMs : anaMs;
      const days = daysSinceMs(referenceMs);
      if (days === null) continue;

      const warning = link.warning_days ?? 14;
      const critical = link.critical_days ?? 16;
      const preDay = Math.max(warning - 1, 1);

      let emailType: EmailType | null = null;
      if (days === preDay) emailType = "d1";
      else if (days === warning) emailType = "d0";
      else if (days === critical) emailType = "d2";
      if (!emailType) continue;

      const student = studentProfiles?.find((p: { user_id: string }) => p.user_id === sid);
      const coach = coachProfiles?.find((p: { user_id: string }) => p.user_id === link.coach_id);
      const coachLabel =
        (coach as { team_name?: string | null; full_name?: string | null } | undefined)?.team_name ||
        (coach as { full_name?: string | null } | undefined)?.full_name ||
        "Elite Prime Hub";
      const studentFullName = (student as { full_name?: string | null } | undefined)?.full_name || "";
      const studentFirstName = studentFullName.trim().split(/\s+/)[0] || "atleta";

      const built = buildCheckinEmailHtml(emailType, {
        studentName: studentFirstName,
        coachName: coachLabel,
        ctaUrl: APP_CTA_URL,
      });

      const key = `${sid}:${emailType}:${today}`;
      contentByKey.set(key, {
        subject: built.subject,
        html: built.html,
        email: (student as { email?: string | null } | undefined)?.email ?? null,
      });

      candidates.push({
        student_id: sid,
        coach_id: link.coach_id,
        email_type: emailType,
        reference_date: today,
        days_since_feedback: days,
        variant_index: built.variantIndex,
      });
    }

    if (candidates.length === 0) {
      return json({ ok: true, processed: links.length, sent: 0, reason: "no_candidates_today" });
    }

    // 3) "Reserva" atômica: insere no log ignorando duplicatas. Só o que for
    //    efetivamente inserido (ainda não existia para student+tipo+dia) é
    //    enviado — protege contra o cron rodar 2x no mesmo dia ou retry.
    const { data: claimed, error: claimErr } = await admin
      .from("checkin_reminder_log")
      .upsert(candidates, {
        onConflict: "student_id,email_type,reference_date",
        ignoreDuplicates: true,
      })
      .select("student_id, coach_id, email_type");
    if (claimErr) throw claimErr;

    if (!claimed || claimed.length === 0) {
      return json({ ok: true, processed: links.length, candidates: candidates.length, sent: 0, reason: "already_sent_today" });
    }

    // 4) Envia os e-mails reservados
    let sent = 0;
    const failures: { student_id: string; email_type: string; error: string }[] = [];

    for (const row of claimed as { student_id: string; coach_id: string | null; email_type: EmailType }[]) {
      const key = `${row.student_id}:${row.email_type}:${today}`;
      const content = contentByKey.get(key);
      if (!content?.email) {
        failures.push({ student_id: row.student_id, email_type: row.email_type, error: "student_without_email" });
        continue;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [content.email],
            subject: content.subject,
            html: content.html,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          failures.push({ student_id: row.student_id, email_type: row.email_type, error: `resend_${res.status}: ${errText}` });
          continue;
        }
        sent += 1;
      } catch (e) {
        failures.push({
          student_id: row.student_id,
          email_type: row.email_type,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    return json({
      ok: true,
      processed: links.length,
      candidates: candidates.length,
      claimed: claimed.length,
      sent,
      failures,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown_error";
    console.error("[checkin-reminder-emails] exception", msg);
    return json({ ok: false, error: msg }, 500);
  }
});