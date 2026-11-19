import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_MODEL, TEXT_FALLBACK_MODEL, adaptBody, groqErrorMessage, groqRequest,
  isModelUnavailable, modelChain, stripThinking, summarizeKeyCheck,
} from "../../../supabase/functions/_shared/groqLogic";
import { functionErrorMessage } from "@/lib/functionError";

type Call = { model: string; body: Record<string, unknown> };

function fakeFetch(handler: (body: Record<string, unknown>, n: number) => Response) {
  const calls: Call[] = [];
  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ model: body.model, body });
    return handler(body, calls.length);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const okJson = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const err = (status: number, message: string, code = "") =>
  new Response(JSON.stringify({ error: { message, code } }), { status });

const baseBody = { messages: [{ role: "user", content: "oi" }], stream: false, reasoning_effort: "none" };
const quiet = () => {};

describe("modelChain", () => {
  it("usa o padrão e o plano B de texto, sem repetir", () => {
    expect(modelChain(undefined, false)).toEqual([DEFAULT_MODEL, TEXT_FALLBACK_MODEL]);
    expect(modelChain(DEFAULT_MODEL, false)).toEqual([DEFAULT_MODEL, TEXT_FALLBACK_MODEL]);
  });
  it("segredo GROQ_MODEL vem primeiro e aceita lista", () => {
    expect(modelChain(" a/x , b/y ", false)).toEqual(["a/x", "b/y", DEFAULT_MODEL, TEXT_FALLBACK_MODEL]);
  });
  it("pedido com foto não cai para modelo sem visão", () => {
    expect(modelChain("", true)).toEqual([DEFAULT_MODEL]);
  });
  it("o modelo descontinuado não é mais o padrão", () => {
    expect(DEFAULT_MODEL).not.toBe("qwen/qwen3.6-27b");
  });
});

describe("adaptBody", () => {
  it("Qwen mantém reasoning_effort none", () => {
    expect(adaptBody(baseBody, DEFAULT_MODEL)).toMatchObject({ model: DEFAULT_MODEL, reasoning_effort: "none" });
  });
  it("gpt-oss troca none por low (não aceita none)", () => {
    expect(adaptBody(baseBody, TEXT_FALLBACK_MODEL).reasoning_effort).toBe("low");
  });
});

describe("classificação de erros", () => {
  it("reconhece modelo descontinuado", () => {
    expect(isModelUnavailable(404, "")).toBe(true);
    expect(isModelUnavailable(400, "The model `qwen/qwen3.6-27b` has been decommissioned")).toBe(true);
    expect(isModelUnavailable(400, "invalid value for temperature")).toBe(false);
    expect(isModelUnavailable(401, "model not found")).toBe(false);
  });
  it("mensagens claras em português", () => {
    expect(groqErrorMessage(401, "Invalid API Key")).toMatch(/chave do Groq/);
    expect(groqErrorMessage(429, "Rate limit reached")).toMatch(/limite de uso por minuto/);
    expect(groqErrorMessage(429, "insufficient quota, check billing")).toMatch(/crédito/);
    expect(groqErrorMessage(404, "")).toMatch(/descontinuado/);
    expect(groqErrorMessage(503, "")).toMatch(/instável/);
  });
  it("remove o raciocínio do texto", () => {
    expect(stripThinking("<think>pensando...</think>\n{\"a\":1}")).toBe('{"a":1}');
    expect(stripThinking("<think>cortado sem fim")).toBe("");
    expect(stripThinking("resposta normal")).toBe("resposta normal");
  });
});

