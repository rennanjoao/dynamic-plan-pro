// src/lib/periodizationTemplates.ts
//
// Templates de "Periodização" (as 4 semanas + overrides por exercício).
// CRUD/histórico genéricos vivem em blockTemplates.ts.

import {
  PeriodizationBlockPayloadSchema,
  type PeriodizationBlockPayload,
  type ProtocolPayload,
} from "@/lib/protocolSchema";
import { assertTemplateIdentity, createBlockTemplateStore, type BlockTemplate, type BlockVersion } from "@/lib/blockTemplates";
import type { ZodType } from "zod";

export type PeriodizationBlockTemplate = BlockTemplate<PeriodizationBlockPayload>;
export type PeriodizationBlockVersion = BlockVersion<PeriodizationBlockPayload>;

const store = createBlockTemplateStore<PeriodizationBlockPayload>({
  kind: "periodization",
  schema: PeriodizationBlockPayloadSchema as ZodType<PeriodizationBlockPayload>,
  versionsTable: "periodization_block_versions",
  saveRpc: "save_periodization_block_template",
});

export const listPeriodizationBlockTemplates = (coachId: string | null): Promise<PeriodizationBlockTemplate[]> => store.list(coachId);
export const deletePeriodizationBlockTemplate = (id: string, coachId: string) => store.remove(id, coachId);
export const listPeriodizationBlockVersions = (templateId: string): Promise<PeriodizationBlockVersion[]> => store.listVersions(templateId);

/** Salva (cria ou atualiza) a periodização atual como template via RPC atômica. */
export async function savePeriodizationBlockAsTemplate(params: {
  coachId: string;
  name: string;
  periodization: ProtocolPayload["periodization"];
  existingId?: string | null;
}): Promise<string> {
  const name = assertTemplateIdentity(params.coachId, params.name);
  if (!params.periodization?.enabled) {
    throw new Error("Ative a periodização antes de salvar como template");
  }
  const payload = PeriodizationBlockPayloadSchema.parse({
    scope: "periodization",
    periodization: params.periodization,
  });
  return store.saveViaRpc({ coachId: params.coachId, name, payload, existingId: params.existingId });
}

/** Restaura uma versão antiga como o payload ATUAL do template (mantém o nome). */
export async function restorePeriodizationBlockVersion(
  templateId: string,
  coachId: string,
  templateName: string,
  version: PeriodizationBlockVersion,
): Promise<void> {
  await savePeriodizationBlockAsTemplate({
    coachId,
    name: templateName,
    periodization: version.payload.periodization,
    existingId: templateId,
  });
}

/**
 * Aplica um template de periodização ao payload ATUAL do protocolo — semanas
 * (esquema geral) + overrides por exercício, sem tocar em treino, dieta,
 * macros ou suplementos.
 *
 * Os overrides do template são indexados por "<dayKey>_<índice do
 * exercício>", posição que só faz sentido para a estrutura de treino que
 * existia quando o template foi salvo. Aplicar um override cujo dia não
 * existe mais (ou cujo índice caiu fora do novo range de exercícios) no
 * protocolo de DESTINO — porque o split é outro, ou os exercícios do dia
 * mudaram — faria ele recair silenciosamente sobre um exercício errado (o
 * mesmo risco de "override órfão" que `remapDayOverrides`, em
 * workoutExerciseOps.ts, já existe para resolver dentro de UM protocolo).
 * Por isso cada override só é aplicado se o slot "<dayKey>_<índice>" existir
 * de fato nos treinos ATUAIS do destino; os demais são descartados e
 * contados em `skipped`, para a UI avisar o coach do que não pôde ser
 * aplicado.
 */
export function injectPeriodizationBlock(
  payload: ProtocolPayload,
  tpl: PeriodizationBlockPayload,
): { payload: ProtocolPayload; applied: number; skipped: number } {
  const validSlots = new Set<string>();
  const stableSlots = new Map<string, string>();
  for (const day of payload.workouts) {
    day.exercises.forEach((exercise, idx) => {
      const slot = `${day.key}_${idx}`;
      validSlots.add(slot);
      if (exercise.__id) stableSlots.set(exercise.__id, slot);
    });
  }

  let applied = 0;
  let skipped = 0;
  const nextOverrides: ProtocolPayload["periodization"]["overrides"] = {};
  for (const [weekKey, weekMap] of Object.entries(tpl.periodization.overrides || {})) {
    const nextWeekMap: Record<string, unknown> = {};
    for (const [slotId, patch] of Object.entries(weekMap || {})) {
      const targetSlot = patch.exerciseId ? stableSlots.get(patch.exerciseId) : slotId;
      if (targetSlot && validSlots.has(targetSlot)) {
        nextWeekMap[targetSlot] = patch;
        applied++;
      } else {
        skipped++;
      }
    }
    if (Object.keys(nextWeekMap).length > 0) nextOverrides[weekKey] = nextWeekMap;
  }

  const nextPeriodization = {
    ...tpl.periodization,
    overrides: nextOverrides,
  };

  return {
    payload: { ...payload, periodization: nextPeriodization },
    applied,
    skipped,
  };
}
