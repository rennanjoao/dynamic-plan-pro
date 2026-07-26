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
      .select("id, student_id, coach_id, current_metrics, payload, submitted_at")
      .eq("id", checkInId)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current) throw new Error("Check-in não encontrado");

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    let allowed = !!isAdmin || current.coach_id === user.id;
    if (!allowed) {
      const { data: link } = await adminClient
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", current.student_id)
        .eq("coach_id", user.id)
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    const [{ data: insightRow }, { data: pastFeedbacks }, { data: anamneseRow }, { data: photoRow }] = await Promise.all([
      adminClient
        .from("checkin_ai_insights")
        .select("summary")
        .eq("check_in_id", checkInId)
        .maybeSingle(),
      adminClient
        .from("check_ins")
        .select("coach_feedback, submitted_at")
        .eq("coach_id", user.id)
        .not("coach_feedback", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(3),
      adminClient
        .from("anamnesis")
        .select("ai_summary")
        .eq("student_id", current.student_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("checkin_photo_analysis")
        .select("tags, reliability")
        .eq("check_in_id", checkInId)
        .maybeSingle(),
    ]);

    const SYSTEM_PROMPT = `Você escreve, em português, um rascunho de feedback de check-in de um coach para o próprio aluno.
Regras:
- Texto corrido, tom humano e direto, como o coach normalmente escreve (veja exemplos de feedbacks anteriores dele, se houver).
- Baseie-se apenas nos dados fornecidos (dados do check-in atual, resumo "o que mudou", contexto da anamnese e análise visual, quando houver).
- Se "analiseVisual" for fornecida, mencione no máximo 1 ponto dela, só se for relevante ao momento do aluno — nunca liste todos os campos.
- Não invente números ou fatos que não estejam no contexto.
- Responda APENAS com o texto do feedback, sem aspas, sem markdown, sem preâmbulo.`;

    const userContent = JSON.stringify({
      checkInAtual: { metrics: current.current_metrics, payload: current.payload, data: current.submitted_at },
      resumoIA: insightRow?.summary ?? null,
      contextoAnamnese: anamneseRow?.ai_summary ?? null,
      analiseVisual: photoRow ? { tags: photoRow.tags, reliability: photoRow.reliability } : null,
      exemplosDeFeedbacksAnterioresDoCoach: (pastFeedbacks ?? []).map((f) => f.coach_feedback),
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
        temperature: 0.6,
        reasoning_format: "hidden",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const draft = (aiJson.choices?.[0]?.message?.content ?? "").trim();

    const { error: updErr } = await adminClient
      .from("check_ins")
      .update({ ai_feedback_draft: draft })
      .eq("id", checkInId);
    if (updErr) console.error("[checkin-feedback-draft] falha ao persistir draft:", updErr.message);

    return new Response(JSON.stringify({ ok: true, draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[checkin-feedback-draft]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
