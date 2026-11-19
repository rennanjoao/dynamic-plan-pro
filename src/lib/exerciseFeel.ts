/**
 * "Onde você sentiu?" — no fim de um exercício de glúteo a aluna toca onde
 * sentiu MAIS. Vira dado para o coach enxergar compensação (a lombar ou o
 * quadríceps "roubando" o estímulo), como no manual de postura: "Você sente a
 * lombar ou o glúteo?" (Parte 9, pergunta de sensação).
 *
 * Decisão do coach: automático nos exercícios de glúteo, opcional para a aluna.
 * As dicas mostradas ao coach vêm do guia de execução dele e do manual
 * (Parte 7 — "Ponte dominada pela lombar", "Quadríceps domina o treino de
 * glúteos"). São sugestões, não diagnóstico.
 */

export type FeltRegion = "gluteo" | "posterior" | "quadriceps" | "lombar";

export const FELT_OPTIONS: { value: FeltRegion; label: string }[] = [
  { value: "gluteo", label: "Glúteo" },
  { value: "posterior", label: "Posterior da coxa" },
  { value: "quadriceps", label: "Coxa da frente" },
  { value: "lombar", label: "Lombar" },
];

export const FELT_LABEL: Record<FeltRegion, string> = {
  gluteo: "Glúteo",
  posterior: "Posterior",
  quadriceps: "Coxa da frente",
  lombar: "Lombar",
};

export function isFeltRegion(v: unknown): v is FeltRegion {
  return v === "gluteo" || v === "posterior" || v === "quadriceps" || v === "lombar";
}

/** Famílias de exercício de glúteo (decide o que é "esperado" sentir). */
export type GluteFamily = "ponte" | "dobradica" | "unilateral" | "isolado";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Ordem importa: a primeira família que casar vence.
const FAMILY_RULES: { family: GluteFamily; patterns: RegExp[] }[] = [
  {
    family: "ponte",
    patterns: [/\bhip thrust/, /\belevacao pelvica/, /\bponte\b/, /\bglute bridge/, /\bfrog pump/],
  },
  {
    family: "dobradica",
    patterns: [/\bstiff\b/, /\brdl\b/, /\bterra romeno/, /\blevantamento terra/, /\bdeadlift/, /\bgood morning/, /\bpull through/],
  },
  {
    family: "unilateral",
    patterns: [/\bbulgaro\b/, /\bafundo\b/, /\bavanco\b/, /\bpassada\b/, /\blunge/, /\bstep up\b/, /\bsubida no (banco|step|caixote)/, /\bagachamento sumo\b/],
  },
  {
    family: "isolado",
    patterns: [/\babdutora\b/, /\babducao\b/, /\bcoice\b/, /\bkickback/, /\bextensao de quadril\b/, /\bgluteo\b/, /\bglute\b/],
  },
];

/** Família de glúteo do exercício, ou null quando não é foco de glúteo. */
export function gluteFamily(exerciseName: string | null | undefined): GluteFamily | null {
  const n = norm(exerciseName ?? "");
  if (!n) return null;
  // Adutora é outro músculo (interno de coxa); "extensora" é quadríceps.
  if (/\badutora\b|\baducao\b|\bextensora\b/.test(n)) return null;
  for (const rule of FAMILY_RULES) {
    if (rule.patterns.some((p) => p.test(n))) return rule.family;
  }
  return null;
}

export const isGluteFocusExercise = (name: string | null | undefined) => gluteFamily(name) !== null;

/** O que é esperado sentir em cada família (o resto pode indicar compensação). */
const EXPECTED: Record<GluteFamily, FeltRegion[]> = {
  ponte: ["gluteo"],
  dobradica: ["gluteo", "posterior"],
  // Em búlgaro/passada o quadríceps também trabalha: só vira alerta se DOMINAR.
  unilateral: ["gluteo"],
  isolado: ["gluteo"],
};

