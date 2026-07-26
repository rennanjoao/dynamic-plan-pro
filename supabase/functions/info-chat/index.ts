import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/cors.ts";
const SYSTEM_PROMPT = `Você é o assistente oficial da plataforma Elite Hub.
Responda de forma direta, objetiva e em no máximo 3 frases, salvo pedido de detalhe.
Para orçamento ou dúvidas sem resposta indique o e-mail contato@eliteprimehub.com.br ou Instagram @Rennan_Eliteprime.
Responsável técnico: CREF 206788-G/SP.`;

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      return new Response(JSON.stringify({ error: "payload inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemContent = SYSTEM_PROMPT;
    if (body.userContext) {
      systemContent += `\n\nDADOS DO USUÁRIO:\n${JSON.stringify(body.userContext, null, 2)}`;
    }

    const chatMessages = [
      { role: "system", content: systemContent },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
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
          reasoning_format: "hidden",
        }),
      }
    );

    if (!response.ok) {
      // Lê o corpo uma única vez como texto — para log e para extrair mensagem de erro
      const errBody = await response.text().catch(() => "(sem corpo)");
      console.error(`[info-chat] Groq error ${response.status}:`, errBody);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let errMessage = "Erro na IA";
      try {
        const parsed = JSON.parse(errBody);
        errMessage = parsed?.error?.message ?? errMessage;
      } catch { /* ignora parse error */ }

      return new Response(
        JSON.stringify({ error: errMessage }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
