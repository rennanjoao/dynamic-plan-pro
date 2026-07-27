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
    const resumoTreino = workouts.map((w) => ({
      dia: w.key,
      foco: w.focus,
      exercicios: ((w.exercises as Array<Record<string, unknown>>) || []).map((e) => e.name),
    }));

    const SYSTEM_PROMPT = `Você é um assistente que ajuda um coach de fitness a planejar a renovação de ciclo de um aluno que já treina com ele.
Escreva, em português, um texto corrido curto (4-8 frases) com sugestões objetivas para o próximo ciclo — não é uma decisão automática, é rascunho pro coach revisar e decidir o que aplicar manualmente no editor.
Baseie-se só nos dados fornecidos (macros atuais, estrutura de treino atual, últimos check-ins, resumo da anamnese).
Pode sugerir, por exemplo: ajuste de carga/volume em exercícios específicos dado o histórico, ajuste de macros dado a tendência de peso/medidas, ou manter o que está funcionando.
Não invente números que não estejam nos dados. Não emita diagnóstico clínico.
Responda APENAS com o texto, sem markdown, sem preâmbulo, sem aspas.`;

    const userContent = JSON.stringify({
      macrosAtuais: payload.macros ?? null,
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
        reasoning_format: "hidden",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const text = (aiJson?.choices?.[0]?.message?.content ?? "").trim();

    return new Response(JSON.stringify({ ok: true, text }), {
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