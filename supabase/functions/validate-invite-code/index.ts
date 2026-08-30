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

    // Variantes toleradas: com/sem hífen, com/sem prefixo ELT-
    const bare = normalizedCode.replace(/[^A-Z0-9]/g, "");
    const withoutPrefix = bare.startsWith("ELT") ? bare.slice(3) : bare;
    const candidates = Array.from(new Set([
      normalizedCode,
      bare,
      withoutPrefix,
      `ELT-${withoutPrefix}`,
    ])).filter(Boolean);

    let coach: { coach_id?: string; coach_name?: string; notification_email?: string } | null = null;
    for (const c of candidates) {
      const { data, error } = await admin.rpc("get_coach_by_invite_code", { p_code: c });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.coach_id) { coach = row; break; }
    }
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
    let access: { id?: string; code?: string; coach_id?: string; status?: string; expires_at?: string } | null = null;
    for (const c of candidates) {
      const { data: acRows, error: acErr } = await admin.rpc("resolve_access_code", { p_code: c });
      if (acErr) throw acErr;
      const row = Array.isArray(acRows) ? acRows[0] : null;
      if (row?.coach_id) { access = row; break; }
    }

    const expired = access?.expires_at ? new Date(access.expires_at).getTime() < Date.now() : false;
    if (!access?.coach_id) {
      return new Response(JSON.stringify({ valid: false, error: "Código inválido ou inexistente." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (expired) {
      return new Response(JSON.stringify({ valid: false, error: "Este código expirou. Peça um novo ao seu treinador." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (access.status !== "unused") {
      return new Response(JSON.stringify({ valid: false, error: "Este código já foi utilizado. Peça um novo ao seu treinador." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: coachProfile } = await admin
      .from("profiles")
      .select("full_name, notification_email")
      .eq("user_id", access.coach_id)
      .maybeSingle();

    return new Response(JSON.stringify({
      valid: true,
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