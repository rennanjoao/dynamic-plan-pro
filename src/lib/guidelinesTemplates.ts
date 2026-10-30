// src/lib/guidelinesTemplates.ts
//
// Biblioteca de "Templates de Diretrizes" (bloco isolado — só os 4 textos de
// diretrizes: treino, dieta, organização da semana e sono). Mesmo padrão de
// dietTemplates.ts / workoutTemplates.ts: tabela `protocols` discriminada por
// `template_kind = 'guidelines'`.

import { z, type ZodType } from "zod";
import { createBlockTemplateStore, assertTemplateIdentity, type BlockTemplate } from "@/lib/blockTemplates";
import type { ProtocolPayload } from "@/lib/protocolSchema";

export const GuidelinesBlockPayloadSchema = z.object({
  scope: z.literal("guidelines").default("guidelines"),
  guidelines: z.object({
    training: z.string().default(""),
    diet: z.string().default(""),
    weekOrganization: z.string().default(""),
    supplementation: z.string().default(""),
  }).default({} as never),
});

export type GuidelinesBlockPayload = z.infer<typeof GuidelinesBlockPayloadSchema>;

export type GuidelinesTemplate = BlockTemplate<GuidelinesBlockPayload>;

export function hasAnyGuideline(g: ProtocolPayload["guidelines"] | undefined): boolean {
  if (!g) return false;
  return Object.values(g).some((v) => typeof v === "string" && v.trim().length > 0);
}

const store = createBlockTemplateStore<GuidelinesBlockPayload>({
  kind: "guidelines",
  schema: GuidelinesBlockPayloadSchema as ZodType<GuidelinesBlockPayload>,
  versionsTable: "guidelines_block_versions",
  saveRpc: "save_guidelines_block_template",
});

/** Lista os templates de diretrizes do coach + os de sistema (coach_id NULL). */
export const listGuidelinesTemplates = (coachId: string | null): Promise<GuidelinesTemplate[]> => store.list(coachId);

/** Cria ou atualiza um template de diretrizes. Devolve o id. */
export async function saveGuidelinesAsTemplate(params: {
  coachId: string;
  name: string;
  guidelines: ProtocolPayload["guidelines"];
  existingId?: string | null;
}): Promise<string> {
  const { coachId, existingId } = params;
  const trimmed = assertTemplateIdentity(coachId, params.name);
  if (!hasAnyGuideline(params.guidelines)) {
    throw new Error("Nenhuma diretriz preenchida para salvar");
  }

  const payload = GuidelinesBlockPayloadSchema.parse({
    scope: "guidelines",
    guidelines: params.guidelines,
  });

  return store.saveViaRpc({ coachId, name: trimmed, payload, existingId });
}

export const deleteGuidelinesTemplate = (id: string, coachId: string) => store.remove(id, coachId);

/** Injeta as diretrizes do template no protocolo, sem tocar em nada mais. */
export function injectGuidelines(payload: ProtocolPayload, block: GuidelinesBlockPayload): ProtocolPayload {
  return { ...payload, guidelines: { ...payload.guidelines, ...block.guidelines } };
}
