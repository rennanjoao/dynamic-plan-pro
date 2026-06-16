import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o assistente oficial da plataforma Elite Prime Hub.
Responsável técnico: Prof. Rennan Gonçalves — CREF 206788-G/SP.

REGRAS GERAIS:
- Responda de forma direta e objetiva. Máximo 3 frases salvo pedido de explicação detalhada.
- Não adicione informações extras (água, sono, dicas gerais) sem solicitação.
- Sempre destaque termos essenciais em **negrito**.
- Para orçamentos ou dúvidas fora do escopo: direcione para rennanjoao@rjelitelab.com.br

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
- Para dúvidas sobre o plano ou ajustes: instrua a contatar o coach pela plataforma.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, athleteContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite excedido. Tente novamente em instantes." }), { status: 429, headers: corsHeaders });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Contate o administrador." }), { status: 402, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), { status: 500, headers: corsHeaders });
    }

    // Lovable AI Gateway already returns OpenAI-compatible SSE — proxy directly.
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
