// src/lib/workoutTemplates.ts
//
// Templates de "Treino" (bloco isolado, sem dieta/macros/suplementos).
// CRUD/histórico genéricos vivem em blockTemplates.ts; aqui ficam só o
// schema, a validação pré-save e a injeção no payload.

import {
  WorkoutBlockPayloadSchema,
  type WorkoutBlockPayload,
  type WorkoutDaySchema,
  type ProtocolPayload,
} from "@/lib/protocolSchema";
import { remapDayOverrides } from "@/lib/workoutExerciseOps";
import { pruneOrphanWeekDays } from "@/lib/weekDaysOps";
import { assertTemplateIdentity, createBlockTemplateStore, type BlockTemplate, type BlockVersion } from "@/lib/blockTemplates";
import { z } from "zod";

type WorkoutDay = z.infer<typeof WorkoutDaySchema>;

export type WorkoutBlockTemplate = BlockTemplate<WorkoutBlockPayload> & {
  division?: string;
  profile?: string;
};
export type WorkoutBlockVersion = BlockVersion<WorkoutBlockPayload>;

const store = createBlockTemplateStore<WorkoutBlockPayload, { division?: string; profile?: string }>({
  kind: "workout",
  schema: WorkoutBlockPayloadSchema as z.ZodType<WorkoutBlockPayload>,
  versionsTable: "workout_block_versions",
  saveRpc: "save_workout_block_template",
  extraSelect: "template_profile, template_division",
  mapExtra: (row) => ({
    division: row.template_division ?? undefined,
    profile: row.template_profile ?? undefined,
  }),
});

/** Lista os templates de treino visíveis para o coach: os dele + os de sistema (coach_id NULL). */
export const listWorkoutBlockTemplates = (coachId: string | null): Promise<WorkoutBlockTemplate[]> => store.list(coachId);

export const deleteWorkoutBlockTemplate = (id: string, coachId: string) => store.remove(id, coachId);

export const listWorkoutBlockVersions = (templateId: string): Promise<WorkoutBlockVersion[]> => store.listVersions(templateId);

/** Salva (cria ou atualiza) um bloco de treino como template via RPC atômica. */
export async function saveWorkoutBlockAsTemplate(params: {
  coachId: string;
  name: string;
  workouts: WorkoutDay[];
  periodization?: ProtocolPayload["periodization"];
  existingId?: string | null;
}): Promise<string> {
  const name = assertTemplateIdentity(params.coachId, params.name);
  if (!params.workouts.some((d) => d.exercises.length > 0)) {
    throw new Error("Nenhum exercício para salvar — monte o treino primeiro");
  }
  const payload = WorkoutBlockPayloadSchema.parse({
    scope: "workouts",
    workouts: params.workouts,
    periodization: params.periodization,
  });
  return store.saveViaRpc({ coachId: params.coachId, name, payload, existingId: params.existingId });
}

/** Restaura uma versão antiga como o payload ATUAL do template (mantém o nome). */
export async function restoreWorkoutBlockVersion(
  templateId: string,
  coachId: string,
  templateName: string,
  version: WorkoutBlockVersion,
): Promise<void> {
  await saveWorkoutBlockAsTemplate({
    coachId,
    name: templateName,
    workouts: version.payload.workouts,
    periodization: version.payload.periodization,
    existingId: templateId,
  });
}

/**
 * Injeta um template de treino no payload ATUAL do protocolo, sem tocar em
 * mais nada (dieta, macros, suplementos, guidelines seguem intactos).
 *
 * mode "filled" = aplica os exercícios do template.
 * mode "empty"  = aplica só a estrutura (dias/foco), sem exercícios.
 *
 * A periodização indexa overrides por `${dayKey}_${exerciseIndex}`; por isso,
 * para cada dia substituído, todo índice antigo é tratado como removido
 * (mapeado para `null`) via remapDayOverrides, limpando os overrides do dia.
 */
export function injectWorkoutBlock(
  payload: ProtocolPayload,
  tpl: WorkoutBlockPayload,
  mode: "filled" | "empty" = "filled",
): ProtocolPayload {
  const baseWorkouts = tpl.workouts;
  if (baseWorkouts.length === 0) return payload;

  const finalWorkouts = mode === "filled"
    ? baseWorkouts
    : baseWorkouts.map((d) => ({ key: d.key, focus: d.focus, exercises: [] }));

  const replacedKeys = new Set(finalWorkouts.map((d) => d.key));

  let periodization = payload.periodization;
  if (tpl.periodization) {
    periodization = tpl.periodization;
  } else {
    for (const day of payload.workouts) {
      if (!replacedKeys.has(day.key)) continue; // dia não tocado pelo template
      const allRemoved = new Map(day.exercises.map((_, i): [number, null] => [i, null]));
      periodization = remapDayOverrides(periodization, day.key, allRemoved);
    }
  }

  return pruneOrphanWeekDays({ ...payload, workouts: finalWorkouts, periodization });
}
