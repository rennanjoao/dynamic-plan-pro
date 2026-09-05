import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const WEEKDAYS_ORDER = [
  { key: "dom", label: "Domingo" }, { key: "seg", label: "Segunda" },
  { key: "ter", label: "Terça" }, { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" }, { key: "sex", label: "Sexta" },
  { key: "sab", label: "Sábado" },
]; // índice = Date.getDay() (0=domingo)

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
    const studentId = user.id; // sempre o próprio usuário — sem parâmetro cruzável.

    // Fuso simples: usa a data local do servidor (UTC). Suficiente pra
    // granularidade de "1x por dia" — não precisa ser exato ao segundo.
    // Fuso do Brasil (UTC-3, sem horário de verão desde 2019) — sem isso, o
    // servidor (UTC) vira "amanhã" 3h antes do fuso do aluno, e o card de
    // "hoje" no navegador dele fica dessincronizado com este recado.
    const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const todayStr = hoje.toISOString().slice(0, 10);

    const { data: cached } = await adminClient
      .from("student_daily_nudge")
      .select("message")
      .eq("student_id", studentId)
      .eq("nudge_date", todayStr)
      .maybeSingle();
    if (cached?.message) {
      return new Response(JSON.stringify({ ok: true, message: cached.message, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: protocolo }, { data: logs }, { data: anamnese }] = await Promise.all([
      adminClient
        .from("protocols")
        .select("payload")
        .eq("student_id", studentId)
        .eq("is_template", false)
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      adminClient
        .from("workout_progress")
        .select("completed_at")
        .eq("user_id", studentId)
        .eq("completed", true)
        .order("completed_at", { ascending: false })
        .limit(14),
      adminClient
        .from("anamnesis")
        .select("ai_summary")
        .eq("student_id", studentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const payload = (protocolo?.payload as Record<string, unknown>) || {};
    const weekDays = (payload.weekDays as Record<string, string>) || {};
    const workouts = (payload.workouts as Array<Record<string, unknown>>) || [];
    const weekdayKey = WEEKDAYS_ORDER[hoje.getUTCDay()].key;
    const treinoHojeKey = weekDays[weekdayKey];
    const planoHoje = !treinoHojeKey || treinoHojeKey === "REST"
      ? { tipo: "descanso" as const }
      : {
          tipo: "treino" as const,
          letra: treinoHojeKey,
          foco: (workouts.find((w) => String(w.key) === treinoHojeKey)?.focus as string) || null,
        };

    const treinouHoje = (logs ?? []).some((l) => l.completed_at?.slice(0, 10) === todayStr);
    const ultimoTreino = logs?.[0]?.completed_at ? String(logs[0].completed_at).slice(0, 10) : null;

    const SYSTEM_PROMPT = `Você escreve um recado curto (1-2 frases, no máximo 240 caracteres), em português,
pra motivar um aluno de fitness quando ele abre o app hoje.
Responda APENAS com o texto do recado, sem aspas, sem markdown, sem preâmbulo.
Regras:
- Use o plano de hoje (treino específico ou descanso) como base do recado.
- Se treinouHoje for true, parabenize objetivamente, não repita instrução de treinar.
- Se for dia de descanso, não sugira treinar — reforce a importância do descanso.
- Tom direto e caloroso, nunca performático ou dramático.
- Nunca dê conselho médico ou diagnóstico.
- Não invente números ou fatos que não estejam no contexto fornecido.`;

    const userContent = JSON.stringify({
      planoHoje,
      treinouHoje,
      ultimoTreinoRegistrado: ultimoTreino,
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
        temperature: 0.6,
        // A frase final é curta (cortada em 300 caracteres). Um teto baixo evita
        // estourar o limite de tokens de saída por minuto do provedor (429).
        max_tokens: 160,
        reasoning_effort: "none",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      console.error("[student-daily-nudge] IA indisponível", aiRes.status, t);
      // Mensagem motivacional é opcional: nunca derruba a tela do aluno.
      return new Response(JSON.stringify({ ok: true, message: null, cached: false, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiRes.json();
    const message = String(aiJson?.choices?.[0]?.message?.content ?? "").trim().slice(0, 300);

    if (message) {
      await adminClient
        .from("student_daily_nudge")
        .upsert({ student_id: studentId, nudge_date: todayStr, message }, { onConflict: "student_id,nudge_date" });
    }

    return new Response(JSON.stringify({ ok: true, message: message || null, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[student-daily-nudge]", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
