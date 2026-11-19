/**
 * Atalho Deno para a chamada central ao Groq (ver groqLogic.ts).
 * Modelo configurável sem programar pelos segredos do Lovable:
 *   GROQ_MODEL         — texto (ex.: "qwen/qwen3.8-27b"; aceita vários, separados por vírgula)
 *   GROQ_VISION_MODEL  — fotos (se vazio, usa GROQ_MODEL e depois o padrão)
 */
import { groqRequest, type ChatBody } from "./groqLogic.ts";
export { groqErrorMessage, stripThinking, DEFAULT_MODEL } from "./groqLogic.ts";

export function groqChat(opts: { apiKey: string; body: ChatBody; vision?: boolean; label?: string }) {
  const envModel = opts.vision
    ? (Deno.env.get("GROQ_VISION_MODEL") || Deno.env.get("GROQ_MODEL"))
    : Deno.env.get("GROQ_MODEL");
  return groqRequest({ ...opts, envModel, fetchImpl: fetch });
}
