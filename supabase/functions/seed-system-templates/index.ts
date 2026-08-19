// Seeder one-off: migra SYSTEM_TEMPLATES (conteúdo de referência ACSM/NSCA/
// Schoenfeld/Contreras — NÃO é a metodologia oficial do projeto) para
// registros reais em protocols (is_template = true, coach_id/student_id NULL).
// Idempotente: pula templates já migrados (template_source = 'system_reference').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { SYSTEM_TEMPLATES } from "./templates.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: existing } = await sb.from("protocols").select("name").eq("template_source", "system_reference");
  const have = new Set((existing ?? []).map((r: { name: string }) => r.name));

  const rows = SYSTEM_TEMPLATES.filter((t) => !have.has(t.name)).map((t) => ({
    student_id: null,
    coach_id: null,
    name: t.name,
    is_template: true,
    active: false,
    template_profile: t.profile,
    template_division: t.division,
    template_source: "system_reference",
    payload: {
      setup: { split: t.division, mealsCount: 5, carbCycle: false },
      guidelines: {
        training:
          "Conteúdo de referência migrado de SYSTEM_TEMPLATES (base ACSM/NSCA/Schoenfeld/Contreras). Não é a metodologia oficial do projeto.",
        diet: "", weekOrganization: "", supplementation: "",
      },
      workouts: t.treinos.workouts,
      meals: [],
    },
  }));

  if (rows.length) {
    const { error } = await sb.from("protocols").insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  return new Response(JSON.stringify({ ok: true, inserted: rows.length, skipped: have.size }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
