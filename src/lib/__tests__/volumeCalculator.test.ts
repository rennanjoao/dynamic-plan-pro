import { describe, it, expect } from "vitest";
import type { LibraryEntry } from "@/lib/exerciseLibrary";
import { getHseVolumeLandmark, HSE_UNCONFIGURED_GROUPS } from "@/lib/hseVolumeLandmarks";
import {
  extractHardSetsCount,
  resolveExerciseMuscleGroups,
  getVolumeStatus,
  calculateWeeklyVolume,
  calculateWeeklyVolumeFromPayload,
} from "@/lib/volumeCalculator";

// ─────────────────────────────────────────────────────────────────────────
// Helpers de teste — não fazem parse via Zod de propósito: o motor de
// cálculo precisa tolerar objetos "soltos" (ex. vindos direto do Supabase
// antes da validação), então os testes exercitam exatamente essa forma.
// ─────────────────────────────────────────────────────────────────────────

function libEntry(overrides: Partial<LibraryEntry> & { key: string }): LibraryEntry {
  return {
    displayName: overrides.key,
    aliases: [],
    url: "",
    primaryMuscleGroup: null,
    secondaryMuscleGroups: [],
    ...overrides,
  };
}

function makeLibrary(entries: LibraryEntry[]): Map<string, LibraryEntry> {
  return new Map(entries.map((entry) => [entry.key, entry]));
}

