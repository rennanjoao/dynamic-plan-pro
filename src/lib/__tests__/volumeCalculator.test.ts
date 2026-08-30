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
// 1.1 extractHardSetsCount — filtro fisiológico (reps) e notação "+"
// ─────────────────────────────────────────────────────────────────────────

describe("extractHardSetsCount — filtro neural/lixo (campo reps)", () => {
  const zeroCases: Array<[string, string]> = [
    ["4", "aquecimento"],
    ["4", "warmup"],
    ["4", "warm-up"],
    ["3", "feeder"],
    ["3", "reconhecimento"],
    ["4", "teste de carga"],
    ["2", "tentativa"],
  ];

  it.each(zeroCases)("zera HSE quando reps='%s' contém termo de sensação/abertura ('%s')", (sets, reps) => {
    expect(extractHardSetsCount(sets, reps)).toBe(0);
  });

  it("NÃO zera quando reps menciona RIR ou RPE (são sinal de hard set efetivo, não de aquecimento)", () => {
    expect(extractHardSetsCount("3", "8-10 RIR 2")).toBe(3);
    expect(extractHardSetsCount("4", "RPE 8")).toBe(4);
  });
});

describe("extractHardSetsCount — peso fracionado para força pura/neural", () => {
  it("aplica STRENGTH_WORK_HSE_WEIGHT (0.3) quando reps indica XRM", () => {
    expect(extractHardSetsCount("4", "3RM")).toBeCloseTo(4 * 0.3);
    expect(extractHardSetsCount("2", "1RM")).toBeCloseTo(2 * 0.3);
  });

  it("aplica STRENGTH_WORK_HSE_WEIGHT (0.3) quando reps indica força pura", () => {
    expect(extractHardSetsCount("3", "força")).toBeCloseTo(3 * 0.3);
  });

  it("não confunde palavras contendo 'força' como substring (ex.: 'reforça') com força pura", () => {
    expect(extractHardSetsCount("4", "8-10 reforça o padrão motor")).toBe(4);
  });
});

describe("extractHardSetsCount — peso fracionado para resistência muscular (reps acima do teto de hipertrofia)", () => {
  it("aplica HIGH_REP_ENDURANCE_HSE_WEIGHT (0.5) quando reps ultrapassa o teto (ex.: '3x100')", () => {
    expect(extractHardSetsCount("3", "100")).toBeCloseTo(3 * 0.5);
    expect(extractHardSetsCount("4", "80-100")).toBeCloseTo(4 * 0.5); // pega o maior número do range
  });

  it("NÃO penaliza reps dentro da faixa normal de hipertrofia, mesmo perto do teto", () => {
    expect(extractHardSetsCount("3", "8-12")).toBe(3);
    expect(extractHardSetsCount("4", "20-25")).toBe(4);
    expect(extractHardSetsCount("3", "30")).toBe(3); // exatamente no teto ainda conta cheio
  });

  it("não pune quando reps não tem nenhum número (ex.: 'AMRAP', 'até a falha') — não há como inferir a faixa", () => {
    expect(extractHardSetsCount("3", "AMRAP")).toBe(3);
    expect(extractHardSetsCount("3", "até a falha")).toBe(3);
  });

  it("força pura tem prioridade sobre a checagem de reps altas (são mutuamente exclusivas)", () => {
    expect(extractHardSetsCount("3", "3RM")).toBeCloseTo(3 * 0.3);
  });
});
  it("descarta os segmentos anteriores e usa apenas o último número (ex.: '1+3' -> 3)", () => {
    expect(extractHardSetsCount("1+3")).toBe(3);
    expect(extractHardSetsCount("2+2+3")).toBe(3);
  });

  it("respeita um '0' explícito no último segmento em vez de cair no fallback", () => {
    expect(extractHardSetsCount("3+0")).toBe(0);
  });

  it("cai no número líder da string inteira quando o '+' é usado para anexar uma nota sem número (ex.: dropset)", () => {
    expect(extractHardSetsCount("3x10 + dropset até falha")).toBe(3);
    expect(extractHardSetsCount("4 + rest-pause")).toBe(4);
  });

  it("combina notação '+' com o peso fracionado de força quando aplicável", () => {
    expect(extractHardSetsCount("1+3", "3RM")).toBeCloseTo(3 * 0.3);
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
