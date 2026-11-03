// Textos exibidos ao aluno sobre a periodização (faixa da semana e menu
// "Como entender meu treino e periodização"). Edite a redação aqui.
//
// Este arquivo é a fonte única do conteúdo: os componentes
// (WorkoutGuideDrawer / PeriodizationGuideDrawer) só renderizam o que está
// aqui. Para mudar uma regra, mude o texto aqui — não nos componentes.
import type { WeekFocusKey } from "@/lib/periodizationDefaults";

export type PhaseKey = "forca" | "qualidade" | "pump";

// Faixa usada nos exemplos de progressão da Semana de Força. Segue o padrão do
// sistema (DEFAULT_WEEKS: "5 a 8 reps"). Para mudar o exemplo, mude só aqui.
export const PROGRESSION_RANGE = { min: 5, top: 8 } as const;
const STUCK_LOW = PROGRESSION_RANGE.min; // início da faixa: onde o aluno trava (5)
const STUCK_HIGH = PROGRESSION_RANGE.min + 1; // ...ou 1 a mais (6)
const TOP = PROGRESSION_RANGE.top; // topo da faixa (8)

export function phaseFromFocus(key: WeekFocusKey): PhaseKey {
  if (key === "peso") return "forca";
  if (key === "resistencia") return "pump";
  return "qualidade";
}

export function isDeloadWeek(week: { label?: string; isDeload?: boolean } | null | undefined): boolean {
  if (!week) return false;
  return !!week.isDeload || /deload|descarga/i.test(week.label ?? "");
}

export const PERIODIZATION_LINK_LABEL = "Como entender meu treino e periodização";
export const PERIODIZATION_MENU_TITLE = "Como entender meu treino e periodização";
export const IMPORTANT_READ_ALERT = "Leitura importante";
export const HERE_BADGE = "Você está aqui";

// ───────────────────────────── Abas do guia ─────────────────────────────

export type GuideTabKey = "semanas" | "carga" | "regras";

export const GUIDE_TABS: { key: GuideTabKey; label: string }[] = [
  { key: "semanas", label: "Semanas" },
  { key: "carga", label: "Subir carga" },
  { key: "regras", label: "Regras" },
];

// ───────────────────────── 1. Regras de ouro do treino ─────────────────────────

export type GoldenRuleKey = "serie-zero" | "falha-tecnica" | "faltou";

export interface GoldenRule {
  key: GoldenRuleKey;
  title: string;
  /** Resumo em 2–3 selos — é o que o aluno vê com o item fechado. */
  chips: string[];
  /** A regra em si (1 frase). */
  rule: string;
  /** "O óbvio que precisa ser dito" — vira o callout de atenção. */
  obvious: string;
}

export const RULES_INTRO =
  "Para extrair o máximo de resultado sem se machucar, siga estas 3 regras de ouro na sua rotina. Toque em cada uma para ver os detalhes.";

export const RULES_OBVIOUS_TITLE = "O óbvio que precisa ser dito";

export const GOLDEN_RULES: GoldenRule[] = [
  {
    key: "serie-zero",
    title: "Série Zero (aquecimento)",
    chips: ["Só no 1º exercício do dia", "Barra ou 5–10 kg", "Não conta na ficha"],
    rule: "No 1º exercício do dia, faça 1 série muito leve (barra ou 5–10 kg) para lubrificar as articulações.",
    obvious:
      "Não precisa fazer nos outros exercícios do dia e não conta nas séries da ficha. Se a ficha pede 3 séries, faça 1 Série Zero + 3 séries valendo.",
  },
  {
    key: "falha-tecnica",
    title: "Falha Técnica",
    chips: ["Postura caiu = acabou", "Roubou = pare"],
    rule: "A série acaba no exato segundo em que você não consegue manter a postura perfeita.",
    obvious:
      "Precisou “roubar”, dar impulso ou entortar o corpo? Pare imediatamente. Repetição feia não conta.",
  },
  {
    key: "faltou",
    title: "Faltou no treino?",
    chips: ["Dia de descanso (ou cardio leve)", "Dieta de Dia de Descanso", "Nunca pule treino"],
    rule: "Tire o dia de descanso (ou cardio leve) e faça a dieta de Dia de Descanso.",
    obvious:
      "Nunca pule um treino. A rotina segue a ordem da ficha, não o dia da semana. Se faltou no treino de Perna hoje, amanhã continua sendo dia de Perna.",
  },
];

// ───────────────────────── 2. Periodização e cargas ─────────────────────────