/** Dica para o coach, por família e região que dominou. */
const HINTS: Record<GluteFamily, Partial<Record<FeltRegion, string>>> = {
  ponte: {
    lombar: "Ponte dominada pela lombar: reduzir amplitude e carga, expirar na subida e terminar com o quadril, não com o peito para trás.",
    quadriceps: "Pés muito perto do quadril puxam o quadríceps: afastar um pouco os pés para a frente.",
    posterior: "Pés muito à frente puxam o posterior: trazer os pés um pouco mais perto do quadril.",
  },
  dobradica: {
    lombar: "Lombar assumindo a dobradiça: reduzir carga e amplitude, quadril bem para trás e para cima, peso descendo colado ao corpo.",
    quadriceps: "Joelho dobrando demais vira agachamento: pernas semiestendidas e quadril para trás.",
  },
  unilateral: {
    quadriceps: "Quadríceps roubando o estímulo: diminuir a carga, ajustar a distância do pé, controlar o movimento e focar na conexão (tocar no glúteo).",
    lombar: "Tronco compensando: reduzir a carga, peito estufado e abdômen contraído, controlando a descida.",
  },
  isolado: {
    lombar: "Lombar compensando: amplitude menor e mais lenta — a perna se move sem a pelve abrir nem a curva lombar aumentar.",
    quadriceps: "Outro músculo assumindo: diminuir a carga e focar na conexão (tocar no glúteo durante a execução).",
    posterior: "Posterior assumindo: diminuir a carga e focar na conexão com o glúteo.",
  },
};

export interface FeelRow {
  exercise_key: string;
  exercise_name: string;
  felt: FeltRegion;
  created_at: string;
}

export interface FeelSummary {
  exerciseKey: string;
  exerciseName: string;
  family: GluteFamily | null;
  /** Respostas consideradas (as mais recentes). */
  total: number;
  counts: Partial<Record<FeltRegion, number>>;
  /** Região fora do esperado que está dominando (null = ok ou poucos dados). */
  compensation: FeltRegion | null;
  hint: string | null;
  lastAt: string;
}

/**
 * Resume as respostas por exercício (as `lastN` mais recentes de cada um).
 * Compensação = uma região NÃO esperada aparece em pelo menos 2 respostas e
 * em pelo menos metade delas. Com uma resposta só, nunca acusa nada.
 */
export function summarizeFeel(rows: FeelRow[], lastN = 4): FeelSummary[] {
  const byKey = new Map<string, FeelRow[]>();
  for (const r of rows) {
    if (!isFeltRegion(r.felt) || !r.exercise_key) continue;
    const list = byKey.get(r.exercise_key) ?? [];
    list.push(r);
    byKey.set(r.exercise_key, list);
  }
  const out: FeelSummary[] = [];
  for (const [key, list] of byKey) {
    const recent = [...list]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, lastN);
    const counts: Partial<Record<FeltRegion, number>> = {};
    for (const r of recent) counts[r.felt] = (counts[r.felt] ?? 0) + 1;
    const family = gluteFamily(recent[0].exercise_name);
    const expected = family ? EXPECTED[family] : ["gluteo" as FeltRegion];
    let compensation: FeltRegion | null = null;
    let best = 0;
    for (const region of ["lombar", "quadriceps", "posterior"] as FeltRegion[]) {
      if (expected.includes(region)) continue;
      const c = counts[region] ?? 0;
      if (c >= 2 && c * 2 >= recent.length && c > best) {
        compensation = region;
        best = c;
      }
    }
    const hint = compensation
      ? (family ? HINTS[family][compensation] : null) ??
        "Diminuir a carga, controlar o movimento e focar na conexão com o glúteo."
      : null;
    out.push({
      exerciseKey: key,
      exerciseName: recent[0].exercise_name,
      family,
      total: recent.length,
      counts,
      compensation,
      hint,
      lastAt: recent[0].created_at,
    });
  }
  // Primeiro os que pedem atenção; depois os mais recentes.
  return out.sort((a, b) =>
    (a.compensation ? 0 : 1) - (b.compensation ? 0 : 1) ||
    new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
}
