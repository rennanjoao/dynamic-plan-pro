import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const GOALS = ["hipertrofia", "emagrecer", "recomposicao", "manter"] as const;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && isFinite(n) ? n : Number(n);
  const base = isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, base));
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

/** Reduz o payload da anamnese a um texto curto e legível pro modelo. */
function summarizePayload(payload: Record<string, unknown>): string {
  const KEYS_OF_INTEREST = [
    "meta_prioridade", "objetivo", "objetivo_principal", "prazo_meta",
    "sexo", "data_nasc", "idade", "profissao", "rotina",
    "nivel_treino", "experiencia_treino", "frequencia_treino", "dias_treino", "horario_treino",
    "atividade_fisica", "cardio", "passos_dia",
    "refeicoes_dia", "restricao_alimentar", "alergias", "intolerancias", "alimentos_nao_gosta",
    "suplementos", "medicamentos", "condicoes_clinicas", "doencas", "cirurgias", "lesoes",
    "sono_horas", "qualidade_sono", "estresse", "agua_dia", "alcool", "intestino",
    "peso_objetivo", "historico_dietas",
  ];
  const lines: string[] = [];
  for (const k of KEYS_OF_INTEREST) {
    const v = payload[k];
    if (v === null || v === undefined || v === "" ) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    lines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  // Fallback: se nada dos campos de interesse existir, manda os primeiros campos preenchidos.
  if (lines.length === 0) {
    for (const [k, v] of Object.entries(payload)) {
      if (v === null || v === undefined || v === "") continue;
      if (typeof v === "object") continue;
      lines.push(`${k}: ${String(v)}`);
      if (lines.length >= 25) break;
    }
  }
  return lines.join("\n");
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

    const body = await req.json().catch(() => ({}));
    const studentId = body?.studentId as string | undefined;
    if (!studentId) throw new Error("studentId é obrigatório");
    const mealsCount = clamp(body?.mealsCount, 3, 8, 5);
    const split = typeof body?.split === "string" && body.split.trim() ? body.split.trim() : null;
    const carbCycle = body?.carbCycle === true;

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

    // 1) Anamnese: NÃO exigir ai_summary — a maioria dos registros não tem.
    const { data: anamnese } = await adminClient
      .from("anamnesis")
      .select("ai_summary, baseline_metrics, payload, body_fat, submitted_at")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2) Perfil do aluno (altura / sexo / nascimento) como complemento.
    const { data: profile } = await adminClient
      .from("student_profiles")
      .select("gender, height, birth_date, full_name")
      .eq("user_id", studentId)
      .maybeSingle();

    // 3) Última medida corporal como fallback de peso.
    const { data: lastMeasure } = await adminClient
      .from("body_measurements")
      .select("weight, body_fat_percentage, measurement_date")
      .eq("user_id", studentId)
      .order("measurement_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4) Último check-in como fallback mais recente de peso.
    const { data: lastCheckin } = await adminClient
      .from("check_ins")
      .select("current_metrics, body_fat, submitted_at")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const baseline = (anamnese?.baseline_metrics as Record<string, unknown>) || {};
    const anamPayload = (anamnese?.payload as Record<string, unknown>) || {};
    const checkinMetrics = (lastCheckin?.current_metrics as Record<string, unknown>) || {};

    const peso =
      num(checkinMetrics.peso) ?? num(lastMeasure?.weight) ?? num(baseline.peso) ?? num(anamPayload.peso);
    const altura = num(baseline.altura) ?? num(profile?.height) ?? num(anamPayload.altura);
    const bodyFat = num(lastCheckin?.body_fat) ?? num(lastMeasure?.body_fat_percentage) ?? num(anamnese?.body_fat);

    let idade: number | null = null;
    const nasc = (profile?.birth_date as string | undefined) ?? (anamPayload.data_nasc as string | undefined);
    if (nasc) {
      const d = new Date(nasc);
      if (!isNaN(d.getTime())) idade = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
    if (!idade) idade = num(anamPayload.idade);

    const sexo = (profile?.gender as string | undefined) ?? (anamPayload.sexo as string | undefined) ?? null;

    // Só recusamos quando realmente não há NADA para trabalhar.
    const hasAnamnese = !!anamnese;
    const resumo = anamnese?.ai_summary || (hasAnamnese ? summarizePayload(anamPayload) : "");
    if (!hasAnamnese && !peso) {
      return new Response(
        JSON.stringify({ ok: false, reason: "sem_anamnese" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SYSTEM_PROMPT = `Você sugere macros iniciais para o primeiro protocolo de um aluno de fitness, pro coach revisar antes de aplicar.
Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:
{"calories":0,"protein":0,"carbs":0,"fat":0,"water":0,"goal":"hipertrofia","rationale":"...","meals":[{"nome":"Refeição 1","kcal":0,"protein":0,"carbs":0,"fat":0,"sugestao":"..."}],"treino":"..."}
- "goal" deve ser exatamente um destes: "hipertrofia", "emagrecer", "recomposicao", "manter".
- Use peso/altura/idade/sexo/%gordura (quando fornecidos) e o resumo da anamnese para estimar valores plausíveis (ex.: proteína entre 1.6 e 2.2g/kg como referência geral).
- "meals": distribua os macros do dia na QUANTIDADE EXATA de refeições informada em refeicoes_por_dia. A soma das refeições deve bater com os totais do dia (tolerância pequena). Em "sugestao", cite exemplos de alimentos coerentes com as restrições da anamnese, em 1 frase curta.
- "treino": 1-2 frases sobre como distribuir a divisão de treino informada na semana e o foco inicial, coerente com a experiência do aluno.
- "rationale": 1-2 frases curtas explicando o raciocínio, em português.
- NUNCA emita diagnóstico clínico. Se a anamnese mencionar condição de saúde, apenas module o tom (ex.: "considerar restrição X"), nunca prescreva tratamento.
- São só valores de partida — o coach sempre revisa antes de publicar.`;

    const userContent = JSON.stringify({
      peso_kg: peso,
      altura_cm: altura,
      idade,
      sexo,
      percentual_gordura: bodyFat,
      refeicoes_por_dia: mealsCount,
      divisao_treino: split,
      ciclo_de_carboidratos: carbCycle,
      resumoAnamnese: resumo || "sem anamnese detalhada disponível",
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

    const rawMeals = Array.isArray(parsed.meals) ? parsed.meals as Record<string, unknown>[] : [];
    const meals = rawMeals.slice(0, mealsCount).map((m, i) => ({
      nome: typeof m?.nome === "string" && m.nome.trim() ? m.nome.trim() : `Refeição ${i + 1}`,
      kcal: Math.round(clamp(m?.kcal, 0, 3000, 0)),
      protein: Math.round(clamp(m?.protein, 0, 200, 0)),
      carbs: Math.round(clamp(m?.carbs, 0, 300, 0)),
      fat: Math.round(clamp(m?.fat, 0, 120, 0)),
      sugestao: typeof m?.sugestao === "string" ? m.sugestao.trim() : "",
    }));

    const result = {
      ok: true,
      calories: Math.round(clamp(parsed.calories, 1200, 6000, 2200)),
      protein: Math.round(clamp(parsed.protein, proteinMin, proteinMax, peso ? Math.round(peso * 1.8) : 160)),
      carbs: Math.round(clamp(parsed.carbs, 0, 800, 250)),
      fat: Math.round(clamp(parsed.fat, 20, 200, 55)),
      water: clamp(parsed.water, 1, 6, 3),
      goal: GOALS.includes(parsed.goal as typeof GOALS[number]) ? parsed.goal : "manter",
      rationale: typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "Sugestão baseada nos dados da anamnese.",
      treino: typeof parsed.treino === "string" ? parsed.treino.trim() : "",
      meals,
      contexto: {
        peso, altura, idade, sexo, bodyFat,
        fonteAnamnese: hasAnamnese,
        mealsCount, split,
      },
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
