/**
 * Chamada central ao Groq (todas as IAs do app passam por aqui).
 *
 * Por que existe: em 2026 o Groq descontinuou o `qwen/qwen3.6-27b`, que estava
 * fixo em 10 functions — todas as respostas de IA passaram a falhar ao mesmo
 * tempo. O Groq troca modelos com frequência (os "Preview" podem sair do ar com
 * pouco aviso), então:
 *  - o modelo vem de UM lugar (DEFAULT_MODEL) e pode ser trocado sem programar
 *    pelo segredo GROQ_MODEL (e GROQ_VISION_MODEL para fotos) no Lovable;
 *  - se o modelo sumir (404 / "decommissioned"), tenta o próximo da lista;
 *  - se o modelo recusar um parâmetro de raciocínio, refaz sem ele;
 *  - o texto de "pensamento" (<think>) nunca chega à resposta;
 *  - erros viram mensagens claras em português (chave, limite, modelo).
 *
 * Arquivo puro (sem Deno): `fetch` e o ambiente entram por parâmetro, para ser
 * testado em src/lib/__tests__/groqLogic.test.ts.
 */

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** Sucessor oficial do qwen3.6-27b no Groq (texto + imagem). */
export const DEFAULT_MODEL = "qwen/qwen3.8-27b";
/** Plano B só para TEXTO (modelo de produção do Groq; não lê imagem). */
export const TEXT_FALLBACK_MODEL = "openai/gpt-oss-120b";

export type ChatBody = Record<string, unknown> & { messages: unknown[]; stream?: boolean };

/** Lista de modelos a tentar, em ordem, sem repetição. */
export function modelChain(envModel: string | undefined | null, vision: boolean): string[] {
  const fromEnv = (envModel ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const chain = [...fromEnv, DEFAULT_MODEL, ...(vision ? [] : [TEXT_FALLBACK_MODEL])];
  return [...new Set(chain)];
}

const isGptOss = (model: string) => model.startsWith("openai/gpt-oss");

/**
 * Ajusta o corpo ao modelo. Os Qwen aceitam reasoning_effort "none" (sem
 * pensamento, resposta direta); o gpt-oss não tem "none" — usa "low".
 */
export function adaptBody(body: ChatBody, model: string): ChatBody {
  const out: ChatBody = { ...body, model };
  if (isGptOss(model)) {
    if ("reasoning_effort" in out) out.reasoning_effort = "low";
    delete out.reasoning_format;
  }
  return out;
}

/** O modelo não existe mais / não está disponível para esta chave. */
export function isModelUnavailable(status: number, text: string): boolean {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  return /decommission|model_not_found|model_terminated|does not exist|not found|not available|no longer (available|supported)|deprecated/i.test(text);
}

/** O modelo recusou um parâmetro específico (ex.: reasoning_effort). */
export function isParamRejected(status: number, text: string, param: string): boolean {
  return status === 400 && text.toLowerCase().includes(param.toLowerCase());
}

/** Remove o bloco de raciocínio que alguns modelos colocam no texto. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^\s*<think>[\s\S]*$/i, "").trim();
}

/** Mensagem clara em português para o coach (nunca mostra a chave). */
export function groqErrorMessage(status: number, text = ""): string {
  if (status === 401 || /invalid_api_key|invalid api key/i.test(text)) {
    return "IA indisponível: a chave do Groq é inválida ou foi revogada. Gere uma nova no console.groq.com e atualize o segredo no Lovable.";
  }
  if (status === 429) {
    return /quota|billing|credit|insufficient/i.test(text)
      ? "IA indisponível: a conta do Groq ficou sem crédito/cota. Verifique o faturamento no console.groq.com."
      : "IA ocupada: limite de uso por minuto atingido. Tente de novo em alguns instantes.";
  }
  if (status === 413) return "Texto grande demais para a IA. Tente com menos conteúdo.";
  if (isModelUnavailable(status, text)) {
    return "IA indisponível: o modelo configurado foi descontinuado pelo Groq. Atualize o segredo GROQ_MODEL no Lovable.";
  }
  if (status >= 500) return "O Groq está instável agora. Tente de novo em alguns minutos.";
  return `A IA não conseguiu responder (erro ${status}).`;
}

export interface GroqRequestOptions {
  apiKey: string;
  body: ChatBody;
  /** Pedido com imagem: não usa o plano B de texto. */
  vision?: boolean;
  /** Valor do segredo GROQ_MODEL / GROQ_VISION_MODEL (pode ter vários, separados por vírgula). */
  envModel?: string | null;
  fetchImpl: typeof fetch;
  label?: string;
  log?: (msg: string) => void;
}

/**
 * Faz o pedido com troca automática de modelo e de parâmetros. Devolve a
 * resposta (ok ou não) e o modelo usado. Respostas sem streaming já vêm com o
 * <think> removido do conteúdo.
 */
export async function groqRequest(opts: GroqRequestOptions): Promise<{ response: Response; model: string }> {
  const log = opts.log ?? ((m: string) => console.warn(m));
  const tag = `[groq${opts.label ? `:${opts.label}` : ""}]`;
  const models = modelChain(opts.envModel, !!opts.vision);
  let last: { response: Response; model: string } | null = null;

  for (const model of models) {
    let body = adaptBody(opts.body, model);
    // Até 3 variações do mesmo modelo: como veio; sem reasoning_effort (com o
    // raciocínio escondido); sem nenhum parâmetro de raciocínio.
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await opts.fetchImpl(GROQ_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (body.stream) return { response: res, model };
        const json = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
        for (const c of json?.choices ?? []) {
          if (c?.message && typeof c.message.content === "string") c.message.content = stripThinking(c.message.content);
        }
        return {
          response: new Response(JSON.stringify(json ?? {}), { status: 200, headers: { "Content-Type": "application/json" } }),
          model,
        };
      }
      const text = await res.text().catch(() => "");
      last = { response: new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } }), model };

      if (isParamRejected(res.status, text, "reasoning_effort") && "reasoning_effort" in body) {
        log(`${tag} ${model} recusou reasoning_effort; tentando sem.`);
        body = { ...body };
        delete body.reasoning_effort;
        if (!isGptOss(model)) body.reasoning_format = "hidden";
        continue;
      }
      if (isParamRejected(res.status, text, "reasoning_format") && "reasoning_format" in body) {
        log(`${tag} ${model} recusou reasoning_format; tentando sem.`);
        body = { ...body };
        delete body.reasoning_format;
        continue;
      }
      if (isModelUnavailable(res.status, text)) {
        log(`${tag} modelo ${model} indisponível (${res.status}); tentando o próximo.`);
        break; // próximo modelo
      }
      // Chave inválida, limite, texto grande demais, instabilidade: trocar de
      // modelo não resolve — devolve para quem chamou mostrar a mensagem.
      return last;
    }
  }
  return last ?? { response: new Response("{}", { status: 503 }), model: models[0] };
}

