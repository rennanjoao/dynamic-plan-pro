// src/lib/periodizationTemplates.ts
//
// Ponto único de leitura/escrita da biblioteca de "Templates de
// Periodização" (bloco isolado — as 4 semanas + overrides por exercício,
// sem treino/dieta/macros). Espelha o mesmo padrão de workoutTemplates.ts /
// dietTemplates.ts — mesma tabela (`protocols`), discriminada por
// `template_kind = 'periodization'`.

import { supabase } from "@/integrations/supabase/client";
import {
  PeriodizationBlockPayloadSchema,
  type PeriodizationBlockPayload,
  type ProtocolPayload,
} from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocolsAny = () => supabase.from("protocols") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAny = supabase as any;

export type PeriodizationBlockTemplate = {
  id: string;
  name: string;
  createdAt: string;
  payload: PeriodizationBlockPayload;
  isSystem: boolean;
};

/** Lista os templates de periodização visíveis para o coach: os dele + os de sistema (coach_id NULL). */
export async function listPeriodizationBlockTemplates(coachId: string | null): Promise<PeriodizationBlockTemplate[]> {
  let query = protocolsAny()
    .select("id, name, payload, created_at, coach_id")
    .eq("is_template", true)
    .eq("template_kind", "periodization")
    .order("created_at", { ascending: false })
    .limit(150);

  query = coachId
    ? query.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : query.is("coach_id", null);

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): PeriodizationBlockTemplate[] => {
    const parsed = PeriodizationBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return []; // registro corrompido — não derruba a lista inteira
    return [{
      id: row.id,
      name: row.name,
      createdAt: row.created_at ?? "",
      payload: parsed.data,
      isSystem: row.coach_id === null,
    }];
  });
}

/**
 * Salva (cria ou atualiza) a periodização atual como template via RPC
 * atômica (snapshot da versão anterior + escrita, numa só transação).
 */
export async function savePeriodizationBlockAsTemplate(params: {
  coachId: string;
  name: string;
  periodization: ProtocolPayload["periodization"];
  existingId?: string | null;
}): Promise<string> {
  const { coachId, existingId } = params;
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");
  if (!params.periodization?.enabled) {
    throw new Error("Ative a periodização antes de salvar como template");
  }

  const payload = PeriodizationBlockPayloadSchema.parse({
    scope: "periodization",
    periodization: params.periodization,
  });

  const { data, error } = await supabaseAny.rpc("save_periodization_block_template", {
    p_template_id: existingId ?? null,
    p_coach_id: coachId,
    p_name: trimmed,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deletePeriodizationBlockTemplate(id: string, coachId: string): Promise<void> {
  const { error } = await protocolsAny()
    .delete()
    .eq("id", id)
    .eq("coach_id", coachId)
    .eq("template_kind", "periodization");
  if (error) throw error;
}

export type PeriodizationBlockVersion = {
  id: string;
  version: number;
  payload: PeriodizationBlockPayload;
  createdAt: string;
};

export async function listPeriodizationBlockVersions(templateId: string): Promise<PeriodizationBlockVersion[]> {
  const { data, error } = await supabaseAny.from("periodization_block_versions")
    .select("id, version, payload, created_at")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): PeriodizationBlockVersion[] => {
    const parsed = PeriodizationBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return [];
    return [{ id: row.id, version: row.version, payload: parsed.data, createdAt: row.created_at }];
  });
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
  for (const day of payload.workouts) {
    day.exercises.forEach((_, idx) => validSlots.add(`${day.key}_${idx}`));
  }

  let applied = 0;
  let skipped = 0;
  const nextOverrides: ProtocolPayload["periodization"]["overrides"] = {};
  for (const [weekKey, weekMap] of Object.entries(tpl.periodization.overrides || {})) {
    const nextWeekMap: Record<string, unknown> = {};
    for (const [slotId, patch] of Object.entries(weekMap || {})) {
      if (validSlots.has(slotId)) {
        nextWeekMap[slotId] = patch;
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