export const MENU_INTRO =
  "Seu treino funciona em ciclos de semanas, e cada semana tem um objetivo diferente. Isso é de propósito: alternar o estímulo faz seu corpo evoluir sem estagnar. Veja o que fazer em cada uma.";

export const LOAD_ALERT = {
  title: "Você NÃO vai usar o mesmo peso em todas as semanas",
  text: "Diminuir a carga nas semanas de Qualidade e Pump não é ficar mais fraco: é seguir a estratégia para crescer sem lesionar.",
};

export const LADDER_TITLE = "Peso em cada semana";
export const LADDER_BELOW_FORCE = "menos que na Força";
export const OTHER_WEEK_NOTE = "Esta não é a sua semana agora.";
export const AVOID_TITLE = "Erro clássico — evite";
export const HOW_TO_TITLE = "Como fazer";
export const GO_TO_LOAD_LABEL = "Ver como subir a carga";

export interface PhaseCopy {
  name: string;
  technicalName: string;
  focus: string;
  summary: string;
  menuTitle: string;
  objective: string;
  /** Nível de carga relativo (1 = leve, 3 = máxima) — alimenta o medidor visual. */
  load: { level: 1 | 2 | 3; label: string };
  /** 2 selos curtos para escanear a semana em 1 segundo (o peso já aparece no medidor). */
  quick: string[];
  howTo: { lead?: string; text: string }[];
  avoid: string;
}

export const PHASES: Record<PhaseKey, PhaseCopy> = {
  forca: {
    name: "Força",
    technicalName: "Carga Máxima",
    focus: "Ficar mais forte, aumentando a carga.",
    summary:
      "Carga pesada e descanso maior. Comece quase no topo das repetições e, quando evoluir até dominar o topo com boa execução, suba o peso.",
    menuTitle: "Semana de Força",
    objective: "Ficar mais forte. É a única semana do ciclo focada em levantar carga máxima.",
    load: { level: 3, label: "Alto" },
    quick: ["Carga máxima", "Descanso maior"],
    howTo: [
      { lead: "Peso:", text: "alto. Esta é a única semana de carga máxima." },
      { text: "Descanse mais entre as séries, seguindo o tempo indicado na ficha. Aqui o descanso faz parte do treino." },
      { lead: "1º e 2º exercícios do treino:", text: "Use as séries iniciais para subir o peso aos poucos, aquecer o músculo e reconhecer a carga." },
      { lead: "Demais exercícios (já aquecida):", text: "Faça apenas a 1ª série para reconhecer o peso e já inicie as séries válidas." },
      {
        lead: "Última série (série principal):",
        text: `Coloque sua carga máxima: um peso que te trave entre ${STUCK_LOW} e ${STUCK_HIGH} repetições (numa faixa de ${STUCK_LOW} a ${TOP}). Ela decide quando você sobe o peso.`,
      },
    ],
    avoid: "Estragar a postura só para completar uma repetição.",
  },
  qualidade: {
    name: "Qualidade",
    technicalName: "Qualidade Neuromuscular",
    focus: "Executar cada repetição com perfeição e sentir o músculo certo.",
    summary: "Peso moderado e execução perfeita. Falha só na última série de 1 exercício em máquina guiada.",
    menuTitle: "Semana de Qualidade",
    objective: "Treinar o músculo certo, com técnica impecável.",
    load: { level: 2, label: "Moderado" },
    quick: ["Execução lenta", "Sentir o músculo-alvo"],
    howTo: [
      { lead: "Peso:", text: "moderado. Reduza em relação à Semana de Força." },
      { lead: "Execução:", text: "lenta, com controle total do movimento, sentindo apenas o músculo-alvo em cada repetição." },
      { text: "Na maioria dos exercícios, não vá até a falha. Termine cada série ainda com controle." },
      {
        lead: "A exceção:",
        text: "escolha 1 exercício em máquina guiada do treino do dia (aparelhos onde o movimento é fixo — seja de costas, peito, braço ou perna —, sem pesos livres) e vá até a falha só na última série dele.",
      },
    ],
    avoid: "Aumentar a carga às custas da execução.",
  },
  pump: {
    name: "Pump",
    technicalName: "Estresse Metabólico",
    focus: "Encher o músculo de sangue e energia, sem buscar carga máxima.",
    summary: "Descanso curto, muitas repetições e carga mais leve. Aqui o objetivo é o pump.",
    menuTitle: "Semana de Pump",
    objective:
      "Encher o músculo de sangue e glicogênio (pump), gerando crescimento enquanto recupera articulações e tendões.",
    load: { level: 1, label: "Leve a moderado" },
    quick: ["Repetições altas", "Descanso curto"],
    howTo: [
      { lead: "Peso:", text: "leve a moderado. Esqueça a carga da Semana de Força!" },
      { lead: "Repetições altas,", text: "com movimento contínuo e fluido." },
      {
        lead: "Descanso curto:",
        text: "siga o relógio da ficha e comece a próxima série mesmo sem recuperar 100% do fôlego.",
      },
      { lead: "Foco:", text: "sentir o músculo inchado e queimando." },
    ],
    avoid:
      "Tentar usar o peso da Semana de Força. Com peso demais, você não aguenta as repetições altas ou acaba descansando demais — e estraga o estímulo da semana.",
  },
};

