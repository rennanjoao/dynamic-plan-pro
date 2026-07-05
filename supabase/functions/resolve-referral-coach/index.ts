// supabase/functions/resolve-referral-coach/index.ts
// Dado um código de indicação (?ref=), descobre automaticamente o coach do
// aluno que indicou — para que o amigo convidado NÃO precise digitar
// manualmente o código do coach na tela de cadastro (Anamnesis.tsx).
//
// Isso preserva a trava de segurança do site (ninguém se cadastra sem estar
// vinculado a um coach) enquanto elimina a fricção de pedir dois códigos
// diferentes (o de indicação + o do coach) pra mesma pessoa.
//
// Chamado ANTES do login (visitante ainda não tem conta), igual à
// validate-invite-code — por isso não exige Authorization header.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { refCode } = await req.json();
    if (!refCode || typeof refCode !== "string") {
      return new Response(JSON.stringify({ error: "refCode obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Resolve o código para o aluno que indicou (nunca exposto ao client)
    const { data: referrerId, error: resolveErr } = await admin.rpc("resolve_referral_code", {
      p_code: refCode,
    });
    if (resolveErr) throw resolveErr;

    if (!referrerId) {
      return new Response(JSON.stringify({ error: "Código de indicação inválido ou expirado." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Descobre o coach ATIVO desse aluno — é para esse coach que o
    //    novo aluno indicado também vai ser vinculado.
    const { data: link, error: linkErr } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("student_id", referrerId)
      .eq("status", "active")
      .maybeSingle();
    if (linkErr) throw linkErr;

    if (!link?.coach_id) {
      return new Response(JSON.stringify({ error: "Aluno indicador sem coach ativo no momento." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Busca os dados do coach (mesmo formato de validate-invite-code, para
    //    o front reutilizar o mesmo shape de estado `coach`)
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("full_name, notification_email")
      .eq("user_id", link.coach_id)
      .maybeSingle();
    if (profErr) throw profErr;

    return new Response(JSON.stringify({
      coach_id: link.coach_id,
      coach_name: prof?.full_name ?? "Seu Treinador",
      notification_email: prof?.notification_email ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
