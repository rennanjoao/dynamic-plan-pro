import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const GOALS = ["hipertrofia", "emagrecer", "recomposicao", "manter"] as const;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

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

    const { studentId } = await req.json();
    if (!studentId) throw new Error("studentId é obrigatório");

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: link } = await adminClient
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", studentId)
        .eq("coach_id", user.id)
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    const { data: anamnese } = await adminClient
      .from("anamnesis")
      .select("ai_summary, baseline_metrics, body_fat")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anamnese || !anamnese.ai_summary) {
      return new Response(
        JSON.stringify({ ok: false, reason: "sem_anamnese" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseline = (anamnese.baseline_metrics as Record<string, unknown>) || {};
    const peso = typeof baseline.peso === "number" ? baseline.peso : Number(baseline.peso) || null;
    const altura = typeof baseline.altura === "number" ? baseline.altura : Number(baseline.altura) || null;

    const SYSTEM_PROMPT = `Você sugere macros iniciais (calorias/proteína/carbo/gordura/água) para o primeiro protocolo de um aluno de fitness, pro coach revisar antes de aplicar.
Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:
{"calories":0,"protein":0,"carbs":0,"fat":0,"water":0,"goal":"hipertrofia","rationale":"..."}
- "goal" deve ser exatamente um destes: "hipertrofia", "emagrecer", "recomposicao", "manter".
- Use peso/altura (se fornecidos) e o resumo da anamnese para estimar valores plausíveis (ex.: proteína entre 1.6 e 2.2g/kg como referência geral).
- "rationale": 1-2 frases curtas explicando o raciocínio, em português, pro coach avaliar rápido.
- NUNCA emita diagnóstico clínico. Se a anamnese mencionar condição de saúde, apenas module o tom (ex.: "considerar restrição X"), nunca prescreva tratamento.
- São só valores de partida — o coach sempre revisa antes de publicar.`;

    const userContent = JSON.stringify({
      peso_kg: peso,
      altura_cm: altura,
      percentual_gordura: anamnese.body_fat ?? null,
      resumoAnamnese: anamnese.ai_summary,
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
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    } catch {
      parsed = {};
    }

    const proteinMin = peso ? peso * 1.2 : 60;
    const proteinMax = peso ? peso * 3.0 : 300;
    const result = {
      ok: true,
      calories: clamp(parsed.calories, 1200, 6000, 2200),
      protein: clamp(parsed.protein, proteinMin, proteinMax, peso ? Math.round(peso * 1.8) : 160),
      carbs: clamp(parsed.carbs, 0, 800, 250),
      fat: clamp(parsed.fat, 20, 200, 55),
      water: clamp(parsed.water, 1, 6, 3),
      goal: GOALS.includes(parsed.goal as typeof GOALS[number]) ? parsed.goal : "manter",
      rationale: typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "Sugestão baseada nos dados da anamnese.",
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[protocol-initial-draft]", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});