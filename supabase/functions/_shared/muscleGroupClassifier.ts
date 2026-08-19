// ⚠️ ARQUIVO DUPLICADO — PAR: src/lib/muscleGroupClassifier.ts
// Os dois runtimes (Vite/React e Deno/edge functions) não compartilham bundle,
// por isso este módulo existe em duas cópias. EDITE SEMPRE OS DOIS JUNTOS.
// Há um teste de paridade cobrindo isso: src/lib/__tests__/classifierParity.test.ts
// src/lib/muscleGroupClassifier.ts
//
// Classificador automático de grupo muscular por nome de exercício.
// Não depende de nenhuma alteração em arquivos existentes.
// Usado por: ExerciseLibraryUploader (ao cadastrar exercício novo),
// ExercisePickerInput (quando o coach digita um exercício que ainda
// não existe na biblioteca) e por uma futura tela de revisão no Admin.

export type MuscleGroup =
  | "peito"
  | "costas"
  | "trapezio"
  | "lombar"
  | "ombro"
  | "biceps"
  | "triceps"
  | "antebraco"
  | "quadriceps"
  | "posterior_coxa"
  | "gluteo"
  | "adutores"
  | "panturrilha"
  | "abdomen";

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  trapezio: "Trapézio",
  lombar: "Lombar",
  ombro: "Ombro",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  quadriceps: "Quadríceps",
  posterior_coxa: "Posterior de coxa",
  gluteo: "Glúteo",
  adutores: "Adutores",
  panturrilha: "Panturrilha",
  abdomen: "Abdômen",
};

export const MUSCLE_GROUP_OPTIONS: MuscleGroup[] = [
  "peito", "costas", "trapezio", "lombar", "ombro",
  "biceps", "triceps", "antebraco",
  "quadriceps", "posterior_coxa", "gluteo", "adutores", "panturrilha",
  "abdomen",
];

