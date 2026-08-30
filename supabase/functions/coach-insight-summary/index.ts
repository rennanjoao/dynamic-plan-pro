// coach-insight-summary
// Sintetiza, em texto, os coach_fatigue_alerts em aberto + o checkin_ai_insights
// mais recente de um aluno numa leitura única para o coach ("Coach Insights").
//
// IMPORTANTE — o que esta function NÃO faz:
//  - Não recalcula volume, RIR, adesão ou qualquer métrica bruta. Tudo isso já
//    foi decidido pelo workout-alert-engine (grava coach_fatigue_alerts) e pelo
//    checkin-insight (grava checkin_ai_insights). Esta function só lê os dois.
//  - Não deixa a IA decidir a situação (🟢/🟡/🔴/❓) nem a confiança. As duas
//    são calculadas em código, a partir da severidade dos alertas já gravados,
//    ANTES de qualquer chamada ao modelo. O modelo só narra os fatos que
//    recebe — nunca vê métricas brutas, então não tem como ancorar a leitura
//    em um único número.
//
// Body: { studentId: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Situacao = "boa" | "atencao" | "risco" | "dados_insuficientes";
type Confianca = "alta" | "media" | "baixa";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const studentId = (body?.studentId as string) || user.id;

    // Autorização: o próprio aluno, o coach vinculado ou admin (mesmo padrão
    // do workout-alert-engine).
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: link } = await admin
      .from("coach_students")
      .select("coach_id")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();
    const coachId = link?.coach_id as string | undefined;
    const allowed = user.id === studentId || !!isAdmin || (!!coachId && coachId === user.id);
    if (!allowed) throw new Error("Acesso negado");
    if (!coachId) {
      return new Response(JSON.stringify({ ok: true, skipped: "sem_coach" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. Fontes determinísticas já existentes — nada é recalculado aqui ────
    const { data: alerts, error: alertsErr } = await admin
      .from("coach_fatigue_alerts")
      .select("id, alert_type, severity, message, suggestion, created_at")
      .eq("coach_id", coachId)
      .eq("student_id", studentId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (alertsErr) throw alertsErr;
    const openAlerts = alerts ?? [];

    const { data: lastCheckin } = await admin
      .from("check_ins")
      .select("id, submitted_at")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let checkinInsight: { summary: { changes?: string[]; hypotheses?: string[]; alerts?: string[] }; generated_at: string } | null = null;
    if (lastCheckin) {
      const { data: ci } = await admin
        .from("checkin_ai_insights")
        .select("summary, generated_at")
        .eq("check_in_id", lastCheckin.id)
        .maybeSingle();
      checkinInsight = ci ?? null;
    }

    // Anamnese — usada para acender o radar já no 1º envio do aluno, antes de
    // existir qualquer check-in ou alerta de treino.
    const { data: anamnesis } = await admin
      .from("anamnesis")
      .select("payload, submitted_at, updated_at")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const anamnesisAt = anamnesis?.submitted_at ?? anamnesis?.updated_at ?? null;


    // ── 2. Situação e confiança — decididas em código, nunca pela IA ─────────
    const hasCritical = openAlerts.some((a) => a.severity === "critical");
    const hasWarning = openAlerts.some((a) => a.severity === "warning");
    const hasInsufficient = openAlerts.some((a) => a.alert_type === "insufficient_data");

    let situacao: Situacao;
    if (hasInsufficient && !hasCritical) situacao = "dados_insuficientes";
    else if (hasCritical) situacao = "risco";
    else if (hasWarning) situacao = "atencao";
    else situacao = "boa";

    let confianca: Confianca;
    if (hasInsufficient) confianca = "baixa";
    else if (openAlerts.length === 0) confianca = "media"; // sem alertas em aberto, mas sem confirmação positiva de amostra suficiente
    else confianca = "alta";

    // ── 3. Checagem de staleness — evita chamar a IA se nada mudou ───────────
    const fontes = {
      alertIds: openAlerts.map((a) => a.id).sort(),
      checkinInsightAt: checkinInsight?.generated_at ?? null,
      anamnesisAt,
    };
    const { data: existing } = await admin
      .from("coach_insights")
      .select("fontes")
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing && JSON.stringify(existing.fontes) === JSON.stringify(fontes)) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_up_to_date" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3.5. Aluno novo: sem alertas e sem check-in, mas COM anamnese ────────
    // A IA lê a anamnese e devolve só os SINAIS (com severidade). A cor
    // continua sendo decidida em código, a partir da pior severidade.
    if (openAlerts.length === 0 && !checkinInsight && anamnesis?.payload) {
      const ANAMNESE_PROMPT = `Você triaga a anamnese inicial de um aluno para um coach de fitness.
Leia os dados e liste APENAS sinais que merecem atenção do coach (lesões, dores, doenças, medicamentos/hormônios, distúrbios do sono, questões gastrointestinais, transtorno alimentar, restrições severas, cargas de trabalho extremas, sintomas clínicos).
Não invente nada que não esteja nos dados. Se estiver tudo dentro do esperado, devolva a lista vazia.
Responda SOMENTE com JSON válido, sem markdown:
{"resumo":"...","sinais":[{"texto":"...","severidade":"atencao"|"risco"}],"interpretacao":"...","sugestao":"..."}
- "resumo": uma frase (máx. ~140 caracteres) sobre o estado inicial do aluno.
- "severidade": "risco" só para sinais clínicos que pedem cautela imediata; o resto é "atencao".
- "sugestao": em tom de sugestão ("vale avaliar", "considerar"), nunca ordem. Use "" se não houver.`;

      const anaRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",
          messages: [
            { role: "system", content: ANAMNESE_PROMPT },
            { role: "user", content: JSON.stringify(anamnesis.payload).slice(0, 12000) },
          ],
          stream: false,
          temperature: 0.2,
          reasoning_effort: "none",
        }),
      });
      let ana: { resumo?: string; sinais?: { texto?: string; severidade?: string }[]; interpretacao?: string; sugestao?: string } = {};
      if (anaRes.ok) {
        const j = await anaRes.json();
        try {
          ana = JSON.parse((j.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim());
        } catch {
          console.error("[coach-insight-summary] anamnese: resposta não-JSON");
        }
      } else {
        console.error("[coach-insight-summary] anamnese: groq", anaRes.status);
      }

      const sinais = (ana.sinais ?? []).filter((s) => s && typeof s.texto === "string" && s.texto.trim());
      const anaSituacao: Situacao = sinais.some((s) => s.severidade === "risco")
        ? "risco"
        : sinais.length > 0
        ? "atencao"
        : "boa";

      const { error: anaUpsertErr } = await admin.from("coach_insights").upsert(
        {
          coach_id: coachId,
          student_id: studentId,
          situacao: anaSituacao,
          confianca: "baixa", // só anamnese, sem histórico de acompanhamento ainda
          resumo:
            ana.resumo ||
            (sinais.length === 0
              ? "Anamnese inicial sem pontos de atenção relevantes."
              : "Anamnese inicial com pontos de atenção."),
          observacoes: sinais.map((s) => s.texto!.trim()),
          interpretacao: ana.interpretacao ?? "",
          sugestao: ana.sugestao || null,
          fontes,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" }
      );
      if (anaUpsertErr) throw anaUpsertErr;
      return new Response(JSON.stringify({ ok: true, situacao: anaSituacao, fonte: "anamnese" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Caso trivial: nada em aberto, nenhum check-in e nenhuma anamnese ──
    if (openAlerts.length === 0 && !checkinInsight) {

      const { error: upsertErr } = await admin.from("coach_insights").upsert(
        {
          coach_id: coachId,
          student_id: studentId,
          situacao,
          confianca,
          resumo: "Sem alertas em aberto e sem check-in recente para analisar.",
          observacoes: [],
          interpretacao: "",
          sugestao: null,
          fontes,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" }
      );
      if (upsertErr) throw upsertErr;
      return new Response(JSON.stringify({ ok: true, situacao }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. IA só narra os fatos acima — nunca decide cor, nunca inventa dado ─
    const SYSTEM_PROMPT = `Você ajuda um coach de fitness a interpretar rapidamente a situação de um aluno.
Você recebe SOMENTE alertas já calculados por um motor determinístico e um resumo de check-in já gerado — nunca métricas brutas. Não invente nenhum dado, número ou fato que não esteja no conteúdo recebido.
Responda SOMENTE com um JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{"resumo": "...", "observacoes": ["...", "..."], "interpretacao": "...", "sugestao": "..."}
- "resumo": uma frase (máx. ~140 caracteres) que sintetiza a situação geral, para uma lista de alunos.
- "observacoes": até 5 pontos objetivos, combinando o que os alertas e o check-in mostram — não repita o texto dos alertas literalmente, sintetize.
- "interpretacao": um parágrafo curto explicando por que isso importa, como um treinador experiente explicaria.
- "sugestao": uma sugestão de próximo passo em tom de sugestão, nunca de ordem ("considerar", "vale avaliar" — nunca "aumente" ou "faça"). Use string vazia "" se não houver nada a sugerir além de continuar observando.
Nunca gere uma nota, score ou porcentagem. A decisão final é sempre do coach.`;

    const userContent = JSON.stringify({
      situacaoJaCalculada: situacao,
      alertasEmAberto: openAlerts.map((a) => ({
        tipo: a.alert_type,
        severidade: a.severity,
        mensagem: a.message,
        sugestaoDoAlerta: a.suggestion,
      })),
      ultimoCheckin: checkinInsight
        ? {
            mudancas: checkinInsight.summary?.changes ?? [],
            hipoteses: checkinInsight.summary?.hypotheses ?? [],
            pontosDeAtencao: checkinInsight.summary?.alerts ?? [],
          }
        : null,
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
    let parsed: { resumo?: string; observacoes?: string[]; interpretacao?: string; sugestao?: string };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      console.error("[coach-insight-summary] resposta não-JSON do modelo:", raw);
      parsed = { resumo: "", observacoes: [], interpretacao: "", sugestao: "" };
    }

    const { error: upsertErr } = await admin.from("coach_insights").upsert(
      {
        coach_id: coachId,
        student_id: studentId,
        situacao,
        confianca,
        resumo: parsed.resumo ?? "",
        observacoes: parsed.observacoes ?? [],
        interpretacao: parsed.interpretacao ?? "",
        sugestao: parsed.sugestao || null,
        fontes,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" }
    );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true, situacao }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[coach-insight-summary]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
