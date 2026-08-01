import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const TREINO_CAMPOS = ["sets", "reps", "cadence", "rest"] as const;
const DIETA_CAMPOS = ["calories", "protein", "carbs", "fat", "water"] as const;
const DIRETRIZES_CAMPOS = ["training", "diet", "weekOrganization", "supplementation"] as const;
const REFEICAO_CAMPOS = ["trocar_alimento", "quantidade", "redistribuir_macro", "horario"] as const;
const ACOES = [
  "nenhuma_alteracao", "orientar_coach", "investigar_antes", "recomendar_exame",
  "reduzir_carga_treino", "acompanhar_mais_um_ciclo", "ajustar",
] as const;
const MAX_SUGESTOES = 10;

// Mesma normalização de identidade de src/lib/protocolChangeDetector.ts
const sTrim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nameKey = (v: unknown): string => sTrim(v).toLowerCase();
const mealOptionKey = (o: Record<string, unknown>): string => `${o?.kind ?? ""}::${sTrim(o?.title)}`;

const ESTRATEGIA_KEYWORDS = ["jejum", "cetog", "low carb", "flexível", "flexivel", "equivalente"];

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

    const { checkInId } = await req.json();
    if (!checkInId) throw new Error("checkInId é obrigatório");

    const { data: checkIn } = await adminClient
      .from("check_ins")
      .select("id, student_id, payload, current_metrics, submitted_at, updated_at")
      .eq("id", checkInId)
      .maybeSingle();
    if (!checkIn) throw new Error("Check-in não encontrado");
    const studentId = checkIn.student_id as string;

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

    // Idempotência — não chama a IA de novo se o rascunho já é mais novo que o check-in.
    const { data: existente } = await adminClient
      .from("checkin_ai_adjustment_draft")
      .select("action, action_rationale, estrategia_identificada, resumo, sugestoes, generated_at")
      .eq("check_in_id", checkInId)
      .maybeSingle();
    if (existente && new Date(existente.generated_at) >= new Date(checkIn.updated_at ?? checkIn.submitted_at)) {
      return new Response(JSON.stringify({
        ok: true,
        cached: true,
        acao: existente.action,
        motivo_acao: existente.action_rationale ?? "",
        estrategia_identificada: existente.estrategia_identificada ?? "",
        resumo: existente.resumo ?? "",
        sugestoes: existente.sugestoes ?? [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: protocolo }, { data: checkins }, { data: anamnese }, { data: insight }, { data: fotoAnalise }, { data: mealCheckins }] = await Promise.all([
      adminClient
        .from("protocols")
        .select("id, payload, name, coach_id")
        .eq("student_id", studentId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
      adminClient.from("checkin_ai_insights").select("summary").eq("check_in_id", checkInId).maybeSingle(),
      adminClient.from("checkin_photo_analysis").select("tags").eq("check_in_id", checkInId).maybeSingle(),
      adminClient
        .from("meal_checkins")
        .select("meal_index, checked, date")
        .eq("student_id", studentId)
        .gte("date", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)),
    ]);
    if (!protocolo) throw new Error("Protocolo ativo não encontrado");
    const protocolId = protocolo.id as string;

    const payload = (protocolo.payload as Record<string, unknown>) || {};
    const coachIdDoProtocolo = String((protocolo as Record<string, unknown>).coach_id ?? user.id);
    const workouts = (payload.workouts as Array<Record<string, unknown>>) || [];
    const weekDays = (payload.weekDays as Record<string, string>) || {};
    const WEEKDAYS_ORDER = [
      { key: "seg", label: "Segunda" }, { key: "ter", label: "Terça" },
      { key: "qua", label: "Quarta" }, { key: "qui", label: "Quinta" },
      { key: "sex", label: "Sexta" }, { key: "sab", label: "Sábado" },
      { key: "dom", label: "Domingo" },
    ];
    // Visão real da semana — qual dia é qual treino, e qual dia é descanso
    // de verdade (nunca inferir isso pela letra do treino).
    const diasDaSemana = WEEKDAYS_ORDER.map(({ key, label }) => {
      const v = weekDays[key];
      return { dia: label, atividade: !v || v === "REST" ? "Descanso" : `Treino ${v}` };
    });
    const diaDaSemanaPorTreino: Record<string, string[]> = {};
    for (const { key, label } of WEEKDAYS_ORDER) {
      const v = weekDays[key];
      if (v && v !== "REST") (diaDaSemanaPorTreino[v] ??= []).push(label);
    }

    function normalizeNome(n: string): string {
      return (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    }

    const exerciciosDisponiveis: string[] = [];
    const nomesExercicios = new Set<string>();
    for (const w of workouts) {
      for (const e of ((w.exercises as Array<Record<string, unknown>>) || [])) {
        const nome = String(e.name ?? "").trim();
        if (nome) nomesExercicios.add(normalizeNome(nome));
      }
    }

    // DNA do coach (Passo 8) — padrão histórico dele pra cada exercício que
    // aparece neste protocolo, só como calibração de estilo, não como regra.
    let dnaDoCoach: Array<{ exercicio: string; sets: string | null; reps: string | null; cadence: string | null; rest: string | null; amostras: number }> = [];
    if (nomesExercicios.size > 0) {
      const { data: perfil } = await adminClient
        .from("coach_ai_profile")
        .select("exercise_key, display_name, sets, reps, cadence, rest, sample_count")
        .eq("coach_id", coachIdDoProtocolo);
      dnaDoCoach = (perfil ?? [])
        .filter((p) => nomesExercicios.has(p.exercise_key))
        .map((p) => ({
          exercicio: p.display_name, sets: p.sets, reps: p.reps, cadence: p.cadence, rest: p.rest,
          amostras: p.sample_count,
        }));
    }

    const resumoTreino = workouts.map((w) => ({
      dia: w.key,
      diaDaSemana: diaDaSemanaPorTreino[String(w.key)]?.join(", ") || "não atribuído a nenhum dia",
      foco: w.focus,
      exercicios: ((w.exercises as Array<Record<string, unknown>>) || []).map((e) => {
        const id = String(e.__id ?? "");
        if (id) exerciciosDisponiveis.push(id);
        return { id, nome: e.name, sets: e.sets, reps: e.reps, cadence: e.cadence, rest: e.rest };
      }),
    }));

    // Refeições do protocolo ativo + adesão real por refeição (14 dias).
    const meals = (payload.meals as Array<Record<string, unknown>>) || [];
    const adesaoPorIndice: Record<number, { marcadas: number; total: number }> = {};
    for (const mc of (mealCheckins ?? [])) {
      const i = Number(mc.meal_index);
      (adesaoPorIndice[i] ??= { marcadas: 0, total: 0 });
      adesaoPorIndice[i].total++;
      if (mc.checked) adesaoPorIndice[i].marcadas++;
    }
    const opcoesValidas = new Map<string, { refeicaoIndex: number; optionKey: string }>();
    const itensValidos = new Set<string>();
    const dietaAtual = meals.map((m, i) => {
      const ad = adesaoPorIndice[i];
      const opts = ((m.options as Array<Record<string, unknown>>) || []).map((o) => {
        const key = mealOptionKey(o);
        opcoesValidas.set(`${i}|${key}`, { refeicaoIndex: i, optionKey: key });
        const itens = ((o.items as Array<Record<string, unknown>>) || []).map((it, itemIndex) => {
          const itemRef = `${i}|${key}|${itemIndex}`;
          const opcional = !!it.optional;
          // Só itens não-opcionais entram como alvo válido de ajuste de quantidade —
          // opcional não conta pra meta, não faz sentido a IA "ajustar" ele.
          if (!opcional && String(it.name ?? it.baseName ?? "").trim()) itensValidos.add(itemRef);
          return {
            itemRef,
            alimento: String(it.name ?? it.baseName ?? ""),
            quantidade: String(it.weight ?? ""),
            opcional,
          };
        });
        return { optionKey: key, titulo: o.title ?? "", itens };
      });
      return {
        refeicaoIndex: i,
        nome: m.name ?? m.label ?? `Refeição ${i + 1}`,
        horario: m.time ?? null,
        adesao14d: ad ? `${Math.round((ad.marcadas / Math.max(1, ad.total)) * 100)}% (${ad.marcadas}/${ad.total})` : "sem registro",
        opcoes: opts,
      };
    });

    // Estratégia alimentar declarada nas diretrizes (respeitar, nunca contrariar).
    const guidelinesTxt = Object.values((payload.guidelines as Record<string, string>) ?? {})
      .filter((v) => typeof v === "string").join(" \n").toLowerCase();
    const estrategiaDetectada = ESTRATEGIA_KEYWORDS.filter((k) => guidelinesTxt.includes(k));

    const SYSTEM_PROMPT = `Você faz a TRIAGEM do check-in de um aluno e, só quando fizer sentido, propõe ajustes cirúrgicos no protocolo dele.
Responda SOMENTE com um JSON válido, sem markdown, exatamente neste formato:
{
  "acao": "nenhuma_alteracao" | "orientar_coach" | "investigar_antes" | "recomendar_exame" | "reduzir_carga_treino" | "acompanhar_mais_um_ciclo" | "ajustar",
  "motivo_acao": "1-2 frases explicando a triagem",
  "estrategia_identificada": "estratégia alimentar/treino que o coach já usa e que você respeitou (ou vazio)",
  "resumo": "texto corrido curto (4-8 frases), visão geral do ciclo",
  "sugestoes": [
    {
      "categoria": "treino" | "dieta" | "refeicao" | "diretrizes",
      "exercicioId": "(obrigatório só se categoria=treino — use exatamente um dos ids fornecidos em treinoAtual)",
      "refeicaoIndex": 0,
      "optionKey": "(obrigatório só se categoria=refeicao — use exatamente um optionKey de dietaAtual)",
      "itemRef": "(obrigatório só se categoria=refeicao E campo=quantidade — use exatamente um itemRef de dietaAtual, do item não-opcional que você decidiu ajustar)",
      "campo": "(treino: sets|reps|cadence|rest — dieta: calories|protein|carbs|fat|water — refeicao: trocar_alimento|quantidade|redistribuir_macro|horario — diretrizes: training|diet|weekOrganization|supplementation)",
      "alvo": "nome curto e humano do que está sendo sugerido (ex: 'Cadeira Flexora — dia A', 'Água diária', 'Diretrizes de treino')",
      "valorAtual": "valor atual, se aplicável",
      "valorSugerido": "novo valor sugerido (número como string pra treino/dieta; texto completo revisado pra diretrizes)",
      "motivo": "1 frase curta do porquê"
    }
  ]
}
Regras:
- Comece pela triagem. Se o check-in não justifica mexer no protocolo, use
  "acao": "nenhuma_alteracao" (ou "acompanhar_mais_um_ciclo") e devolva
  "sugestoes": []. Não invente ajuste só pra ter o que dizer.
- Sinais clínicos (dor, sono péssimo, exaustão, sintomas) → "investigar_antes",
  "recomendar_exame" ou "reduzir_carga_treino", com sugestoes vazias ou mínimas.
- Máximo ${MAX_SUGESTOES} sugestões no total, só as mais relevantes.
- categoria "treino": exercicioId TEM que ser um dos ids em treinoAtual — nunca invente id.
- categoria "refeicao": refeicaoIndex e optionKey TÊM que existir em dietaAtual — nunca invente.
  Prefira ajustes cirúrgicos em refeições com adesão baixa, no lugar de mexer nos macros globais.
- Quando decidir que o ciclo precisa de mais ou menos kcal/proteína/carboidrato/gordura e
  isso puder ser resolvido mudando a quantidade de UM item que já existe em dietaAtual,
  use categoria "refeicao", campo "quantidade", e é OBRIGATÓRIO incluir "itemRef" apontando
  pro item exato (nunca um item com opcional=true) — "valorSugerido" nesse caso é só o novo
  peso (ex: "180g"), nunca uma frase. Prefira isso a mudar a meta em macrosAtuais (categoria
  "dieta") sempre que der pra resolver em itens reais — a meta some se o coach só ajustar a
  meta, mas o ajuste no item já fica pronto pro coach só aprovar.
- campo "trocar_alimento" e "redistribuir_macro" não têm um valor numérico único (é troca de
  alimento ou reorganização) — nesses dois, itemRef é opcional e valorSugerido pode ser uma
  frase curta e objetiva.
- estrategiaDoCoach lista a estratégia alimentar que ele já usa (ex: jejum,
  low carb). NUNCA proponha algo que contrarie essa estratégia; se propuser
  algo próximo do limite, explique no "motivo".
- diasDaSemana mostra a semana real: qual dia é qual treino, e qual dia é
  "Descanso". Cada treino em treinoAtual já vem com diaDaSemana preenchido.
  NUNCA presuma que a letra do treino (A/B/C/D) indica um dia da semana ou
  que um treino é descanso — só confie no que diasDaSemana e diaDaSemana dizem.
- dnaDoCoach mostra o padrão histórico desse coach pra cada exercício, vindo
  de outros protocolos que ele já escreveu. Use como referência de estilo
  dele, não como regra fixa — se sugerir algo bem diferente do padrão dele,
  diga o motivo específico no campo "motivo" (ex: progressão pontual, não
  estilo geral).
- Baseie-se só nos dados fornecidos. Não invente números que não estejam no contexto.
- Nunca emita diagnóstico clínico.
- Isto é rascunho — o coach decide o que aceitar, então pode sugerir mesmo sem certeza absoluta, mas com "motivo" honesto.`;

    const userContent = JSON.stringify({
      macrosAtuais: payload.macros ?? null,
      diretrizesAtuais: payload.guidelines ?? null,
      estrategiaDoCoach: estrategiaDetectada,
      diasDaSemana,
      notasDescanso: payload.restNotes || null,
      treinoAtual: resumoTreino,
      dietaAtual,
      dnaDoCoach,
      checkInAtual: { respostas: checkIn.payload ?? null, metricas: checkIn.current_metrics ?? null, data: checkIn.submitted_at },
      insightDoCheckIn: insight?.summary ?? null,
      analiseDeFotos: fotoAnalise?.tags ?? null,
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

    let parsed: { acao?: string; motivo_acao?: string; estrategia_identificada?: string; resumo?: string; sugestoes?: unknown[] } = {};
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
      } else if (categoria === "refeicao") {
        const campo = String(s.campo ?? "");
        if (!REFEICAO_CAMPOS.includes(campo as typeof REFEICAO_CAMPOS[number])) continue;
        const refeicaoIndex = Number(s.refeicaoIndex);
        const optionKey = String(s.optionKey ?? "");
        if (!opcoesValidas.has(`${refeicaoIndex}|${optionKey}`)) continue;
        const valorSugerido = String(s.valorSugerido ?? "").trim();
        if (!valorSugerido) continue;
        if (campo === "quantidade") {
          const itemRef = String(s.itemRef ?? "");
          if (!itensValidos.has(itemRef)) continue;
          sugestoesValidadas.push({
            id: crypto.randomUUID(), categoria, campo, refeicaoIndex, optionKey, itemRef,
            alvo: String(s.alvo ?? "Alimento"), valorAtual: s.valorAtual != null ? String(s.valorAtual) : "",
            valorSugerido, motivo: String(s.motivo ?? ""),
          });
        } else {
          sugestoesValidadas.push({
            id: crypto.randomUUID(), categoria, campo, refeicaoIndex, optionKey,
            alvo: String(s.alvo ?? "Refeição"), valorAtual: s.valorAtual != null ? String(s.valorAtual) : "",
            valorSugerido, motivo: String(s.motivo ?? ""),
          });
        }
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

    const acaoBruta = String(parsed.acao ?? "");
    let acao = ACOES.includes(acaoBruta as typeof ACOES[number]) ? acaoBruta : "ajustar";
    // Coerência: sem sugestões válidas, nunca reportar "ajustar".
    if (acao === "ajustar" && sugestoesValidadas.length === 0) acao = "nenhuma_alteracao";

    const resultado = {
      acao,
      motivo_acao: String(parsed.motivo_acao ?? "").trim(),
      estrategia_identificada: String(parsed.estrategia_identificada ?? estrategiaDetectada.join(", ")).trim(),
      resumo: typeof parsed.resumo === "string" ? parsed.resumo.trim() : "",
      sugestoes: sugestoesValidadas,
    };

    await adminClient.from("checkin_ai_adjustment_draft").upsert({
      check_in_id: checkInId,
      action: resultado.acao,
      action_rationale: resultado.motivo_acao,
      estrategia_identificada: resultado.estrategia_identificada,
      resumo: resultado.resumo,
      sugestoes: resultado.sugestoes,
      generated_at: new Date().toISOString(),
    }, { onConflict: "check_in_id" });

    return new Response(JSON.stringify({ ok: true, protocolId, ...resultado }), {
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