export interface ClassificationResult {
  primary: MuscleGroup | null;
  secondary: MuscleGroup[];
  matchedKeyword: string | null;
  confidence: "auto" | "unclassified";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A ordem importa: frases compostas/ambíguas primeiro, palavras genéricas
// por último. Isso evita, por exemplo, que "rosca punho" seja classificado
// como bíceps por causa da palavra "rosca" antes de bater na regra mais
// específica de antebraço.
interface Rule {
  keyword: string;
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
}

const RULES: Rule[] = [
  // --- Compostos / casos ambíguos (checar ANTES das regras genéricas) ---
  { keyword: "levantamento terra romeno", primary: "posterior_coxa", secondary: ["gluteo"] },
  { keyword: "stiff", primary: "posterior_coxa", secondary: ["gluteo"] },
  { keyword: "levantamento terra", primary: "costas", secondary: ["posterior_coxa", "gluteo"] },
  { keyword: "supino fechado", primary: "triceps", secondary: ["peito"] },
  { keyword: "mergulho", primary: "triceps", secondary: ["peito"] },
  { keyword: "paralelas", primary: "triceps", secondary: ["peito"] },
  { keyword: "remada alta", primary: "ombro", secondary: ["trapezio"] },
  { keyword: "afundo", primary: "quadriceps", secondary: ["gluteo"] },
  { keyword: "avanco", primary: "quadriceps", secondary: ["gluteo"] },
  { keyword: "passada", primary: "quadriceps", secondary: ["gluteo"] },
  { keyword: "bulgaro", primary: "quadriceps", secondary: ["gluteo"] },
  { keyword: "agachamento", primary: "quadriceps", secondary: ["gluteo"] },
  { keyword: "hack", primary: "quadriceps" },
  { keyword: "pullover", primary: "costas", secondary: ["peito"] },
  { keyword: "pull over", primary: "costas", secondary: ["peito"] },

  // --- Antebraço (checar antes de "rosca" genérico) ---
  { keyword: "rosca de punho", primary: "antebraco" },
  { keyword: "rosca punho", primary: "antebraco" },
  { keyword: "extensao de punho", primary: "antebraco" },
  { keyword: "flexao de punho", primary: "antebraco" },
  { keyword: "antebraco", primary: "antebraco" },

  // --- Panturrilha (checar antes de qualquer "flexao" genérico) ---
  { keyword: "panturrilha", primary: "panturrilha" },
  { keyword: "gemeos", primary: "panturrilha" },
  { keyword: "flexao plantar", primary: "panturrilha" },

  // --- Peito ---
  { keyword: "supino", primary: "peito" },
  { keyword: "crucifixo invertido", primary: "ombro" },
  { keyword: "crucifixo", primary: "peito" },
  { keyword: "crossover", primary: "peito" },
  { keyword: "peck deck", primary: "peito" },
  { keyword: "voador", primary: "peito" },
  { keyword: "flexao de braco", primary: "peito" },
  { keyword: "flexao de peito", primary: "peito" },
  { keyword: "peitoral", primary: "peito" },

  // --- Costas ---
  { keyword: "puxada", primary: "costas" },
  { keyword: "pulldown", primary: "costas" },
  { keyword: "remada", primary: "costas" },
  { keyword: "barra fixa", primary: "costas" },
  { keyword: "pull-up", primary: "costas" },
  { keyword: "pullup", primary: "costas" },
  { keyword: "chin-up", primary: "costas" },
  { keyword: "chinup", primary: "costas" },
  { keyword: "serrote", primary: "costas" },
  { keyword: "graviton", primary: "costas" },
  { keyword: "dorsal", primary: "costas" },

  // --- Trapézio / Lombar ---
  { keyword: "encolhimento", primary: "trapezio" },
  { keyword: "shrug", primary: "trapezio" },
  { keyword: "hiperextensao", primary: "lombar" },
  { keyword: "extensao lombar", primary: "lombar" },
  { keyword: "banco romano", primary: "lombar" },
  { keyword: "good morning", primary: "lombar" },

  // --- Ombro ---
  { keyword: "desenvolvimento", primary: "ombro" },
  { keyword: "elevacao lateral", primary: "ombro" },
  { keyword: "elevacao frontal", primary: "ombro" },
  { keyword: "arnold press", primary: "ombro" },
  { keyword: "face pull", primary: "ombro" },
  { keyword: "deltoide", primary: "ombro" },
  { keyword: "manguito rotador", primary: "ombro" },

  // --- Bíceps ---
  { keyword: "rosca", primary: "biceps" },
  { keyword: "biceps", primary: "biceps" },

  // --- Tríceps ---
  { keyword: "triceps", primary: "triceps" },
  { keyword: "kickback", primary: "triceps" },

  // --- Pernas ---
  { keyword: "leg press", primary: "quadriceps" },
  { keyword: "cadeira extensora", primary: "quadriceps" },
  { keyword: "step up", primary: "quadriceps" },
  { keyword: "mesa flexora", primary: "posterior_coxa" },
  { keyword: "cadeira flexora", primary: "posterior_coxa" },
  { keyword: "flexora", primary: "posterior_coxa" },
  { keyword: "isquiotibiais", primary: "posterior_coxa" },
  { keyword: "elevacao pelvica", primary: "gluteo" },
  { keyword: "hip thrust", primary: "gluteo" },
  { keyword: "coice", primary: "gluteo" },
  { keyword: "gluteo", primary: "gluteo" },
  { keyword: "cadeira abdutora", primary: "gluteo" },
  { keyword: "abducao de quadril", primary: "gluteo" },
  { keyword: "cadeira adutora", primary: "adutores" },
  { keyword: "aducao de quadril", primary: "adutores" },
  { keyword: "adutor", primary: "adutores" },

  // --- Abdômen ---
  { keyword: "abdominal", primary: "abdomen" },
  { keyword: "prancha", primary: "abdomen" },
  { keyword: "elevacao de pernas", primary: "abdomen" },
  { keyword: "obliquo", primary: "abdomen" },
  { keyword: "rotacao de tronco", primary: "abdomen" },
  { keyword: "roda abdominal", primary: "abdomen" },
];

/**
 * Classifica um exercício pelo nome. Nunca lança erro — na ausência de
 * correspondência, retorna confidence: "unclassified" para o chamador
 * decidir se pergunta ao coach ou joga na fila de revisão do admin.
 */
export function classifyExerciseByName(name: string): ClassificationResult {
  const normalized = normalize(name);

  for (const rule of RULES) {
    if (normalized.includes(rule.keyword)) {
      return {
        primary: rule.primary,
        secondary: rule.secondary ?? [],
        matchedKeyword: rule.keyword,
        confidence: "auto",
      };
    }
  }

  return { primary: null, secondary: [], matchedKeyword: null, confidence: "unclassified" };
}