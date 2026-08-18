import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/cors.ts";
serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code } = await req.json();
    const normalizedCode = String(code ?? "").trim().toUpperCase();

    if (!normalizedCode) {
      return new Response(JSON.stringify({ error: "Código obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await admin.rpc("get_coach_by_invite_code", { p_code: normalizedCode });
    if (error) throw error;

    const coach = Array.isArray(data) ? data[0] : null;
    if (coach?.coach_id) {
      return new Response(JSON.stringify({
        coach_id: coach.coach_id,
        coach_name: coach.coach_name,
        notification_email: coach.notification_email,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: código de acesso de parceria (ex.: ELT-7K4P92)
    const { data: acRows, error: acErr } = await admin.rpc("resolve_access_code", { p_code: normalizedCode });
    if (acErr) throw acErr;
    const access = Array.isArray(acRows) ? acRows[0] : null;

    const expired = access?.expires_at ? new Date(access.expires_at).getTime() < Date.now() : false;
    if (!access?.coach_id || access.status !== "unused" || expired) {
      return new Response(JSON.stringify({ error: "Código inválido ou inexistente." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: coachProfile } = await admin
      .from("profiles")
      .select("full_name, notification_email")
      .eq("user_id", access.coach_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      coach_id: access.coach_id,
      coach_name: coachProfile?.full_name ?? "Seu Treinador",
      notification_email: coachProfile?.notification_email ?? null,
      access_code: access.code,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao validar código.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});