function workoutDay(key: string, exercises: Array<Record<string, unknown>>, focus = "") {
  return { key, focus, exercises };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. extractHardSetsCount — Regex
// ─────────────────────────────────────────────────────────────────────────

describe("extractHardSetsCount", () => {
  const cases: Array<[string, number]> = [
    ["4x12", 4],
    ["3 rest pause", 3],
    ["4", 4],
    ["  5 séries", 5],
    ["3 a 4 séries", 3],
    ["10x8", 10],
    ["0", 0],
    ["x5", 0],
    ["AMRAP", 0],
    ["", 0],
    ["   ", 0],
    ["3.5", 3],
  ];

  it.each(cases)("extractHardSetsCount(%j) === %i", (input, expected) => {
    expect(extractHardSetsCount(input)).toBe(expected);
  });

  it("retorna 0 para undefined e null sem lançar erro", () => {
    expect(extractHardSetsCount(undefined)).toBe(0);
    expect(extractHardSetsCount(null)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. resolveExerciseMuscleGroups — cascata library -> classificador por nome
// ─────────────────────────────────────────────────────────────────────────

describe("resolveExerciseMuscleGroups", () => {
  it("prioriza a library pelo gifKey quando presente e já classificada", () => {
    const library = makeLibrary([
      libEntry({ key: "supino_customizado", primaryMuscleGroup: "peito", secondaryMuscleGroups: ["triceps"] }),
    ]);

    const result = resolveExerciseMuscleGroups(
      { name: "Exercício sem nome reconhecível pelo classificador", gifKey: "supino_customizado" },
      library,
    );

    expect(result).toEqual({ primary: "peito", secondary: ["triceps"], source: "library" });
  });

  it("cai para o nome normalizado na library quando não há gifKey", () => {
    const library = makeLibrary([
      libEntry({
        key: "supino_reto_com_barra",
        primaryMuscleGroup: "peito",
        secondaryMuscleGroups: ["triceps", "ombro"],
      }),
    ]);

    const result = resolveExerciseMuscleGroups({ name: "Supino Reto com Barra", gifKey: undefined }, library);

    expect(result).toEqual({ primary: "peito", secondary: ["triceps", "ombro"], source: "library" });
  });

  it("cai para o classificador por nome quando a library não tem nenhuma entrada correspondente", () => {
    const result = resolveExerciseMuscleGroups({ name: "Rosca Direta com Barra", gifKey: undefined }, makeLibrary([]));

    expect(result?.primary).toBe("biceps");
    expect(result?.source).toBe("name_classifier");
  });

  it("cai para o classificador por nome quando a library tem o gif mas ele ainda não foi classificado", () => {
    const library = makeLibrary([libEntry({ key: "gif_novo_sem_classificacao", primaryMuscleGroup: null })]);

    const result = resolveExerciseMuscleGroups(
      { name: "Supino Reto com Barra", gifKey: "gif_novo_sem_classificacao" },
      library,
    );

    expect(result).toEqual({ primary: "peito", secondary: [], source: "name_classifier" });
  });

  it("retorna null quando nada resolve o grupo muscular", () => {
    const result = resolveExerciseMuscleGroups(
      { name: "Exercício Totalmente Inventado XYZ", gifKey: undefined },
      makeLibrary([]),
    );

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. getVolumeStatus — fronteiras MV/MEV/MAV/MRV
// ─────────────────────────────────────────────────────────────────────────

describe("getVolumeStatus", () => {
  it("classifica as 6 faixas do peito nas fronteiras exatas", () => {
    const peito = getHseVolumeLandmark("peito"); // { mv:4, mev:8, mav:[12,20], mrv:22 }
    expect(peito).not.toBeNull();

    expect(getVolumeStatus(3, peito)).toBe("abaixo_mv");
    expect(getVolumeStatus(4, peito)).toBe("manutencao");
    expect(getVolumeStatus(7.5, peito)).toBe("manutencao");
    expect(getVolumeStatus(8, peito)).toBe("crescimento");
    expect(getVolumeStatus(11.5, peito)).toBe("crescimento");
    expect(getVolumeStatus(12, peito)).toBe("otimo");
    expect(getVolumeStatus(20, peito)).toBe("otimo");
    expect(getVolumeStatus(20.5, peito)).toBe("alerta");
    expect(getVolumeStatus(21.9, peito)).toBe("alerta");
    expect(getVolumeStatus(22, peito)).toBe("acima_mrv");
    expect(getVolumeStatus(30, peito)).toBe("acima_mrv");
  });

  it("retorna sem_landmark para grupos ainda não configurados nesta v1", () => {
    expect(getVolumeStatus(999, null)).toBe("sem_landmark");
    for (const group of HSE_UNCONFIGURED_GROUPS) {
      expect(getHseVolumeLandmark(group)).toBeNull();
    }
  });

  it("caso especial MV === MEV (abdômen): hse = 0 já é 'crescimento', nunca 'abaixo_mv'/'manutencao'", () => {
    const abdomen = getHseVolumeLandmark("abdomen"); // { mv:0, mev:0, mav:[4,12], mrv:16 }
    expect(getVolumeStatus(0, abdomen)).toBe("crescimento");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. calculateWeeklyVolume — matemática de agregação semanal
// ─────────────────────────────────────────────────────────────────────────

describe("calculateWeeklyVolume", () => {
  it("soma 1.0 para o grupo primário e 0.5 para cada grupo secundário", () => {
    const library = makeLibrary([
      libEntry({
        key: "supino_reto_com_barra",
        primaryMuscleGroup: "peito",
        secondaryMuscleGroups: ["triceps", "ombro"],
      }),
    ]);
    const workouts = [workoutDay("A", [{ name: "Supino Reto com Barra", sets: "4x10" }])];

    const report = calculateWeeklyVolume(workouts, { seg: "A" }, library);
    const byGroup = new Map(report.byMuscleGroup.map((row) => [row.group, row.hse]));

    expect(byGroup.get("peito")).toBe(4);
    expect(byGroup.get("triceps")).toBe(2);
    expect(byGroup.get("ombro")).toBe(2);
  });

  it("multiplica pela frequência semanal quando o mesmo workout se repete (split rotativo)", () => {
    const library = makeLibrary([
      libEntry({ key: "supino_reto_com_barra", primaryMuscleGroup: "peito", secondaryMuscleGroups: [] }),
    ]);
    const workouts = [workoutDay("A", [{ name: "Supino Reto com Barra", sets: "4x10" }])];

    // "A" está agendado em 2 dias diferentes da semana (ex.: ABC repetido).
    const report = calculateWeeklyVolume(workouts, { seg: "A", qui: "A" }, library);
    const peito = report.byMuscleGroup.find((row) => row.group === "peito");

    expect(peito?.hse).toBe(8); // 4 séries x 2 ocorrências na semana
  });

  it("não contabiliza um workout que existe mas não está atribuído a nenhum dia da semana", () => {
    const workouts = [
      workoutDay("A", [{ name: "Supino Reto com Barra", sets: "4x10" }]),
      workoutDay("D", [{ name: "Rosca Direta com Barra", sets: "3x12" }]),
    ];

    const report = calculateWeeklyVolume(workouts, { seg: "A" }, makeLibrary([])); // "D" nunca aparece em weekDays
    const biceps = report.byMuscleGroup.find((row) => row.group === "biceps");

    expect(biceps?.hse).toBe(0);
    expect(report.unscheduledWorkoutKeys).toEqual(["D"]);
  });

  it("exclui exercícios de mobilidade do HSE, sem reportá-los como não classificados", () => {
    const workouts = [workoutDay("A", [{ name: "Mobilidade de Quadril", sets: "3x30s", is_mobility: true }])];

    const report = calculateWeeklyVolume(workouts, { seg: "A" }, makeLibrary([]));

    expect(report.mobilityExcludedCount).toBe(1);
    expect(report.unclassifiedExercises).toHaveLength(0);
    expect(report.totalHse).toBe(0);
  });

  it("reporta exercícios com séries prescritas que não puderam ser classificados", () => {
    const workouts = [
      workoutDay("A", [{ name: "Exercício Totalmente Inventado XYZ", sets: "4x10" }], "Peito e Tríceps"),
    ];

    const report = calculateWeeklyVolume(workouts, { seg: "A" }, makeLibrary([]));

    expect(report.unclassifiedExercises).toEqual([
      {
        workoutKey: "A",
        workoutFocus: "Peito e Tríceps",
        exerciseName: "Exercício Totalmente Inventado XYZ",
        rawSets: "4x10",
      },
    ]);
    expect(report.totalHse).toBe(0);
  });

  it("não reporta como não classificado um exercício sem nenhuma série prescrita (linha em branco)", () => {
    const workouts = [workoutDay("A", [{ name: "Exercício Ainda Não Identificável", sets: "" }])];

    const report = calculateWeeklyVolume(workouts, { seg: "A" }, makeLibrary([]));

    expect(report.unclassifiedExercises).toHaveLength(0);
  });

  it("ignora os sentinels de dia sem treino ('' e 'rest') ao contar a frequência semanal", () => {
    const library = makeLibrary([
      libEntry({ key: "supino_reto_com_barra", primaryMuscleGroup: "peito", secondaryMuscleGroups: [] }),
    ]);
    const workouts = [workoutDay("A", [{ name: "Supino Reto com Barra", sets: "4x10" }])];

    const report = calculateWeeklyVolume(workouts, { seg: "A", ter: "rest", qua: "" }, library);
    const peito = report.byMuscleGroup.find((row) => row.group === "peito");

    expect(peito?.hse).toBe(4); // só "seg" conta como ocorrência real
  });

  it("retorna uma linha para todos os grupos musculares do enum, mesmo com hse = 0", () => {
    const report = calculateWeeklyVolume([], {}, makeLibrary([]));

    expect(report.byMuscleGroup.length).toBeGreaterThanOrEqual(14);
    expect(report.byMuscleGroup.every((row) => row.hse === 0)).toBe(true);
    expect(report.totalHse).toBe(0);
  });

  it("lida com workouts e weekDays ausentes (undefined/null) sem lançar erro", () => {
    expect(() => calculateWeeklyVolume(undefined, undefined, makeLibrary([]))).not.toThrow();
    expect(() => calculateWeeklyVolume(null, null, makeLibrary([]))).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. calculateWeeklyVolumeFromPayload — wrapper de conveniência
// ─────────────────────────────────────────────────────────────────────────

describe("calculateWeeklyVolumeFromPayload", () => {
  it("delega para calculateWeeklyVolume usando os campos do payload", () => {
    const library = makeLibrary([
      libEntry({ key: "supino_reto_com_barra", primaryMuscleGroup: "peito", secondaryMuscleGroups: [] }),
    ]);
    const payload = {
      workouts: [workoutDay("A", [{ name: "Supino Reto com Barra", sets: "4x10" }])],
      weekDays: { seg: "A" },
    };

    const report = calculateWeeklyVolumeFromPayload(payload as never, library);

    expect(report.byMuscleGroup.find((row) => row.group === "peito")?.hse).toBe(4);
  });
});
