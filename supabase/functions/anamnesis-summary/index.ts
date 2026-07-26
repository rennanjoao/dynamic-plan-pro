import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const FREE_TEXT_FIELDS = [
  "objetivos", "profissao", "atividades", "lesoes", "remedios", "drogas",
  "hormonios", "estimulantes", "suplementacao", "recordatorio",
  "disponibilidade_alim", "alergias", "rel_comida", "gastrico",
  "sintomas_noturnos", "obs_neuro", "doencas", "mudancas_neg", "obs_finais",
];

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

    const { anamnesisId } = await req.json();
    if (!anamnesisId) throw new Error("anamnesisId é obrigatório");

    const { data: row, error: rowErr } = await adminClient
      .from("anamnesis")
      .select("id, student_id, payload")
      .eq("id", anamnesisId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new Error("Anamnese não encontrada");

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    let allowed = user.id === row.student_id || !!isAdmin;
    if (!allowed) {
      const { data: link } = await adminClient
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", row.student_id)
        .eq("coach_id", user.id)
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    const payload = (row.payload as Record<string, unknown>) || {};
    const freeText: Record<string, string> = {};
    for (const key of FREE_TEXT_FIELDS) {
      const v = payload[key];
      if (typeof v === "string" && v.trim()) freeText[key] = v.trim();
    }

    const SYSTEM_PROMPT = `Você resume a anamnese de um aluno novo para o coach dele.
Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:
{"summary": "5 a 8 linhas em português", "flags": {"lesoes": boolean, "doencas": boolean, "substancias": boolean, "detalhes": "texto curto opcional"}}
- "summary": resumo objetivo dos campos de texto livre abaixo (rotina, objetivos, alimentação, histórico).
- "flags": marque true apenas quando o texto do aluno mencionar explicitamente lesão/dor articular, doença/condição médica diagnosticada, ou uso de substâncias (remédios controlados, hormônios, drogas, estimulantes). Nunca marque true por suposição.
- "detalhes": SE algum flag for true, cite em poucas palavras o que foi mencionado, para o coach revisar com atenção — nunca é uma decisão clínica, só um sinalizador para revisão humana.
Nunca invente informação que não esteja no texto do aluno.`;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(freeText) },
        ],
        stream: false,
        temperature: 0.2,
        reasoning_format: "hidden",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { summary?: string; flags?: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      console.error("[anamnesis-summary] resposta não-JSON do modelo:", raw);
      parsed = { summary: "", flags: {} };
    }

    const { error: updErr } = await adminClient
      .from("anamnesis")
      .update({ ai_summary: parsed.summary ?? "", ai_flags: parsed.flags ?? {} })
      .eq("id", anamnesisId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[anamnesis-summary]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
