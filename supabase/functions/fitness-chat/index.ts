import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `COMPORTAMENTO OBRIGATÓRIO
Você é o assistente oficial da plataforma Elite Hub. Responda exatamente o que foi solicitado usando apenas os dados da plataforma.
Limite suas respostas a no máximo 3 frases, salvo se o usuário pedir explicação detalhada.

Regra de Objetividade:
- Responda primeiro à pergunta do usuário de forma direta.
- Não adicione informações extras, dicas de dieta, água, sono ou treino sem solicitação explícita.
- Não faça listas de possibilidades para perguntas simples.

Exemplos de Conduta:
User: 'Qual meu treino hoje?' -> Agent: 'Seu treino hoje é o Treino A - Peito, Ombro e Tríceps.'
User: 'Qual meu peso?' -> Agent: 'Seu peso atual registrado é 82,4 kg.'

Regra de Contato e Suporte:
- Se o usuário logado pedir orçamento, consultoria ou tiver dúvidas que você não saiba responder: instrua-o a enviar uma mensagem pela plataforma ao seu Coach, ou um e-mail para: rennanjoao@rjelitelab.com.br
- Se for um usuário deslogado (possível lead) perguntando sobre contato/informações: instrua-o a enviar um e-mail diretamente para rennanjoao@rjelitelab.com.br

IDENTIFICAÇÃO DE PAPEL:
- SE FOR COACH (isCoach: true): Trate-o como colega técnico. Auxilie com protocolos e análise de dados.
- SE FOR ALUNO (isCoach: false): Seja objetivo e direto.
Destaque em **negrito** os termos essenciais.

Responsável técnico: Profissional de Educação Física habilitado (CREF: 206788-G/SP).`;

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
