import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { checkInId } = await req.json();
    if (!checkInId) throw new Error("checkInId é obrigatório");

    const { data: current, error: curErr } = await adminClient
      .from("check_ins")
      .select("id, student_id, current_metrics, payload, submitted_at, updated_at")
      .eq("id", checkInId)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current) throw new Error("Check-in não encontrado");

    const [{ data: isAdmin }, { data: isCoachRole }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "coach" }),
    ]);
    let allowed = user.id === current.student_id || !!isAdmin;
    if (!allowed && isCoachRole) {
      const { data: link } = await adminClient
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", current.student_id)
        .eq("coach_id", user.id)
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    const { data: existing } = await adminClient
      .from("checkin_ai_insights")
      .select("generated_at")
      .eq("check_in_id", checkInId)
      .maybeSingle();
    const checkinChangedAt = current.updated_at ?? current.submitted_at;
    if (existing && new Date(existing.generated_at) >= new Date(checkinChangedAt)) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_up_to_date" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: previous }, { data: anam }, { data: workouts }] = await Promise.all([
      adminClient
        .from("check_ins")
        .select("current_metrics, payload, submitted_at")
        .eq("student_id", current.student_id)
        .neq("id", checkInId)
        .order("submitted_at", { ascending: false })
        .limit(3),
      adminClient
        .from("anamnesis")
        .select("baseline_metrics, payload, ai_summary")
        .eq("student_id", current.student_id)
        .maybeSingle(),
      adminClient
        .from("workout_progress")
        .select("completed, completed_at")
        .eq("user_id", current.student_id)
        .gte("completed_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const workoutAdherence = {
      completedLast14d: (workouts ?? []).filter((w) => w.completed).length,
      totalLast14d: (workouts ?? []).length,
    };

    const SYSTEM_PROMPT = `Você analisa a evolução de um aluno de fitness/nutrição para o coach dele.
Responda SOMENTE com um JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{"changes": ["..."], "hypotheses": ["..."], "alerts": ["..."]}
- "changes": até 5 mudanças objetivas entre o check-in atual e os anteriores (peso, medidas, sono, humor, aderência etc.).
- "hypotheses": até 3 hipóteses técnicas plausíveis para essas mudanças.
- "alerts": até 3 pontos que merecem atenção do coach (fadiga, baixa aderência, piora clínica). Array vazio se não houver nada relevante.
Nunca invente dado que não esteja no contexto. Seja objetivo, técnico, em português.`;

    const userContent = JSON.stringify({
      checkInAtual: { metrics: current.current_metrics, payload: current.payload, data: current.submitted_at },
      checkInsAnteriores: previous ?? [],
      anamneseResumo: anam?.ai_summary ?? null,
      anamneseBaseline: anam?.baseline_metrics ?? null,
      aderenciaTreino14d: workoutAdherence,
    });

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
        temperature: 0.3,
        reasoning_effort: "none",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { changes?: string[]; hypotheses?: string[]; alerts?: string[] };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      console.error("[checkin-insight] resposta não-JSON do modelo:", raw);
      parsed = { changes: [], hypotheses: [], alerts: [] };
    }

    const { error: upsertErr } = await adminClient
      .from("checkin_ai_insights")
      .upsert(
        {
          check_in_id: checkInId,
          summary: {
            changes: parsed.changes ?? [],
            hypotheses: parsed.hypotheses ?? [],
            alerts: parsed.alerts ?? [],
          },
          generated_at: new Date().toISOString(),
        },
        { onConflict: "check_in_id" }
      );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[checkin-insight]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
