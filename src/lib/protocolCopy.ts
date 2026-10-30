// src/lib/protocolCopy.ts
//
// Regra ÚNICA de "quais campos do payload pertencem a cada seção" ao copiar
// um protocolo para outro aluno. Antes, o CopyProtocolDialog tinha duas
// versões divergentes dessa regra (alvo com protocolo × alvo sem protocolo) e
// ambas deixavam campos para trás:
//  - Treino levava `workouts` + `periodization`, mas NÃO `weekDays` (mapa
//    dia-da-semana → key do treino), `cardio` nem `restNotes`: o aluno de
//    destino ficava com a semana apontando para treino inexistente.
//  - Dieta levava `carbCycle`, mas NÃO `carbCycleNotes`/percentuais nem o flag
//    `setup.carbCycle` (que é quem liga o ciclo na UI do coach e do aluno).
//  - Diretrizes só eram copiadas quando o destino não tinha protocolo.

import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";

export type CopySection = "workout" | "diet" | "supplements" | "guidelines";

type Fields = { arrays: string[]; values: string[]; setup: string[] };

export const COPY_SECTION_FIELDS: Record<CopySection, Fields> = {
  workout: {
    arrays: ["workouts", "cardio"],
    values: ["periodization", "weekDays", "restNotes"],
    setup: ["split", "trainingDaysPerWeek"],
  },
  diet: {
    arrays: ["meals"],
    values: ["macros", "carbCycle", "carbCycleNotes", "carbCycleHighPct", "carbCycleLowPct"],
    setup: ["mealsCount", "carbCycle"],
  },
  supplements: {
    arrays: ["supplements", "supplementCombos"],
    values: [],
    setup: [],
  },
  guidelines: {
    arrays: [],
    values: ["guidelines", "showGuidelines"],
    setup: [],
  },
};

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * Devolve uma cópia de `base` com as seções escolhidas substituídas pelas de
 * `src`. Seções não escolhidas permanecem exatamente como estão em `base`.
 */
export function copyProtocolSections(
  base: Record<string, unknown>,
  src: Record<string, unknown>,
  sections: Partial<Record<CopySection, boolean>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = clone(base);
  const from: Record<string, unknown> = clone(src);
  const setup: Record<string, unknown> = { ...((next.setup as object) ?? {}) };
  const fromSetup = (from.setup as Record<string, unknown>) ?? {};

  for (const key of Object.keys(COPY_SECTION_FIELDS) as CopySection[]) {
    if (!sections[key]) continue;
    const f = COPY_SECTION_FIELDS[key];
    for (const a of f.arrays) next[a] = (from[a] as unknown[]) ?? [];
    for (const v of f.values) if (from[v] !== undefined) next[v] = from[v];
    for (const s of f.setup) if (fromSetup[s] !== undefined) setup[s] = fromSetup[s];
  }
  next.setup = setup;
  return next;
}

/** Payload vazio e válido, usado como base quando o aluno de destino ainda não tem protocolo. */
export function blankProtocolPayload(): ProtocolPayload {
  return ProtocolPayloadSchema.parse({ setup: {} });
}
