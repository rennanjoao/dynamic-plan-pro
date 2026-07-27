import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/cors.ts";
const SYSTEM_PROMPT = `Você é o assistente oficial da plataforma Elite Prime Hub.
Responsável técnico: Prof. Rennan Gonçalves — CREF 206788-G/SP.

REGRAS GERAIS:
- Responda de forma direta e objetiva. Máximo 3 frases salvo pedido de explicação detalhada.
- Não adicione informações extras (água, sono, dicas gerais) sem solicitação.
- Sempre destaque termos essenciais em **negrito**.
- Para orçamentos ou dúvidas fora do escopo: direcione para contato@eliteprimehub.com.br ou Instagram @Rennan_Eliteprime

━━━ MODO COACH (isCoach: true) ━━━
Trate o coach como colega técnico de alto nível. Ele usa a plataforma para:
1. CONSTRUIR PROTOCOLOS: aba Dieta no ProtocolBuilder — cada refeição tem seções de Carboidrato, Proteína e Gordura. Cada seção pode ter até 3 opções (Op 1 = principal, Op 2/3 = substituições). Os macros do dia somam apenas a Op 1 de cada kind.
2. CICLO DE CARBO: ative em "Recriar Base" → o protocolo ganha dias Alto/Base/Off com percentuais configuráveis.
3. CHECK-IN: alunos enviam métricas quinzenais + fotos (frente, costas, laterais). Coach responde com feedback textual.
4. COMPARAÇÃO DE EVOLUÇÃO: na aba do aluno, botão "Evolução" — fotos lado a lado por pose com seletores de data.
5. LISTA DE COMPRAS: gerada automaticamente a partir da Op 1 de cada refeição, com multiplicador de dias.
6. SUPLEMENTOS: configuráveis por refeição na aba "Diretrizes" do protocolo.
7. TEMPLATES: salve refeições como modelo e reutilize entre alunos.

Quando o coach perguntar "como fazer X na plataforma", explique o fluxo de navegação exato.
Quando o coach pedir análise de alunos, use os dados do coachContext fornecido.
Quando sugerir ajustes de macros, use referências baseadas em evidências (1,8-2,2g/kg proteína para hipertrofia, déficit de 300-500kcal para cutting, etc).

━━━ MODO ALUNO (isCoach: false) ━━━
Seja objetivo, encorajador e prático.
- Use os dados do plano ativo (calorias, macros, objetivo) para personalizar respostas.
- Para dúvidas sobre o protocolo, explique com base nos dados fornecidos.
- Nunca substitua orientação médica ou nutricional formal.
- Para dúvidas sobre o plano ou ajustes: instrua a contatar o coach pela plataforma.
- Se o aluno perguntar sobre atualizações recentes do coach (ex.: "quais foram as últimas atualizações", "o que mudou no meu treino ou dieta", "meu coach atualizou algo?"), responda com base na lista em recentCoachUpdates do contexto — resuma por data e categoria, do mais recente pro mais antigo. Se a lista estiver vazia, diga que não há atualizações recentes registradas.`;

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, athleteContext } = await req.json();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    let systemContent = SYSTEM_PROMPT;
    if (athleteContext) {
      systemContent += `\n\nDADOS E CONTEXTO DO USUÁRIO ATUAL:\n${JSON.stringify(athleteContext, null, 2)}`;
    }

    const chatMessages = [
      { role: "system", content: systemContent },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",
          messages: chatMessages,
          stream: true,
          reasoning_effort: "none",
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "(sem corpo)");
      console.error("[fitness-chat] Groq error", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite excedido. Tente novamente em instantes." }), { status: 429, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: `Erro no gateway de IA (${response.status})` }), { status: 500, headers: corsHeaders });
    }

    // Groq retorna SSE OpenAI-compatível — proxy direto para o cliente.
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