// ── Diagnóstico (function ai-health, tela Admin → IA) ─────────────────────────

export type KeyHealthState = "ok" | "sem_chave" | "chave_invalida" | "sem_cota" | "limite" | "modelo_indisponivel" | "erro";

export interface KeyCheckInput {
  configured: boolean;
  /** GET /models: status e lista de ids (quando 200). */
  modelsStatus?: number;
  modelsText?: string;
  available?: string[];
  /** Chamada de teste curtinha. */
  chatStatus?: number;
  chatText?: string;
  chatModel?: string;
  /** Modelos que o app tentaria, em ordem. */
  chain: string[];
}

export function summarizeKeyCheck(i: KeyCheckInput): { state: KeyHealthState; message: string; usableModels: string[] } {
  const usableModels = i.available ? i.chain.filter((m) => i.available!.includes(m)) : [];
  if (!i.configured) {
    return { state: "sem_chave", message: "Segredo não cadastrado no Lovable Cloud.", usableModels };
  }
  if (i.modelsStatus === 401 || i.chatStatus === 401) {
    return { state: "chave_invalida", message: "Chave recusada pelo Groq (inválida ou revogada). Gere outra no console.groq.com.", usableModels };
  }
  if (i.chatStatus && i.chatStatus >= 200 && i.chatStatus < 300) {
    const fallbackNote = i.chatModel && i.chatModel !== i.chain[0] ? ` (usando o plano B: ${i.chatModel})` : "";
    return { state: "ok", message: `Funcionando${fallbackNote}.`, usableModels };
  }
  if (i.chatStatus === 429) {
    const quota = /quota|billing|credit|insufficient/i.test(i.chatText ?? "");
    return quota
      ? { state: "sem_cota", message: "Conta do Groq sem crédito/cota. Verifique o faturamento.", usableModels }
      : { state: "limite", message: "Limite por minuto atingido agora; tente o teste de novo em 1 minuto.", usableModels };
  }
  if (i.available && usableModels.length === 0) {
    return { state: "modelo_indisponivel", message: `Nenhum dos modelos configurados está disponível para esta chave (${i.chain.join(", ")}).`, usableModels };
  }
  if (i.chatStatus && isModelUnavailable(i.chatStatus, i.chatText ?? "")) {
    return { state: "modelo_indisponivel", message: "O modelo configurado não está disponível. Ajuste o segredo GROQ_MODEL.", usableModels };
  }
  return { state: "erro", message: groqErrorMessage(i.chatStatus ?? i.modelsStatus ?? 0, i.chatText ?? i.modelsText ?? ""), usableModels };
}
