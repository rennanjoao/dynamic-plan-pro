# Migração Anthropic → Lovable AI (Gemini 2.5 Flash)

Trocar a integração dos dois chatbots da plataforma para o **Lovable AI Gateway** usando `google/gemini-2.5-flash`. Fica gratuito até 13/10/2025 e elimina a dependência da `ANTHROPIC_API_KEY`.

## O que muda

### 1. `supabase/functions/info-chat/index.ts` (Guia Elite da landing)
- Remover chamada direta para `https://api.anthropic.com/v1/messages`.
- Trocar por `fetch` para `https://ai.gateway.lovable.dev/v1/chat/completions` usando o formato OpenAI-compatible.
- Header: `Authorization: Bearer ${LOVABLE_API_KEY}`.
- Manter streaming SSE (já é compatível — Lovable AI Gateway aceita `stream: true` no formato OpenAI).
- Modelo: `google/gemini-2.5-flash`.
- Preservar o system prompt atual ("Guia Elite", 3-4 frases, tom baseado em evidências).
- Tratar erros 429 (rate limit) e 402 (créditos esgotados) com mensagens claras.

### 2. `supabase/functions/fitness-chat/index.ts` (Mentor Técnico — alunos e coach)
- Mesmas mudanças do info-chat.
- Preservar o system prompt do mentor técnico de elite.
- Manter streaming.

### 3. Frontend
- **Nenhuma mudança.** `InfoChatBot.tsx` e `FitnessCoachBot.tsx` continuam consumindo as edge functions via `supabase.functions.invoke()` / streaming — o contrato de entrada/saída permanece idêntico.

### 4. Deploy
- Redeploy de `info-chat` e `fitness-chat` após as edições.

### 5. Limpeza
- Remover o secret `ANTHROPIC_API_KEY` via `secrets--delete_secret` após validar que ambos os chatbots respondem corretamente.

## Detalhes técnicos

Formato da chamada ao gateway (idêntico para os dois functions):

```ts
const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userMessage },
    ],
  }),
});
```

O stream SSE retorna deltas em `choices[0].delta.content` (formato OpenAI), então o parser de stream precisa apontar para esse campo em vez de `delta.text` (Anthropic). Ambos os functions devem ser ajustados.

## Validação
- Testar Guia Elite na landing (mensagem qualquer → resposta concisa em 3-4 frases).
- Testar Mentor Técnico na área do aluno (pergunta sobre treino/dieta → resposta detalhada via streaming).
- Confirmar nos logs das edge functions que não há mais chamadas para `api.anthropic.com`.
- Remover `ANTHROPIC_API_KEY` apenas após ambos validados.

## Fora de escopo
- Nenhuma mudança em UI, banco, RLS, outras edge functions (`notify-coach`, `send-plan-email`, etc) ou lógica de negócio.