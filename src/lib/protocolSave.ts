// src/lib/protocolSave.ts
//
// Argumentos da RPC `save_protocol_with_plan`, num só lugar. Antes o mesmo
// `goalMap` + o mapeamento payload→(calorias/macros/água) estavam copiados no
// autosave e no publicar do ProtocolBuilder e, de forma divergente (sem o
// goalMap), no CopyProtocolDialog. `coach_plans.goal` tem CHECK
// ('emagrecer','manter','hipertrofia','recomposicao'), então o valor da UI
// ("emagrecimento", "performance") precisa ser traduzido antes de gravar.

import type { ProtocolPayload } from "@/lib/protocolSchema";

const GOAL_MAP: Record<string, string> = {
  hipertrofia: "hipertrofia",
  emagrecimento: "emagrecer",
  emagrecer: "emagrecer",
  recomposicao: "recomposicao",
  performance: "manter",
  manter: "manter",
};

export function mapGoalForPlan(goal: string | null | undefined): string {
  return GOAL_MAP[(goal ?? "manter").toLowerCase()] ?? "manter";
}

export function buildSaveProtocolArgs(params: {
  protocolId: string | null;
  studentId: string;
  coachId: string;
  name: string;
  payload: ProtocolPayload | Record<string, unknown>;
  active: boolean;
  asDraft: boolean;
  expectedRevision: number | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macros: any = (params.payload as any)?.macros ?? {};
  return {
    p_protocol_id: params.protocolId,
    p_student_id: params.studentId,
    p_coach_id: params.coachId,
    p_name: params.name,
    p_payload: params.payload as unknown as Record<string, unknown>,
    p_active: params.active,
    p_as_draft: params.asDraft,
    p_goal: mapGoalForPlan(macros.goal),
    p_calories: macros.calories ?? 0,
    p_protein: macros.protein ?? 0,
    p_carbs: macros.carbs ?? 0,
    p_fat: macros.fat ?? 0,
    p_water: macros.water ?? 0,
    p_expected_revision: params.expectedRevision,
  };
}
