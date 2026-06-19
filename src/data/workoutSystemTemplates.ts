// ============================================================
// workoutSystemTemplates.ts
// Acervo de templates do sistema — Elite Prime Hub
// Base: cinesiologia, biomecânica e literatura (ACSM, NSCA,
//       Schoenfeld 2010/2021, Contreras 2014, Escamilla 2009,
//       Tyler 2010 [epicondilite], Cools 2016 [ombro])
// ============================================================

export interface SystemTemplate {
  id: string;
  name: string;
  division: "AB" | "ABC" | "ABCD" | "ABCDE";
  profile:
    | "masculino_geral"
    | "masculino_posterior"
    | "masculino_foco_biceps"
    | "masculino_foco_peito"
    | "masculino_foco_pernas"
    | "masculino_ombro_epicondilite"
    | "feminino_gluteo"
    | "feminino_femoral_gluteo"
    | "feminino_quadriceps_gluteo"
    | "feminino_musculatura"
    | "feminino_superior_ombro"
    | "reabilitacao_ombro"
    | "reabilitacao_joelho_lombar";
  treinos: {
    scope: "full";
    workouts: Array<{
      key: string;
      focus: string;
      exercises: Array<{
        name: string;
        sets: string;
        reps: string;
        cadence: string;
        rest: string;
        notes: string;
      }>;
    }>;
  };
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [

  // ══════════════════════════════════════════════════════════
  // MASCULINO GERAL
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_masc",
    name: "ABC — Masculino Geral",
    division: "ABC",
    profile: "masculino_geral",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito e Bíceps", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "Falha mecânica" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "10-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca alternada halteres", sets: "3", reps: "10", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "B", focus: "Dorsal e Tríceps", exercises: [
        { name: "Puxada frente", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Remada unilateral", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps francês", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Inferiores e Ombros", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Desenvolvimento militar", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "12-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_masc",
    name: "ABCD — Masculino Geral",
    division: "ABCD",
    profile: "masculino_geral",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito e Tríceps", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "10-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps mergulho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "B", focus: "Dorsal e Bíceps", exercises: [
        { name: "Puxada frente", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Pulley baixo triângulo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps e Glúteo", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Posterior e Ombros", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_masc",
    name: "ABCDE — Masculino Geral",
    division: "ABCDE",
    profile: "masculino_geral",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito", exercises: [
        { name: "Supino reto barra", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "Foco na excentrica" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "10-15", cadence: "2-1-1-0", rest: "60s", notes: "Alongar no fundo" },
        { name: "Crossover cabo baixo", sets: "3", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "Contração no topo" },
      ]},
      { key: "B", focus: "Costas", exercises: [
        { name: "Barra fixa pronada", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Puxada supinada", sets: "3", reps: "8-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Ombros", exercises: [
        { name: "Desenvolvimento militar barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral halteres", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Rotação externa no final" },
        { name: "Elevação frontal alternada", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "D", focus: "Pernas", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "E", focus: "Bíceps e Tríceps", exercises: [
        { name: "Rosca direta barra", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca concentrada", sets: "3", reps: "10-12", cadence: "2-1-1-0", rest: "45s", notes: "Pico de contração" },
        { name: "Tríceps pulley corda", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps testa halteres", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // MASCULINO POSTERIOR
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abcd_masc_post",
    name: "ABCD — Masculino Foco Posterior",
    division: "ABCD",
    profile: "masculino_posterior",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Posterior Superior — Costas", exercises: [
        { name: "Barra fixa pronada", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "B", focus: "Posterior Inferior — Isquio", exercises: [
        { name: "Levantamento terra convencional", sets: "4", reps: "4-6", cadence: "3-0-1-0", rest: "120s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Cadeira adutora", sets: "3", reps: "15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Anterior — Peito e Ombros", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps e Panturrilha", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // MASCULINO — FOCO BÍCEPS
  // Base: Schoenfeld 2021 (volume-response), Supination EMG
  // (Naito 1998). Bíceps iniciando o treino da sessão de costas.
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_masc_biceps",
    name: "ABC — Masculino Foco Bíceps",
    division: "ABC",
    profile: "masculino_foco_biceps",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Bíceps → Costas", exercises: [
        { name: "Rosca direta barra", sets: "4", reps: "6-10", cadence: "3-0-1-1", rest: "75s", notes: "Bíceps primeiro — supinação completa no topo" },
        { name: "Rosca concentrada", sets: "3", reps: "10-12", cadence: "2-1-1-0", rest: "60s", notes: "Pico de contração — cotovelo no joelho" },
        { name: "Rosca inclinada halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "60s", notes: "Maior amplitude — cabeça longa" },
        { name: "Puxada supinada", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "Bíceps sinergia com o dorsal" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Rosca martelo cabo", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "Braquial — volume final" },
      ]},
      { key: "B", focus: "Peito e Tríceps", exercises: [
        { name: "Supino reto barra", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley corda", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps francês haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Pernas e Ombros", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Desenvolvimento militar", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_masc_biceps",
    name: "ABCD — Masculino Foco Bíceps",
    division: "ABCD",
    profile: "masculino_foco_biceps",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Bíceps → Costas", exercises: [
        { name: "Rosca direta barra", sets: "4", reps: "6-10", cadence: "3-0-1-1", rest: "75s", notes: "Bíceps primeiro, supinação completa" },
        { name: "Rosca inclinada halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "60s", notes: "Cabeça longa em alongamento" },
        { name: "Rosca concentrada", sets: "3", reps: "10-12", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Puxada frente", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "3", reps: "8-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
      ]},
      { key: "B", focus: "Peito e Tríceps", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps mergulho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Posterior e Ombros", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "Braquiorradial — volume extra" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_masc_biceps",
    name: "ABCDE — Masculino Foco Bíceps",
    division: "ABCDE",
    profile: "masculino_foco_biceps",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Bíceps → Costas", exercises: [
        { name: "Rosca direta barra", sets: "4", reps: "6-10", cadence: "3-0-1-1", rest: "75s", notes: "Bíceps em frescor" },
        { name: "Rosca inclinada halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca concentrada", sets: "3", reps: "10-12", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Puxada frente", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada", sets: "3", reps: "8-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
      ]},
      { key: "B", focus: "Peito", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Crossover cabo baixo", sets: "3", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Ombros e Tríceps", exercises: [
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps francês", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "E", focus: "Posterior de Coxa e Glúteo", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Hip thrust barra", sets: "3", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "Volume extra braquial" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // MASCULINO — FOCO PEITO
  // Base: Barnett 1995 (angulação), Trebs 2016 (overloading),
  // Solari 2018 (cable crossover). Peito abre a sessão.
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_masc_peito",
    name: "ABC — Masculino Foco Peito",
    division: "ABC",
    profile: "masculino_foco_peito",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito — Hipertrofia Prioritária", exercises: [
        { name: "Supino reto barra", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "Foco na excentrica — não trave cotovelos" },
        { name: "Supino inclinado halteres", sets: "4", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "30-45° — ativação clavicular máxima" },
        { name: "Supino declinado máquina", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "Porção esternal inferior" },
        { name: "Crucifixo halteres", sets: "3", reps: "10-15", cadence: "3-1-1-0", rest: "60s", notes: "Alongar no fundo — cotovelo semi-flexo" },
        { name: "Crossover cabo baixo", sets: "3", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "Adução horizontal — peak contraction" },
      ]},
      { key: "B", focus: "Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Desenvolvimento militar", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Equilíbrio agonista-antagonista" },
      ]},
      { key: "C", focus: "Pernas + Braços", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_masc_peito",
    name: "ABCD — Masculino Foco Peito",
    division: "ABCD",
    profile: "masculino_foco_peito",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito — Hipertrofia Prioritária", exercises: [
        { name: "Supino reto barra", sets: "5", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "Volume extra — peito é prioridade" },
        { name: "Supino inclinado halteres", sets: "4", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Crossover cabo baixo", sets: "3", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "" },
        { name: "Supino declinado", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "B", focus: "Costas", exercises: [
        { name: "Barra fixa pronada", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Puxada supinada", sets: "3", reps: "8-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada cavalinho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Saúde do ombro" },
      ]},
      { key: "C", focus: "Quadríceps e Posterior", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Ombros e Braços", exercises: [
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Rosca direta barra", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // MASCULINO — FOCO PERNAS (Front/Back split)
  // Base: Escamilla 2001 (biomecânica agachamento/leg press),
  // Vigotsky 2015 (hip thrust), Ribeiro 2018 (volume pernas).
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abcd_masc_pernas",
    name: "ABCD — Masculino Foco Pernas (Front/Back)",
    division: "ABCD",
    profile: "masculino_foco_pernas",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Quadríceps — Dominante Joelho", exercises: [
        { name: "Agachamento livre", sets: "5", reps: "6-10", cadence: "3-0-1-0", rest: "120s", notes: "Volume prioritário — foco no quad" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "90s", notes: "Pés na posição média" },
        { name: "Hack agachamento", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "4", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "Peak contraction no topo" },
        { name: "Afundo caminhada", sets: "3", reps: "12/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "5", reps: "15-20", cadence: "2-0-2-0", rest: "30s", notes: "" },
      ]},
      { key: "B", focus: "Posterior — Isquio e Glúteo", exercises: [
        { name: "Levantamento terra convencional", sets: "4", reps: "5-8", cadence: "3-0-1-0", rest: "120s", notes: "Carga principal — dominante quadril" },
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "Isquio em alongamento" },
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "75s", notes: "Contração glúteo no topo" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-2-0", rest: "30s", notes: "Sóleo" },
      ]},
      { key: "C", focus: "Superior — Peito e Tríceps", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps francês", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "D", focus: "Superior — Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Desenvolvimento militar", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_masc_pernas",
    name: "ABCDE — Masculino Foco Pernas",
    division: "ABCDE",
    profile: "masculino_foco_pernas",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Quadríceps", exercises: [
        { name: "Agachamento livre", sets: "5", reps: "6-10", cadence: "3-0-1-0", rest: "120s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Cadeira extensora", sets: "4", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "5", reps: "15-20", cadence: "2-0-2-0", rest: "30s", notes: "" },
      ]},
      { key: "B", focus: "Posterior e Glúteo", exercises: [
        { name: "Levantamento terra convencional", sets: "4", reps: "5-8", cadence: "3-0-1-0", rest: "120s", notes: "" },
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-2-0", rest: "30s", notes: "" },
      ]},
      { key: "C", focus: "Peito e Tríceps", exercises: [
        { name: "Supino reto", sets: "4", reps: "6-10", cadence: "4-0-2-0", rest: "90s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps pulley", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps francês", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "D", focus: "Costas e Bíceps", exercises: [
        { name: "Barra fixa pronada", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Remada curvada barra", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Puxada supinada", sets: "3", reps: "8-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "8-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "E", focus: "Ombros", exercises: [
        { name: "Desenvolvimento militar", sets: "4", reps: "6-10", cadence: "2-0-1-0", rest: "90s", notes: "" },
        { name: "Elevação lateral", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
        { name: "Elevação frontal alternada", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // MASCULINO — OMBRO + EPICONDILITE LATERAL
  // Base: Tyler 2010 (eccentric wrist ext), Cools 2016
  // (serrátil/trapézio inferior), Reinold 2009 (RC).
  // Excluídos: curl supinado pesado, pronação forcada,
  // wrist flexion com carga. Preferência: supinação neutra,
  // extensão excêntrica, grip neutro.
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_masc_epicondilite",
    name: "ABC — Masculino Ombro + Epicondilite",
    division: "ABC",
    profile: "masculino_ombro_epicondilite",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Costas — Grip Neutro (sem torque em varo)", exercises: [
        { name: "Puxada grip neutro paralelo", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "Grip neutro reduz torque varo no cotovelo" },
        { name: "Remada unilateral haltere", sets: "4", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "Cotovelo alinhado ao tronco — grip neutro" },
        { name: "Remada máquina assento", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "Evita rotação de antebraço sob carga" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Trapézio inferior + manguito rotador" },
        { name: "Extensão de punho excêntrica", sets: "3", reps: "15", cadence: "0-0-3-0", rest: "45s", notes: "Tyler 2010 — 3s fase excêntrica, carga leve" },
        { name: "Flexão de punho supinada leve", sets: "2", reps: "15", cadence: "2-0-1-0", rest: "30s", notes: "Fortalecimento antebraço — sem dor" },
      ]},
      { key: "B", focus: "Peito e Ombros — Sem Elevação Acima da Cabeça", exercises: [
        { name: "Supino reto halteres", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "Halteres permitem ajuste de rotação — menos torque" },
        { name: "Supino inclinado máquina", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral halteres", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "Até 80° — não acima da cabeça" },
        { name: "Rotação externa cabo neutro", sets: "3", reps: "15", cadence: "2-0-1-1", rest: "45s", notes: "Manguito rotador — infra e redondo menor" },
        { name: "Serrátil anterior — punch press", sets: "3", reps: "15", cadence: "2-0-1-1", rest: "45s", notes: "Cools 2016 — protração escapular controlada" },
      ]},
      { key: "C", focus: "Pernas — Membros Inferiores Livre", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90-120s", notes: "Sem restrição — MMII livre" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // REABILITAÇÃO — OMBRO (ambos sexos)
  // Base: Reinold 2009, Cools 2016, Escamilla 2009 (serrátil),
  // Kibler 2013 (cintura escapular).
  // EXCLUÍDOS: qualquer exercício acima da cabeça (overhead
  // press, pull over, elevação frontal acima 90°, lat pulldown
  // atrás da nuca). Ênfase: trapézio inferior, serrátil anterior,
  // manguito rotador, romboides.
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_reab_ombro",
    name: "ABC — Reabilitação de Ombro",
    division: "ABC",
    profile: "reabilitacao_ombro",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Estabilizadores Escapulares + Manguito", exercises: [
        { name: "Rotação externa cabo (neutro)", sets: "3", reps: "15-20", cadence: "2-0-1-2", rest: "45s", notes: "Cotovelo 90° junto ao tronco — infra-espinal e redondo menor" },
        { name: "Face pull corda", sets: "4", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Puxar até testa — trapézio inferior e rotação externa" },
        { name: "Serrátil — punch press cabo", sets: "3", reps: "15", cadence: "2-0-2-1", rest: "45s", notes: "Protração escapular — serrátil anterior" },
        { name: "\"Y\" no banco inclinado", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "45s", notes: "Trapézio inferior — halteres leves, polegares para cima" },
        { name: "\"T\" no banco inclinado", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "45s", notes: "Deltóide posterior + rombóides" },
        { name: "Rotação interna cabo leve", sets: "2", reps: "15", cadence: "2-0-1-0", rest: "30s", notes: "Subescapular — equilíbrio agonista-antagonista" },
      ]},
      { key: "B", focus: "Costas (sem overhead) + Mobilidade", exercises: [
        { name: "Remada unilateral haltere", sets: "4", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "Cotovelo junto — sem elevação escapular" },
        { name: "Remada máquina assento grip neutro", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Puxada frente grip neutro paralelo", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "Não atrás da nuca — risco impingement" },
        { name: "Elevação lateral até 80°", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "Polegar para cima (empty can alternativo — sem dor)" },
        { name: "Mobilidade glenoumeral — rotação", sets: "3", reps: "10", cadence: "lento", rest: "30s", notes: "Pendular e rotação ativa — manter amplitude sem dor" },
        { name: "Alongamento peitoral menor", sets: "3", reps: "30s", cadence: "estático", rest: "30s", notes: "Antepulsão → retração — liberar encurtamento anterior" },
      ]},
      { key: "C", focus: "Membros Inferiores — Sem Restrição", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Hip thrust barra", sets: "3", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_reab_ombro",
    name: "ABCD — Reabilitação de Ombro",
    division: "ABCD",
    profile: "reabilitacao_ombro",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Manguito Rotador + Serrátil", exercises: [
        { name: "Rotação externa cabo (neutro)", sets: "4", reps: "15-20", cadence: "2-0-1-2", rest: "45s", notes: "Infra-espinal + redondo menor" },
        { name: "Face pull corda", sets: "4", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Trapézio inferior + rotação externa" },
        { name: "\"Y\" no banco inclinado", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "45s", notes: "Trapézio inferior — halteres leves" },
        { name: "\"T\" no banco inclinado", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "45s", notes: "Rombóides + deltóide posterior" },
        { name: "Serrátil — punch press cabo", sets: "3", reps: "15", cadence: "2-0-2-1", rest: "45s", notes: "Protração escapular controlada" },
        { name: "Rotação interna cabo leve", sets: "2", reps: "15", cadence: "2-0-1-0", rest: "30s", notes: "Equilíbrio subescapular" },
      ]},
      { key: "B", focus: "Costas Sem Overhead", exercises: [
        { name: "Remada unilateral haltere", sets: "4", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Puxada grip neutro paralelo", sets: "4", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada cavalinho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral até 80°", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "Polegar para cima" },
      ]},
      { key: "C", focus: "Quadríceps", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Posterior e Glúteo", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Hip thrust barra", sets: "4", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // REABILITAÇÃO — JOELHO + LOMBAR
  // Base: Escamilla 2001 (joelho), McGill 2010 (lombar),
  // Luber 2018 (glúteo médio joelho valgo).
  // EXCLUÍDOS: agachamento profundo com carga, leg press >90°
  // de joelho, extensora com dor, deadlift convencional pesado,
  // flexões lombares sob carga. Ênfase: glúteo médio, VMO,
  // core antiflexão, cadeia posterior controlada.
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_reab_joelho_lombar",
    name: "ABC — Reabilitação Joelho e Lombar",
    division: "ABC",
    profile: "reabilitacao_joelho_lombar",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo Médio + VMO + Core", exercises: [
        { name: "Abdução quadril deitado", sets: "3", reps: "15-20", cadence: "2-0-1-2", rest: "45s", notes: "Glúteo médio — controle valgo do joelho" },
        { name: "Agachamento sumô parcial goblet", sets: "3", reps: "12-15", cadence: "3-0-1-0", rest: "75s", notes: "Até 60° joelho — sem dor — haltere no peito" },
        { name: "Cadeira extensora amplitude parcial", sets: "3", reps: "15", cadence: "2-0-2-1", rest: "60s", notes: "0–60° — ativa VMO sem impacto patelar" },
        { name: "Prancha frontal isométrica", sets: "3", reps: "30-45s", cadence: "isométrico", rest: "60s", notes: "McGill — antiflexão lombar" },
        { name: "Bird-dog", sets: "3", reps: "10/lado", cadence: "3-0-3-0", rest: "45s", notes: "Extensão controlada — multífido + glúteo" },
        { name: "Ponte de glúteo unilateral", sets: "3", reps: "12/lado", cadence: "2-0-1-2", rest: "45s", notes: "Controle pélvico lateral — glúteo médio" },
      ]},
      { key: "B", focus: "Posterior Sem Flexão Lombar + Superior", exercises: [
        { name: "Hip thrust barra (amplitude controlada)", sets: "4", reps: "12-15", cadence: "2-0-1-2", rest: "75s", notes: "Sem hiperextensão lombar no topo" },
        { name: "Levantamento terra romeno leve", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "90s", notes: "Carga baixa — manter coluna neutra sempre" },
        { name: "Flexora sentada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "Sentada reduz torque lombar vs deitada" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Supino máquina", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Elevação lateral halteres", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Membros Inferiores — Cadeia Cinética Fechada", exercises: [
        { name: "Step-up banco baixo", sets: "3", reps: "12/leg", cadence: "2-0-1-0", rest: "60s", notes: "Banco 20-25 cm — carga em VM e glúteo" },
        { name: "Leg press amplitude parcial (0-70°)", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "Amplitude segura — sem dor patelar" },
        { name: "Afundo reverso (retrostep)", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "Afundo para trás — menos shear patelar que o frontal" },
        { name: "Abdução quadril máquina", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "Glúteo médio — prevenção valgo" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-2-0", rest: "30s", notes: "" },
        { name: "Alongamento cadeia posterior", sets: "3", reps: "30s", cadence: "estático", rest: "30s", notes: "Isquio + panturrilha — mobilidade lombo-pélvica" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // FEMININO GLÚTEO — GERAL
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_fem_gluteo",
    name: "ABC — Feminino Foco Glúteo",
    division: "ABC",
    profile: "feminino_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo e Posterior", exercises: [
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "Contração no topo" },
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Abdução sentada", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "B", focus: "Superior — Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Supino máquina", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps e Glúteo", exercises: [
        { name: "Agachamento sumô haltere", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "Pés altos e largos" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_fem_gluteo",
    name: "ABCD — Feminino Foco Glúteo",
    division: "ABCD",
    profile: "feminino_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo — Quadril Dominante", exercises: [
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "Contração no topo" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada máquina", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "B", focus: "Posterior de Coxa", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "C", focus: "Superior — Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps e Panturrilha", exercises: [
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "Pés altos e largos" },
        { name: "Agachamento hack", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_fem_gluteo",
    name: "ABCDE — Feminino Foco Glúteo",
    division: "ABCDE",
    profile: "feminino_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo — Hip Dominante", exercises: [
        { name: "Hip thrust barra", sets: "5", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "Volume prioritário" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada máquina", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "B", focus: "Posterior de Coxa", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Superior — Costas", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Remada máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
      { key: "E", focus: "Superior — Ombros e Peito (manutenção)", exercises: [
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Supino máquina", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // FEMININO GLÚTEO — SUPERIOR COM ÊNFASE EM OMBRO
  // Superior reduzido: manutenção dos demais grupos,
  // ombros com volume maior para estética de cintura.
  // Base: Schoenfeld 2010 (deltóide), Contreras 2014 (glúteo).
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_fem_gluteo_ombro",
    name: "ABC — Feminino Glúteo + Ombro",
    division: "ABC",
    profile: "feminino_superior_ombro",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo e Posterior", exercises: [
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "Prioridade glúteo" },
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "B", focus: "Ombros (prioritário) + Costas manutenção", exercises: [
        { name: "Desenvolvimento máquina", sets: "4", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "Ombro em prioridade — volume maior" },
        { name: "Elevação lateral halteres", sets: "4", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "Deltóide médio — silhueta" },
        { name: "Face pull corda", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "Deltóide posterior + saúde escapular" },
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "Costas — manutenção" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "Costas — manutenção" },
        { name: "Supino máquina", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "Peito — manutenção mínima" },
      ]},
      { key: "C", focus: "Quadríceps e Glúteo", exercises: [
        { name: "Agachamento sumô", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "Pés altos e largos" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_fem_gluteo_ombro",
    name: "ABCD — Feminino Glúteo + Ombro",
    division: "ABCD",
    profile: "feminino_superior_ombro",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Glúteo — Hip Dominante", exercises: [
        { name: "Hip thrust barra", sets: "5", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada máquina", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "B", focus: "Ombros — Prioritário", exercises: [
        { name: "Desenvolvimento máquina", sets: "4", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "Volume principal" },
        { name: "Elevação lateral halteres", sets: "5", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "Deltóide médio — maior volume" },
        { name: "Face pull corda", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
        { name: "Elevação frontal alternada", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Puxada frente", sets: "2", reps: "12-15", cadence: "3-0-1-0", rest: "60s", notes: "Costas — manutenção" },
        { name: "Supino máquina", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "Peito — manutenção" },
      ]},
      { key: "C", focus: "Posterior de Coxa", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps", exercises: [
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Agachamento hack", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // FEMININO — FEMORAL E GLÚTEO (Quadríceps Predominante)
  // = Joelho dominante com ênfase em quad + glúteo médio.
  // Base: Escamilla 2001 (leg press feet position),
  // Contreras 2014 (hip thrust vs squat).
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_fem_quad_gluteo",
    name: "ABC — Feminino Quadríceps e Glúteo",
    division: "ABC",
    profile: "feminino_quadriceps_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Quadríceps — Joelho Dominante", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "Prioridade quad — joelho sobre ponta do pé" },
        { name: "Leg press 45° pés baixos e médios", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "Pés na posição inferior — maior quad" },
        { name: "Hack agachamento", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "4", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "VMO — 0-90° sem dor" },
        { name: "Abdução quadril máquina", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "Glúteo médio — controle valgo" },
      ]},
      { key: "B", focus: "Glúteo + Posterior Complementar", exercises: [
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Afundo reverso", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "Menor shear patelar que afundo frontal" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "C", focus: "Superior — Manutenção", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Supino máquina", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_fem_quad_gluteo",
    name: "ABCD — Feminino Quadríceps e Glúteo",
    division: "ABCD",
    profile: "feminino_quadriceps_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Quadríceps Prioritário", exercises: [
        { name: "Agachamento livre", sets: "5", reps: "8-12", cadence: "3-0-1-0", rest: "90s", notes: "Volume máximo quad" },
        { name: "Leg press 45° pés baixos", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Hack agachamento", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "4", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "B", focus: "Glúteo — Hip Dominante", exercises: [
        { name: "Hip thrust barra", sets: "5", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Afundo reverso", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "C", focus: "Superior — Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "D", focus: "Posterior de Coxa", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // FEMININO — FEMORAL E GLÚTEO (Femoral Predominante)
  // = Quadril dominante com ênfase em isquio + glúteo máximo.
  // Base: Contreras 2014 (hip thrust), Vigotsky 2015,
  // Schoenfeld 2021 (RDL vs leg curl).
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_fem_femoral_gluteo",
    name: "ABC — Feminino Femoral e Glúteo",
    division: "ABC",
    profile: "feminino_femoral_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Femoral + Glúteo — Quadril Dominante", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "Prioridade — isquio em alongamento máximo" },
        { name: "Hip thrust barra", sets: "4", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "Glúteo — dominância quadril" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "Isquio + lombar" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "Isquio em encurtamento — curl" },
        { name: "Extensão de quadril cabo", sets: "3", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "Glúteo médio" },
      ]},
      { key: "B", focus: "Superior — Manutenção", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Supino máquina", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps — Complementar", exercises: [
        { name: "Agachamento sumô haltere", sets: "3", reps: "10-15", cadence: "3-0-1-0", rest: "75s", notes: "Sumô ativa mais adutor + glúteo" },
        { name: "Leg press 45° pés altos e largos", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "Pés altos transferem força p/ glúteo/posterior" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_fem_femoral_gluteo",
    name: "ABCD — Feminino Femoral e Glúteo",
    division: "ABCD",
    profile: "feminino_femoral_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Femoral — Isquio Prioritário", exercises: [
        { name: "Levantamento terra romeno", sets: "5", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "Volume máximo — isquio em alongamento" },
        { name: "Stiff halteres", sets: "4", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "B", focus: "Glúteo — Hip Dominante", exercises: [
        { name: "Hip thrust barra", sets: "5", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "4", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "C", focus: "Superior — Costas e Ombros", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps — Complementar", exercises: [
        { name: "Leg press 45° pés altos", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Agachamento hack", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Afundo reverso", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_fem_femoral_gluteo",
    name: "ABCDE — Feminino Femoral e Glúteo",
    division: "ABCDE",
    profile: "feminino_femoral_gluteo",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Femoral Prioritário", exercises: [
        { name: "Levantamento terra romeno", sets: "5", reps: "6-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Stiff halteres", sets: "4", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "60s", notes: "" },
        { name: "Afundo búlgaro", sets: "3", reps: "10/leg", cadence: "2-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "B", focus: "Glúteo — Hip Dominante", exercises: [
        { name: "Hip thrust barra", sets: "5", reps: "8-12", cadence: "2-0-1-2", rest: "90s", notes: "" },
        { name: "Extensão de quadril cabo", sets: "4", reps: "12-15", cadence: "2-0-1-2", rest: "60s", notes: "" },
        { name: "Abdução sentada", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Agachamento sumô", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps", exercises: [
        { name: "Leg press 45° pés altos", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Agachamento hack", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Superior — Costas", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Remada máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
      { key: "E", focus: "Superior — Ombros (manutenção)", exercises: [
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Supino máquina", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
    ]},
  },

  // ══════════════════════════════════════════════════════════
  // FEMININO MUSCULATURA
  // ══════════════════════════════════════════════════════════
  {
    id: "sys_abc_fem_musc",
    name: "ABC — Feminino Musculatura",
    division: "ABC",
    profile: "feminino_musculatura",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito, Ombros e Tríceps", exercises: [
        { name: "Supino máquina", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Tríceps corda", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "B", focus: "Dorsal e Bíceps", exercises: [
        { name: "Puxada frente", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada cavalinho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Inferiores Completo", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Hip thrust", sets: "3", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Leg press", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Flexora deitada", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcd_fem_musc",
    name: "ABCD — Feminino Musculatura",
    division: "ABCD",
    profile: "feminino_musculatura",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito e Tríceps", exercises: [
        { name: "Supino máquina", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Tríceps corda", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Tríceps testa haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
      ]},
      { key: "B", focus: "Costas e Bíceps", exercises: [
        { name: "Puxada frente", sets: "4", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Remada cavalinho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Rosca martelo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Quadríceps e Glúteo", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Leg press 45°", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Cadeira extensora", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "D", focus: "Posterior e Ombros", exercises: [
        { name: "Hip thrust barra", sets: "4", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Levantamento terra romeno", sets: "3", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
    ]},
  },
  {
    id: "sys_abcde_fem_musc",
    name: "ABCDE — Feminino Musculatura",
    division: "ABCDE",
    profile: "feminino_musculatura",
    treinos: { scope: "full", workouts: [
      { key: "A", focus: "Peito", exercises: [
        { name: "Supino máquina", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Supino inclinado halteres", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Crucifixo máquina", sets: "3", reps: "12-15", cadence: "2-1-1-0", rest: "60s", notes: "" },
        { name: "Crossover cabo baixo", sets: "3", reps: "12-15", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
      { key: "B", focus: "Costas", exercises: [
        { name: "Puxada frente", sets: "4", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Remada unilateral haltere", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Remada cavalinho", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Face pull", sets: "3", reps: "15-20", cadence: "2-0-1-1", rest: "45s", notes: "" },
      ]},
      { key: "C", focus: "Ombros e Braços", exercises: [
        { name: "Desenvolvimento máquina", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Elevação lateral", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Rosca direta", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Tríceps corda", sets: "3", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
        { name: "Rosca martelo", sets: "2", reps: "12-15", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
      { key: "D", focus: "Quadríceps e Glúteo", exercises: [
        { name: "Agachamento livre", sets: "4", reps: "10-15", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Leg press 45°", sets: "4", reps: "12-15", cadence: "2-0-1-0", rest: "75s", notes: "" },
        { name: "Hip thrust barra", sets: "3", reps: "10-15", cadence: "2-0-1-2", rest: "75s", notes: "" },
        { name: "Panturrilha em pé", sets: "4", reps: "15-20", cadence: "2-0-1-0", rest: "30s", notes: "" },
      ]},
      { key: "E", focus: "Posterior de Coxa", exercises: [
        { name: "Levantamento terra romeno", sets: "4", reps: "8-10", cadence: "3-0-1-0", rest: "90s", notes: "" },
        { name: "Flexora deitada", sets: "4", reps: "10-15", cadence: "2-0-1-0", rest: "60s", notes: "" },
        { name: "Stiff halteres", sets: "3", reps: "10-12", cadence: "3-0-1-0", rest: "75s", notes: "" },
        { name: "Abdução sentada", sets: "3", reps: "15-20", cadence: "2-0-1-0", rest: "45s", notes: "" },
      ]},
    ]},
  },
];
