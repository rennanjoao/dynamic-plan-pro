// src/lib/workoutTemplates.ts
//
// Ponto único de leitura/escrita da biblioteca de "Templates de Treino"
// (bloco isolado, sem dieta/macros/suplementos). Espelha o padrão já
// estabelecido em protocolTemplates.ts para templates de protocolo
// completo — mesma tabela (`protocols`), discriminada por
// `template_kind = 'workout'`.

import { supabase } from "@/integrations/supabase/client";
import {
  WorkoutBlockPayloadSchema,
  type WorkoutBlockPayload,
  type WorkoutDaySchema,
  type ProtocolPayload,
} from "@/lib/protocolSchema";
import { remapDayOverrides } from "@/lib/workoutExerciseOps";
import { z } from "zod";

type WorkoutDay = z.infer<typeof WorkoutDaySchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocolsAny = () => supabase.from("protocols") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAny = supabase as any;

export type WorkoutBlockTemplate = {
  id: string;
  name: string;
  createdAt: string;
  payload: WorkoutBlockPayload;
  isSystem: boolean;
  division?: string;
  profile?: string;
};

/** Lista os templates de treino visíveis para o coach: os dele + os de sistema (coach_id NULL). */
export async function listWorkoutBlockTemplates(coachId: string | null): Promise<WorkoutBlockTemplate[]> {
  let query = protocolsAny()
    .select("id, name, payload, created_at, coach_id, template_profile, template_division")
    .eq("is_template", true)
    .eq("template_kind", "workout")
    .order("created_at", { ascending: false })
    .limit(150);

  query = coachId
    ? query.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : query.is("coach_id", null);

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): WorkoutBlockTemplate[] => {
    const parsed = WorkoutBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return []; // registro corrompido — não derruba a lista inteira
    return [{
      id: row.id,
      name: row.name,
      createdAt: row.created_at ?? "",
      payload: parsed.data,
      isSystem: row.coach_id === null,
      division: row.template_division ?? undefined,
      profile: row.template_profile ?? undefined,
    }];
  });
}

/**
 * Salva (cria ou atualiza) um bloco de treino como template via RPC atômica
 * (snapshot da versão anterior + escrita, numa só transação).
 */
export async function saveWorkoutBlockAsTemplate(params: {
  coachId: string;
  name: string;
  workouts: WorkoutDay[];
  periodization?: ProtocolPayload["periodization"];
  existingId?: string | null;
}): Promise<string> {
  const { coachId, existingId } = params;
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");
  if (!params.workouts.some((d) => d.exercises.length > 0)) {
    throw new Error("Nenhum exercício para salvar — monte o treino primeiro");
  }

  const payload = WorkoutBlockPayloadSchema.parse({
    scope: "workouts",
    workouts: params.workouts,
    periodization: params.periodization,
  });

  const { data, error } = await supabaseAny.rpc("save_workout_block_template", {
    p_template_id: existingId ?? null,
    p_coach_id: coachId,
    p_name: trimmed,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteWorkoutBlockTemplate(id: string, coachId: string): Promise<void> {
  const { error } = await protocolsAny()
    .delete()
    .eq("id", id)
    .eq("coach_id", coachId)
    .eq("template_kind", "workout");
  if (error) throw error;
}

export type WorkoutBlockVersion = {
  id: string;
  version: number;
  payload: WorkoutBlockPayload;
  createdAt: string;
};

export async function listWorkoutBlockVersions(templateId: string): Promise<WorkoutBlockVersion[]> {
  const { data, error } = await supabaseAny.from("workout_block_versions")
    .select("id, version, payload, created_at")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): WorkoutBlockVersion[] => {
    const parsed = WorkoutBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return [];
    return [{ id: row.id, version: row.version, payload: parsed.data, createdAt: row.created_at }];
  });
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

  return { ...payload, workouts: finalWorkouts, periodization };
}