describe("groqRequest", () => {
  it("modelo descontinuado → tenta o próximo e responde", async () => {
    const { impl, calls } = fakeFetch((b) =>
      b.model === "velho/modelo"
        ? err(400, "The model `velho/modelo` has been decommissioned and is no longer supported", "model_decommissioned")
        : okJson("oi!"),
    );
    const { response, model } = await groqRequest({ apiKey: "k", body: baseBody, envModel: "velho/modelo", fetchImpl: impl, log: quiet });
    expect(response.ok).toBe(true);
    expect(model).toBe(DEFAULT_MODEL);
    expect(calls.map((c) => c.model)).toEqual(["velho/modelo", DEFAULT_MODEL]);
  });

  it("padrão também fora do ar → usa o plano B de texto com reasoning low", async () => {
    const { impl, calls } = fakeFetch((b) => (b.model === TEXT_FALLBACK_MODEL ? okJson("ok") : err(404, "model_not_found")));
    const { response, model } = await groqRequest({ apiKey: "k", body: baseBody, fetchImpl: impl, log: quiet });
    expect(response.ok).toBe(true);
    expect(model).toBe(TEXT_FALLBACK_MODEL);
    expect(calls[1].body.reasoning_effort).toBe("low");
  });

  it("foto: não troca para modelo sem visão", async () => {
    const { impl, calls } = fakeFetch(() => err(404, "model_not_found"));
    const { response } = await groqRequest({ apiKey: "k", body: baseBody, vision: true, fetchImpl: impl, log: quiet });
    expect(response.status).toBe(404);
    expect(calls.map((c) => c.model)).toEqual([DEFAULT_MODEL]);
  });

  it("parâmetro de raciocínio recusado → refaz sem ele, no mesmo modelo", async () => {
    const { impl, calls } = fakeFetch((b) =>
      "reasoning_effort" in b ? err(400, "`reasoning_effort` is not supported with this model") : okJson("ok"),
    );
    const { response, model } = await groqRequest({ apiKey: "k", body: baseBody, fetchImpl: impl, log: quiet });
    expect(response.ok).toBe(true);
    expect(model).toBe(DEFAULT_MODEL);
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty("reasoning_effort");
    expect(calls[1].body.reasoning_format).toBe("hidden");
  });

  it("chave inválida → para na hora (trocar de modelo não resolve)", async () => {
    const { impl, calls } = fakeFetch(() => err(401, "Invalid API Key", "invalid_api_key"));
    const { response } = await groqRequest({ apiKey: "k", body: baseBody, fetchImpl: impl, log: quiet });
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(1);
    expect(groqErrorMessage(response.status, await response.text())).toMatch(/chave do Groq/);
  });

  it("limite (429) → não gasta outra chamada", async () => {
    const { impl, calls } = fakeFetch(() => err(429, "Rate limit reached for model"));
    const { response } = await groqRequest({ apiKey: "k", body: baseBody, fetchImpl: impl, log: quiet });
    expect(response.status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  it("resposta sem streaming chega sem o <think>", async () => {
    const { impl } = fakeFetch(() => okJson("<think>hmm</think>{\"ok\":true}"));
    const { response } = await groqRequest({ apiKey: "k", body: baseBody, fetchImpl: impl, log: quiet });
    const j = await response.json();
    expect(j.choices[0].message.content).toBe('{"ok":true}');
  });

  it("streaming devolve a resposta original (para repassar ao chat)", async () => {
    const stream = new Response("data: {}\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const { impl } = fakeFetch(() => stream);
    const { response } = await groqRequest({ apiKey: "k", body: { ...baseBody, stream: true }, fetchImpl: impl, log: quiet });
    expect(response).toBe(stream);
  });
});

describe("functionErrorMessage", () => {
  const httpError = (body: unknown) =>
    Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify(body), { status: 500 }),
    });

  it("mostra a explicação que a function mandou", async () => {
    expect(await functionErrorMessage(httpError({ error: "IA indisponível: a chave do Groq é inválida." }), "x"))
      .toBe("IA indisponível: a chave do Groq é inválida.");
  });
  it("ignora códigos técnicos e a mensagem genérica do supabase", async () => {
    expect(await functionErrorMessage(httpError({ error: "ia_invalida" }), "Tente de novo.")).toBe("Tente de novo.");
  });
  it("usa a mensagem de um Error comum", async () => {
    expect(await functionErrorMessage(new Error("Aluno sem check-in"), "x")).toBe("Aluno sem check-in");
  });
});

describe("summarizeKeyCheck (Admin → IA)", () => {
  const chain = [DEFAULT_MODEL, TEXT_FALLBACK_MODEL];
  it("sem segredo", () => {
    expect(summarizeKeyCheck({ configured: false, chain }).state).toBe("sem_chave");
  });
  it("chave recusada", () => {
    expect(summarizeKeyCheck({ configured: true, modelsStatus: 401, chatStatus: 401, chain }).state).toBe("chave_invalida");
  });
  it("funcionando, avisando quando foi no plano B", () => {
    const ok = summarizeKeyCheck({ configured: true, modelsStatus: 200, available: chain, chatStatus: 200, chatModel: DEFAULT_MODEL, chain });
    expect(ok.state).toBe("ok");
    expect(ok.message).not.toMatch(/plano B/);
    const b = summarizeKeyCheck({ configured: true, modelsStatus: 200, available: [TEXT_FALLBACK_MODEL], chatStatus: 200, chatModel: TEXT_FALLBACK_MODEL, chain });
    expect(b.message).toMatch(/plano B/);
  });
  it("sem crédito x limite por minuto", () => {
    expect(summarizeKeyCheck({ configured: true, chatStatus: 429, chatText: "insufficient quota", chain }).state).toBe("sem_cota");
    expect(summarizeKeyCheck({ configured: true, chatStatus: 429, chatText: "rate limit", chain }).state).toBe("limite");
  });
  it("nenhum modelo da lista disponível para a chave", () => {
    const r = summarizeKeyCheck({ configured: true, modelsStatus: 200, available: ["outro/modelo"], chatStatus: 404, chain });
    expect(r.state).toBe("modelo_indisponivel");
  });
});
