// src/lib/dietTemplates.ts
//
// Templates de "Dieta" (bloco isolado — só refeições). CRUD/histórico
// genéricos vivem em blockTemplates.ts.

import {
  DietBlockPayloadSchema,
  type DietBlockPayload,
  type MealRow,
  type ProtocolPayload,
  genItemId,
} from "@/lib/protocolSchema";
import { assertTemplateIdentity, createBlockTemplateStore, type BlockTemplate, type BlockVersion } from "@/lib/blockTemplates";
import type { ZodType } from "zod";

export type DietBlockTemplate = BlockTemplate<DietBlockPayload>;
export type DietBlockVersion = BlockVersion<DietBlockPayload>;

const store = createBlockTemplateStore<DietBlockPayload>({
  kind: "diet",
  schema: DietBlockPayloadSchema as ZodType<DietBlockPayload>,
  versionsTable: "diet_block_versions",
  saveRpc: "save_diet_block_template",
});

export const listDietBlockTemplates = (coachId: string | null): Promise<DietBlockTemplate[]> => store.list(coachId);
export const deleteDietBlockTemplate = (id: string, coachId: string) => store.remove(id, coachId);
export const listDietBlockVersions = (templateId: string): Promise<DietBlockVersion[]> => store.listVersions(templateId);

/** Salva (cria ou atualiza) a dieta atual como template via RPC atômica. */
export async function saveDietBlockAsTemplate(params: {
  coachId: string;
  name: string;
  meals: MealRow[];
  existingId?: string | null;
}): Promise<string> {
  const name = assertTemplateIdentity(params.coachId, params.name);
  if (params.meals.length === 0) {
    throw new Error("Nenhuma refeição para salvar — monte a dieta primeiro");
  }
  const payload = DietBlockPayloadSchema.parse({ scope: "diet", meals: params.meals });
  return store.saveViaRpc({ coachId: params.coachId, name, payload, existingId: params.existingId });
}

/** Restaura uma versão antiga como o payload ATUAL do template (mantém o nome). */
export async function restoreDietBlockVersion(
  templateId: string,
  coachId: string,
  templateName: string,
  version: DietBlockVersion,
): Promise<void> {
  await saveDietBlockAsTemplate({
    coachId,
    name: templateName,
    meals: version.payload.meals,
    existingId: templateId,
  });
}

/**
 * Substitui a lista de refeições do payload ATUAL do protocolo pelas do
 * template, sem tocar em mais nada (treino, macros, suplementos,
 * periodização, diretrizes seguem intactos). Gera `__id` novo pra cada
 * refeição — mesmo cuidado já tomado no anexo de refeição individual
 * (DietTab.tsx), pra não colidir com ids de refeições já existentes.
 */
export function injectDietBlock(
  payload: ProtocolPayload,
  tpl: DietBlockPayload,
): ProtocolPayload {
  if (tpl.meals.length === 0) return payload;
  const meals = tpl.meals.map((m) => ({ ...m, __id: genItemId("meal") }));
  return { ...payload, meals };
}
