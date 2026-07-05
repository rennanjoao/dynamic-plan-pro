// supabase/functions/register-referral/index.ts
// Grava a atribuição de indicação aluno→aluno após o cadastro do novo aluno.
// Chamada por src/pages/Anamnesis.tsx logo após link-coach-student ter sucesso.
//
// Regras de segurança:
// - O referrer_student_id NUNCA vem do client — é resolvido no banco (RPC
//   resolve_referral_code), senão qualquer pessoa poderia forjar um UUID e
//   "roubar" a comissão de outro aluno.
// - Auto-indicação é bloqueada (referrerId === referredUserId).
// - Idempotente via UNIQUE(referred_user_id) + upsert ignoreDuplicates: um
//   usuário só pode ser atribuído a UM indicador, para sempre.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { refCode, coachId, utmSource, utmMedium, utmCampaign } = await req.json();

    if (!refCode || typeof refCode !== "string") {
      return new Response(JSON.stringify({ error: "refCode obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const referredUserId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve o código para o aluno que indicou (nunca confiar em ID vindo do client)
    const { data: referrerId, error: resolveErr } = await admin.rpc("resolve_referral_code", {
      p_code: refCode,
    });
    if (resolveErr) throw resolveErr;

    if (!referrerId) {
      // Código inexistente/expirado — não é erro fatal, o cadastro segue normalmente
      return new Response(JSON.stringify({ ok: true, attributed: false, reason: "invalid_code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (referrerId === referredUserId) {
      return new Response(JSON.stringify({ ok: true, attributed: false, reason: "self_referral" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotente: UNIQUE(referred_user_id) garante que cada pessoa só é
    // atribuída a um indicador, mesmo que essa function seja chamada 2x.
    const { error: insertErr } = await admin
      .from("referrals")
      .upsert(
        {
          referrer_student_id: referrerId,
          referred_user_id: referredUserId,
          coach_id: coachId ?? null,
          ref_code: String(refCode).trim().toUpperCase(),
          utm_source: utmSource ?? null,
          utm_medium: utmMedium ?? null,
          utm_campaign: utmCampaign ?? null,
          converted_at: new Date().toISOString(),
        },
        { onConflict: "referred_user_id", ignoreDuplicates: true }
      );

    if (insertErr) {
      console.warn("[register-referral] falha ao gravar:", insertErr.message);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, attributed: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
