import { z } from "zod";

export const SPLIT_OPTIONS = [
  { value: "AB", label: "AB" },
  { value: "ABC", label: "ABC" },
  { value: "ABCD", label: "ABCD" },
  { value: "ABCDE", label: "ABCDE" },
  { value: "PPL", label: "Push/Pull/Legs" },
  { value: "UPPER_LOWER", label: "Upper/Lower" },
  { value: "FULLBODY", label: "Full Body" },
] as const;

export type SplitValue = (typeof SPLIT_OPTIONS)[number]["value"];

// Presets de nome de refeição (datalist na UI do coach).
export const MEAL_NAME_PRESETS = [
  "Café da manhã", "Lanche matinal", "Pré-treino",
  "Almoço", "Lanche da tarde", "Jantar", "Ceia",
] as const;

export const WEEKDAYS = [
  { key: "seg", label: "Segunda" },
  { key: "ter", label: "Terça" },
  { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" },
  { key: "sex", label: "Sexta" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
] as const;

export const ExerciseSchema = z.object({
  name: z.string().default(""),
  sets: z.string().default(""),
  reps: z.string().optional().default(""),
  cadence: z.string().optional().default(""),
  rest: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const WorkoutDaySchema = z.object({
  key: z.string(),
  focus: z.string().default(""),
  exercises: z.array(ExerciseSchema).default([]),
});

// Aeróbico associado a um dia de treino ou da semana
export const CardioSchema = z.object({
  type: z.string().default(""),
  duration: z.string().default(""),
  intensity: z.string().default(""),
  workoutKey: z.string().default(""),
  associationType: z.enum(["workout", "weekday"]).default("workout"),
  notes: z.string().default(""),
});

// Periodização (4 semanas) — meta editável por semana + overrides por exercício por semana.
export const WeekMetaSchema = z.object({
  label: z.string().default(""),
  sets: z.string().default(""),
  reps: z.string().default(""),
  rest: z.string().default(""),
  cadence: z.string().default(""),
});

export const ExerciseOverrideSchema = z.object({
  name: z.string().optional(),
  sets: z.string().optional(),
  reps: z.string().optional(),
  cadence: z.string().optional(),
  rest: z.string().optional(),
  notes: z.string().optional(),
});

export const PeriodizationSchema = z.object({
  enabled: z.boolean().default(false),
  weeks: z.array(WeekMetaSchema).length(4).default([
    { label: "Semana 1 — Carga Máxima",            sets: "4 a 5 séries", reps: "5 a 8 reps",   rest: "2 min",      cadence: "1s conc / 2s exc" },
    { label: "Semana 2 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s",  cadence: "1s conc / 1-2s exc" },
    { label: "Semana 3 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s",  cadence: "1s conc / 1-2s exc" },
    { label: "Semana 4 — Estresse Metabólico",     sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30s a 45s",  cadence: "1s conc / 1s exc" },
  ]),
  // Chave externa: índice da semana (0..3); interna: exId no formato "<dayKey>_<exerciseIndex>".
  overrides: z.record(z.record(ExerciseOverrideSchema)).default({}),
});

// Suplemento individual estruturado
export const SupplementSchema = z.object({
  name: z.string().default(""),
  dose: z.string().default(""),
  timing: z.string().default(""),
  notes: z.string().default(""),
  mealRef: z.string().optional().default(""),
});

export const MealMacrosSchema = z.object({
  carbs: z.number().min(0).default(0),
  protein: z.number().min(0).default(0),
  fat: z.number().min(0).default(0),
});

// Food item: name + weight/measure
export const MealFoodItemSchema = z.preprocess(
  (v) => {
    if (typeof v === "string") return { name: v, weight: "" };
    if (!v || typeof v !== "object") return { name: "", weight: "" };
    return v;
  },
  z.object({
    name: z.string().default(""),
    weight: z.string().default(""),
    baseName: z.string().optional(),
    rawWeight: z.number().optional(),
    cookFactor: z.number().optional(),
    isTaco: z.boolean().optional(),
    manualMacros: z.object({
      protein: z.number().default(0),
      carbs: z.number().default(0),
      fat: z.number().default(0),
      kcal: z.number().default(0),
    }).optional(),
  })
);

// items may come as string (legacy) -> wrap into array
const ItemsArraySchema = z.preprocess((v) => {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? [{ name: s, weight: "" }] : [];
  }
  if (!Array.isArray(v)) return [];
  return v;
}, z.array(MealFoodItemSchema).default([]));

export const MealOptionSchema = z.object({
  kind: z.enum(["carb", "protein", "fat"]).default("carb"),
  title: z.string().default(""),
  items: ItemsArraySchema,
});

export const MealSubFoodSchema = MealFoodItemSchema;

export const MealSubstitutionsSchema = z.object({
  carb: z.array(MealSubFoodSchema).default([{ name: "", weight: "" }, { name: "", weight: "" }]),
  protein: z.array(MealSubFoodSchema).default([{ name: "", weight: "" }, { name: "", weight: "" }]),
  fat: z.array(MealSubFoodSchema).default([{ name: "", weight: "" }, { name: "", weight: "" }]),
});

// Default options: 2 of each kind (carb, protein, fat)
function defaultOptions() {
  const mk = (kind: "carb" | "protein" | "fat") => [
    { kind, title: `Opção 1`, items: [{ name: "", weight: "" }] },
    { kind, title: `Opção 2`, items: [{ name: "", weight: "" }] },
  ];
  return [...mk("carb"), ...mk("protein"), ...mk("fat")];
}

// Migrate legacy meal shape (carbs/proteins/fats arrays of string) -> options
const MealPreprocess = (v: any) => {
  if (!v || typeof v !== "object") return v;
  const hasOldArrays =
    Array.isArray(v.carbs) || Array.isArray(v.proteins) ||
    Array.isArray(v.fats) || Array.isArray(v.free);
  const optsLackKind =
    Array.isArray(v.options) && v.options.length > 0 &&
    v.options.every((o: any) => o && typeof o === "object" && !o.kind);
  if (hasOldArrays || optsLackKind || !Array.isArray(v.options)) {
    const toItems = (arr: any) =>
      (Array.isArray(arr) ? arr : [])
        .map((s: any) =>
          typeof s === "string"
            ? { name: s, weight: "" }
            : { name: s?.name ?? "", weight: s?.weight ?? "" }
        )
        .filter((it: any) => it.name);
    const carbItems = toItems(v.carbs);
    const protItems = toItems(v.proteins);
    const fatItems = toItems(v.fats);
    // If legacy options array exists with strings, distribute into carb opt1/2
    const legacyOpts = optsLackKind
      ? (v.options as any[]).map((o) => ({
          title: o?.title ?? "",
          items: typeof o?.items === "string"
            ? (o.items.trim() ? [{ name: o.items, weight: "" }] : [])
            : Array.isArray(o?.items) ? o.items : [],
        }))
      : [];
    const newOpts = [
      {
        kind: "carb",
        title: legacyOpts[0]?.title || "Opção 1",
        items: legacyOpts[0]?.items?.length
          ? legacyOpts[0].items
          : (carbItems.length ? carbItems : [{ name: "", weight: "" }]),
      },
      {
        kind: "carb",
        title: legacyOpts[1]?.title || "Opção 2",
        items: legacyOpts[1]?.items?.length ? legacyOpts[1].items : [{ name: "", weight: "" }],
      },
      { kind: "protein", title: "Opção 1", items: protItems.length ? protItems : [{ name: "", weight: "" }] },
      { kind: "protein", title: "Opção 2", items: [{ name: "", weight: "" }] },
      { kind: "fat", title: "Opção 1", items: fatItems.length ? fatItems : [{ name: "", weight: "" }] },
      { kind: "fat", title: "Opção 2", items: [{ name: "", weight: "" }] },
    ];
    const subs = v.substitutions ?? {};
    const normSub = (arr: any) =>
      (Array.isArray(arr) ? arr : []).map((s: any) =>
        typeof s === "string" ? { name: s, weight: "" } : { name: s?.name ?? "", weight: s?.weight ?? "" }
      );
    const padTo2 = (arr: any[]) => {
      const out = [...arr];
      while (out.length < 2) out.push({ name: "", weight: "" });
      return out.slice(0, Math.max(2, out.length));
    };
    return {
      ...v,
      options: newOpts,
      substitutions: {
        carb: padTo2(normSub(subs.carb)),
        protein: padTo2(normSub(subs.protein)),
        fat: padTo2(normSub(subs.fat)),
      },
    };
  }
  return v;
};

export const MealSchema = z.preprocess(
  MealPreprocess,
  z.object({
    name: z.string().default(""),
    time: z.string().default(""),
    macros: MealMacrosSchema.default({ carbs: 0, protein: 0, fat: 0 }),
    options: z.array(MealOptionSchema).default(defaultOptions()),
    substitutions: MealSubstitutionsSchema.default({
      carb: [{ name: "", weight: "" }, { name: "", weight: "" }],
      protein: [{ name: "", weight: "" }, { name: "", weight: "" }],
      fat: [{ name: "", weight: "" }, { name: "", weight: "" }],
    }),
    carbCycle: z.boolean().default(false),
    notes: z.string().optional().default(""),
    hiddenKinds: z.array(z.enum(["carb", "protein", "fat"])).optional().default([]),
  })
);

// Tolerant carb cycle
const CarbDayEnum = z.enum(["high", "base", "off", "low"]);
const CarbDayTolerant = z.preprocess((v) => {
  if (typeof v !== "string") return "base";
  const s = v.toLowerCase();
  if (s.includes("alto") || s.includes("high") || s.includes("+")) return "high";
  if (s.includes("off") || s.includes("baixo") || s.includes("low") || s.includes("-")) return "off";
  if (CarbDayEnum.safeParse(s).success) return s;
  return "base";
}, CarbDayEnum);

export const ProtocolPayloadSchema = z.object({
  setup: z.object({
    split: z.string().default("ABC"),
    mealsCount: z.number().int().min(2).max(10).default(5),
    carbCycle: z.boolean().default(false),
  }),
  macros: z.object({
    calories: z.number().default(2200),
    protein: z.number().default(160),
    carbs: z.number().default(250),
    fat: z.number().default(55),
    water: z.number().default(3.0),
    goal: z.string().default("hipertrofia"),
  }).default({} as any),
  guidelines: z.object({
    training: z.string().default(""),
    diet: z.string().default(""),
    weekOrganization: z.string().default(""),
    supplementation: z.string().default(""),
  }).default({} as any),
  workouts: z.array(WorkoutDaySchema).default([]),
  meals: z.array(MealSchema).default([]),
  carbCycle: z.record(CarbDayTolerant).default({}),
  carbCycleNotes: z.record(z.string()).default({}),
  carbCycleHighPct: z.number().min(1).max(100).default(15),
  carbCycleLowPct: z.number().min(1).max(100).default(15),
  cardio: z.array(CardioSchema).default([]),
  supplements: z.array(SupplementSchema).default([]),
  periodization: PeriodizationSchema.default({} as any),
});

export type ProtocolPayload = z.infer<typeof ProtocolPayloadSchema>;
export type MealRow = z.infer<typeof MealSchema>;
export type MealOption = z.infer<typeof MealOptionSchema>;
export type MealFoodItem = z.infer<typeof MealFoodItemSchema>;
export type CardioRow = z.infer<typeof CardioSchema>;
export type SupplementRow = z.infer<typeof SupplementSchema>;

export function makeEmptyExercise(): z.infer<typeof ExerciseSchema> {
  return { name: "", sets: "", reps: "", cadence: "", rest: "", notes: "" };
}

export function makeEmptyMeal(name = "Refeição"): z.infer<typeof MealSchema> {
  return {
    name,
    time: "",
    macros: { carbs: 0, protein: 0, fat: 0 },
    options: defaultOptions(),
    substitutions: {
      carb: [{ name: "", weight: "" }, { name: "", weight: "" }],
      protein: [{ name: "", weight: "" }, { name: "", weight: "" }],
      fat: [{ name: "", weight: "" }, { name: "", weight: "" }],
    },
    carbCycle: false,
    notes: "",
  };
}

function splitToWorkoutKeys(split: string): string[] {
  switch (split) {
    case "AB": return ["A", "B"];
    case "ABC": return ["A", "B", "C"];
    case "ABCD": return ["A", "B", "C", "D"];
    case "ABCDE": return ["A", "B", "C", "D", "E"];
    case "PPL": return ["Push", "Pull", "Legs"];
    case "UPPER_LOWER": return ["Upper", "Lower"];
    case "FULLBODY": return ["Full Body"];
    default: return ["A", "B", "C"];
  }
}

export function buildBasePayload(setup: {
  split: SplitValue | string;
  mealsCount: number;
  carbCycle: boolean;
}): ProtocolPayload {
  const workouts = splitToWorkoutKeys(setup.split).map((k) => ({
    key: k,
    focus: "",
    exercises: [makeEmptyExercise()],
  }));
  const meals = Array.from({ length: setup.mealsCount }, (_, i) =>
    makeEmptyMeal(`Refeição ${i + 1}`)
  );
  const carbCycle: Record<string, "high" | "base" | "off"> = {};
  if (setup.carbCycle) {
    WEEKDAYS.forEach((d) => (carbCycle[d.key] = "base"));
  }
  return ProtocolPayloadSchema.parse({
    setup,
    workouts,
    meals,
    carbCycle,
    carbCycleHighPct: 15,
    carbCycleLowPct: 15,
    cardio: [],
    supplements: [],
  });
}
