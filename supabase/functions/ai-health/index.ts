/**
 * Diagnóstico da IA (só admin): para cada chave do Groq, diz se está
 * cadastrada, se o Groq aceita, quais modelos estão disponíveis e faz uma
 * chamada de teste mínima (poucos tokens). Nunca devolve a chave.
 *
 * Existe porque a IA ficou semanas parada (modelo descontinuado) sem ninguém
 * saber a causa — agora o admin descobre com um clique.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { adminClient, getCaller, isAdmin, json } from "../_shared/partnerAuth.ts";
import { groqRequest, modelChain, summarizeKeyCheck } from "../_shared/groqLogic.ts";

const KEYS = [
  { name: "GROQ_API_KEY_EVAL", uso: "Avaliações, rascunhos e análises do coach (inclui fotos)", vision: true },
  { name: "GROQ_API_KEY_STUDENTS", uso: "Chat das alunas e chat do site", vision: false },
  { name: "GROQ_API_KEY_REMINDERS", uso: "Mensagem motivacional do dia", vision: false },
] as const;

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: "Faça login novamente." }, 401, corsHeaders);
    if (!(await isAdmin(adminClient(), caller.id))) return json({ error: "Apenas administradores." }, 403, corsHeaders);

    const textModel = Deno.env.get("GROQ_MODEL") ?? null;
    const visionModel = Deno.env.get("GROQ_VISION_MODEL") || textModel;

    const results = [];
    for (const k of KEYS) {
      const apiKey = Deno.env.get(k.name) ?? "";
      const chain = modelChain(k.vision ? visionModel : textModel, false);
      if (!apiKey) {
        results.push({ key: k.name, uso: k.uso, ...summarizeKeyCheck({ configured: false, chain }) });
        continue;
      }
      const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      const modelsText = await modelsRes.text().catch(() => "");
      let available: string[] | undefined;
      if (modelsRes.ok) {
        try {
          available = (JSON.parse(modelsText)?.data ?? []).map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean);
        } catch { /* lista ilegível */ }
      }
      const { response, model } = await groqRequest({
        apiKey,
        envModel: k.vision ? visionModel : textModel,
        fetchImpl: fetch,
        label: "ai-health",
        body: {
          messages: [{ role: "user", content: "Responda apenas: ok" }],
          stream: false,
          max_tokens: 5,
          temperature: 0,
          reasoning_effort: "none",
        },
      });
      const chatText = response.ok ? "" : await response.text().catch(() => "");
      if (!response.ok) console.error("[ai-health]", k.name, response.status, model, chatText.slice(0, 300));
      results.push({
        key: k.name,
        uso: k.uso,
        model,
        ...summarizeKeyCheck({
          configured: true,
          modelsStatus: modelsRes.status,
          modelsText,
          available,
          chatStatus: response.status,
          chatText,
          chatModel: model,
          chain,
        }),
        visionReady: k.vision ? (available ? modelChain(visionModel, true).some((m) => available!.includes(m)) : null) : undefined,
      });
    }
    return json({ ok: true, checkedAt: new Date().toISOString(), groqModel: textModel, groqVisionModel: visionModel, results }, 200, corsHeaders);
  } catch (e) {
    console.error("[ai-health]", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500, corsHeaders);
  }
});