export const PHASE_ORDER: PhaseKey[] = ["forca", "qualidade", "pump"];

export const DELOAD_COPY = {
  menuTitle: "Semana de Deload",
  technicalName: "Recuperação Ativa",
  objective: "Descansar articulações e sistema nervoso para supercompensar no próximo ciclo.",
  howTo: "Reduza as cargas e faça as séries longe da falha, focando apenas na execução limpa.",
};

// ───────────────────────── 3. Como subir a carga ─────────────────────────

export interface ProgressionExampleStep {
  label: string;
  load: string;
  /** Repetições feitas na última série (preenche o medidor). */
  reps: number;
  note: string;
  tone: "hold" | "top" | "up";
  badge?: string;
}

export const LOAD_SECTION = {
  title: "Como subir a carga",
  general: "Repetição “roubada” não conta. Quem define se você sobe o peso é sempre a última série.",

  strengthTitle: "Semana de Força",
  strengthSubtitle: `Exemplo com faixa de ${STUCK_LOW} a ${TOP} repetições`,
  strengthSteps: [
    {
      title: "Encontre a carga",
      text: `Na última série, use um peso que faça você travar entre ${STUCK_LOW} e ${STUCK_HIGH} repetições.`,
    },
    {
      title: "Conquiste o topo",
      text: `Nos treinos seguintes, mantenha esse peso até conseguir fazer ${TOP} repetições com postura perfeita.`,
    },
    {
      title: "Suba o peso",
      text: `Bateu ${TOP} repetições limpas? No próximo treino, suba a carga o suficiente (+1 kg a +5 kg) para que o peso novo fique difícil a ponto de impedir você de chegar nas ${TOP}, fazendo você travar de novo entre ${STUCK_LOW} e ${STUCK_HIGH}.`,
      emphasis: `Você não para no ${STUCK_LOW} porque quer: para porque o peso novo não deixa.`,
    },
  ] as { title: string; text: string; emphasis?: string }[],

  example: {
    title: "Exemplo visual",
    subtitle: `Última série, faixa de ${STUCK_LOW} a ${TOP} repetições`,
    total: TOP,
    rangeStart: STUCK_LOW,
    steps: [
      { label: "Treino 1", load: "30 kg", reps: STUCK_LOW, note: `Travou em ${STUCK_LOW}`, tone: "hold" },
      { label: "Treino 2", load: "30 kg", reps: 7, note: "Evoluiu para 7", tone: "hold" },
      { label: "Treino 3", load: "30 kg", reps: TOP, note: `Fez ${TOP} limpas!`, tone: "top", badge: "Topo" },
      {
        label: "Treino 4",
        load: "32 ou 35 kg",
        reps: STUCK_LOW,
        note: `O peso novo faz travar em ${STUCK_LOW} ou ${STUCK_HIGH} de novo`,
        tone: "up",
        badge: "Subiu",
      },
    ] as ProgressionExampleStep[],
  },

  safetyTitle: "Cuidados óbvios",
  safetyRules: [
    `Você não para na ${STUCK_LOW}ª repetição de propósito ao subir o peso: você para porque a carga nova não deixa chegar nas ${TOP} limpas.`,
    `Fez ${TOP} roubando nas últimas? Mantenha o peso.`,
    `Na dúvida, suba pouco peso para não travar abaixo de ${STUCK_LOW}.`,
  ],

  otherTitle: "E nas outras semanas?",
  other: [
    {
      key: "qualidade" as const,
      lead: "Qualidade",
      text: "Só suba um pouco se o movimento continuar 100% controlado, sentindo o músculo certo.",
    },
    {
      key: "pump" as const,
      lead: "Pump",
      text: "Só suba um pouco se terminar as repetições altas sem sentir queimar.",
      inviolable: "Nunca aumente o peso se isso fizer você descansar mais tempo do que pede a ficha.",
    },
  ] as { key: "qualidade" | "pump"; lead: string; text: string; inviolable?: string }[],
  inviolableTitle: "Inviolável",
};
