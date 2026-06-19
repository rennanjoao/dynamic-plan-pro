export interface SystemTemplate {
  id: string;
  name: string;
  division: "AB" | "ABC" | "ABCD" | "ABCDE";
  profile:
    | "masculino_geral"
    | "masculino_posterior"
    | "feminino_gluteo"
    | "feminino_musculatura";
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
  {
    id: "sys_abc_masc",
    name: "ABC — Masculino Geral",
    division: "ABC",
    profile: "masculino_geral",
    treinos: {
      scope: "full",
      workouts: [
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
      ],
    },
  },
  {
    id: "sys_abcd_masc",
    name: "ABCD — Masculino Geral",
    division: "ABCD",
    profile: "masculino_geral",
    treinos: {
      scope: "full",
      workouts: [
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
          { name: "Pulley baixo triangulo", sets: "3", reps: "10-12", cadence: "2-0-1-0", rest: "75s", notes: "" },
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
      ],
    },
  },
  {
    id: "sys_abc_fem_gluteo",
    name: "ABC — Feminino Foco Glúteo",
    division: "ABC",
    profile: "feminino_gluteo",
    treinos: {
      scope: "full",
      workouts: [
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
      ],
    },
  },
  {
    id: "sys_abcd_fem_gluteo",
    name: "ABCD — Feminino Foco Glúteo",
    division: "ABCD",
    profile: "feminino_gluteo",
    treinos: {
      scope: "full",
      workouts: [
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
      ],
    },
  },
  {
    id: "sys_abc_fem_musc",
    name: "ABC — Feminino Musculatura",
    division: "ABC",
    profile: "feminino_musculatura",
    treinos: {
      scope: "full",
      workouts: [
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
      ],
    },
  },
  {
    id: "sys_abcd_masc_post",
    name: "ABCD — Masculino Foco Posterior",
    division: "ABCD",
    profile: "masculino_posterior",
    treinos: {
      scope: "full",
      workouts: [
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
      ],
    },
  },
];