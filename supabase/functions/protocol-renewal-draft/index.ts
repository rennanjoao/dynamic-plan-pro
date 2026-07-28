import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const TREINO_CAMPOS = ["sets", "reps", "cadence", "rest"] as const;
const DIETA_CAMPOS = ["calories", "protein", "carbs", "fat", "water"] as const;
const DIRETRIZES_CAMPOS = ["training", "diet", "weekOrganization", "supplementation"] as const;
const MAX_SUGESTOES = 10;

function clampNum(n: unknown, min: number, max: number): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!isFinite(v)) return null;
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

    const { studentId, protocolId } = await req.json();
    if (!studentId || !protocolId) throw new Error("studentId e protocolId são obrigatórios");

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

    const [{ data: protocolo }, { data: checkins }, { data: anamnese }] = await Promise.all([
      adminClient.from("protocols").select("payload, name").eq("id", protocolId).maybeSingle(),
      adminClient
        .from("check_ins")
        .select("current_metrics, submitted_at")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(4),
      adminClient
        .from("anamnesis")
        .select("ai_summary")
        .eq("student_id", studentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!protocolo) throw new Error("Protocolo não encontrado");

    const payload = (protocolo.payload as Record<string, unknown>) || {};
    const workouts = (payload.workouts as Array<Record<string, unknown>>) || [];
    const exerciciosDisponiveis: string[] = [];
    const resumoTreino = workouts.map((w) => ({
      dia: w.key,
      foco: w.focus,
      exercicios: ((w.exercises as Array<Record<string, unknown>>) || []).map((e) => {
        const id = String(e.__id ?? "");
        if (id) exerciciosDisponiveis.push(id);
        return { id, nome: e.name, sets: e.sets, reps: e.reps, cadence: e.cadence, rest: e.rest };
      }),
    }));

    const SYSTEM_PROMPT = `Você ajuda um coach de fitness a planejar a renovação de ciclo de um aluno que já treina com ele.
Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:
{
  "resumo": "texto corrido curto (4-8 frases), visão geral do ciclo",
  "sugestoes": [
    {
      "categoria": "treino" | "dieta" | "diretrizes",
      "exercicioId": "(obrigatório só se categoria=treino — use exatamente um dos ids fornecidos em treinoAtual)",
      "campo": "(treino: sets|reps|cadence|rest — dieta: calories|protein|carbs|fat|water — diretrizes: training|diet|weekOrganization|supplementation)",
      "alvo": "nome curto e humano do que está sendo sugerido (ex: 'Cadeira Flexora — dia A', 'Água diária', 'Diretrizes de treino')",
      "valorAtual": "valor atual, se aplicável",
      "valorSugerido": "novo valor sugerido (número como string pra treino/dieta; texto completo revisado pra diretrizes)",
      "motivo": "1 frase curta do porquê"
    }
  ]
}
Regras:
- Máximo ${MAX_SUGESTOES} sugestões no total, só as mais relevantes.
- categoria "treino": exercicioId TEM que ser um dos ids em treinoAtual — nunca invente id.
- Baseie-se só nos dados fornecidos. Não invente números que não estejam no contexto.
- Nunca emita diagnóstico clínico.
- Isto é rascunho — o coach decide o que aceitar, então pode sugerir mesmo sem certeza absoluta, mas com "motivo" honesto.`;

    const userContent = JSON.stringify({
      macrosAtuais: payload.macros ?? null,
      diretrizesAtuais: payload.guidelines ?? null,
      treinoAtual: resumoTreino,
      ultimosCheckins: (checkins ?? []).map((c) => ({ metrics: c.current_metrics, data: c.submitted_at })),
      resumoAnamnese: anamnese?.ai_summary ?? null,
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
        temperature: 0.5,
        reasoning_effort: "none",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";

    let parsed: { resumo?: string; sugestoes?: unknown[] } = {};
    try {
      parsed = JSON.parse(String(raw).replace(/```json|```/g, "").trim());
    } catch {
      parsed = {};
    }

    const idsValidos = new Set(exerciciosDisponiveis);
    const sugestoesValidadas: Array<Record<string, unknown>> = [];
    for (const item of (parsed.sugestoes ?? [])) {
      const s = item as Record<string, unknown>;
      const categoria = s.categoria;
      if (sugestoesValidadas.length >= MAX_SUGESTOES) break;

      if (categoria === "treino") {
        const exercicioId = String(s.exercicioId ?? "");
        const campo = String(s.campo ?? "");
        if (!idsValidos.has(exercicioId) || !TREINO_CAMPOS.includes(campo as typeof TREINO_CAMPOS[number])) continue;
        sugestoesValidadas.push({
          id: crypto.randomUUID(), categoria, exercicioId, campo,
          alvo: String(s.alvo ?? "Exercício"), valorAtual: s.valorAtual != null ? String(s.valorAtual) : "",
          valorSugerido: String(s.valorSugerido ?? ""), motivo: String(s.motivo ?? ""),
        });
      } else if (categoria === "dieta") {
        const campo = String(s.campo ?? "");
        if (!DIETA_CAMPOS.includes(campo as typeof DIETA_CAMPOS[number])) continue;
        const clamped = clampNum(s.valorSugerido, campo === "calories" ? 1200 : 0, campo === "calories" ? 6000 : campo === "water" ? 6 : 800);
        if (clamped === null) continue;
        sugestoesValidadas.push({
          id: crypto.randomUUID(), categoria, campo,
          alvo: String(s.alvo ?? campo), valorAtual: s.valorAtual != null ? String(s.valorAtual) : "",
          valorSugerido: String(clamped), motivo: String(s.motivo ?? ""),
        });
      } else if (categoria === "diretrizes") {
        const campo = String(s.campo ?? "");
        if (!DIRETRIZES_CAMPOS.includes(campo as typeof DIRETRIZES_CAMPOS[number])) continue;
        const valorSugerido = String(s.valorSugerido ?? "").trim();
        if (!valorSugerido) continue;
        sugestoesValidadas.push({
          id: crypto.randomUUID(), categoria, campo,
          alvo: String(s.alvo ?? campo), valorAtual: "", valorSugerido, motivo: String(s.motivo ?? ""),
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      resumo: typeof parsed.resumo === "string" ? parsed.resumo.trim() : "",
      sugestoes: sugestoesValidadas,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[protocol-renewal-draft]", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});