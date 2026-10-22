// Textos exibidos ao aluno sobre a periodização (faixa da semana e menu
// "Como ler minha periodização"). Edite a redação aqui.
import type { WeekFocusKey } from "@/lib/periodizationDefaults";

export type PhaseKey = "forca" | "qualidade" | "pump";

export function phaseFromFocus(key: WeekFocusKey): PhaseKey {
  if (key === "peso") return "forca";
  if (key === "resistencia") return "pump";
  return "qualidade";
}

export function isDeloadWeek(week: { label?: string; isDeload?: boolean } | null | undefined): boolean {
  if (!week) return false;
  return !!week.isDeload || /deload|descarga/i.test(week.label ?? "");
}

export const PERIODIZATION_LINK_LABEL = "Como ler minha periodização";
export const PERIODIZATION_MENU_TITLE = "Como ler minha periodização";
export const HERE_BADGE = "Você está aqui";

export interface PhaseCopy {
  name: string;
  technicalName: string;
  focus: string;
  summary: string;
  menuTitle: string;
  objective: string;
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
    objective: "Ficar mais forte. É a semana das cargas mais pesadas do ciclo.",
    howTo: [
      { text: "Descanse mais entre as séries, seguindo o tempo indicado na ficha. Aqui o descanso faz parte do treino." },
      { lead: "1º e 2º exercícios do treino:", text: "Use as séries iniciais para subir o peso aos poucos, aquecer o músculo e reconhecer a carga." },
      { lead: "Demais exercícios (já aquecida):", text: "Faça apenas a 1ª série para reconhecer o peso e já inicie as séries válidas." },
      {
        lead: "Última série (série principal):",
        text: "Coloque sua carga máxima. O foco inicial não é bater o topo da faixa (ex.: 8 repetições), mas escolher um peso que te trave quase lá (entre 6 e 7). Evolua com esse peso até dominar as 8 repetições com boa execução — aí você sobe a carga.",
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
    howTo: [
      { text: "Use carga moderada e movimento controlado. Sinta o músculo trabalhando em cada repetição." },
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
    objective: "Encher o músculo de sangue e energia (pump) e estimular o crescimento sem sobrecarregar o corpo.",
    howTo: [
      { text: "Descanso curto entre as séries, seguindo o tempo indicado na ficha. Não espere recuperar totalmente." },
      { text: "Repetições altas, com carga mais leve e movimento fluido." },
      { text: "O peso é leve de propósito: o foco é sentir o músculo cheio e queimando." },
      { text: "Com isso o músculo se reabastece de energia (glicogênio) e chega mais forte ao próximo ciclo." },
    ],
    avoid: "Carregar pesado só porque dá para aguentar. Aqui não é a semana de carga máxima.",
  },
};

export const PHASE_ORDER: PhaseKey[] = ["forca", "qualidade", "pump"];

export const DELOAD_COPY = {
  menuTitle: "Semana de Deload",
  technicalName: "Recuperação Ativa",
  objective: "Descansar articulações e sistema nervoso para supercompensar no próximo ciclo.",
  howTo: "Reduza as cargas e faça as séries longe da falha, focando apenas na execução limpa.",
};

export const MENU_INTRO =
  "Seu treino funciona em ciclos de semanas, e cada semana tem um objetivo diferente. Isso é de propósito: alternar o estímulo faz seu corpo evoluir sem estagnar. Veja o que fazer em cada uma.";

export const LOAD_SECTION = {
  title: "Como subir a carga",
  intro:
    "Seu corpo só cresce e fica mais forte se receber um desafio um pouco maior do que o anterior. Progredir é isso: aos poucos, mais peso ou mais repetições, sempre com boa execução.",
  strengthTitle: "Na Semana de Força (a regra completa)",
  strengthSteps: [
    "Olhe a faixa de repetições da ficha (ex.: 6 a 8).",
    "Na última série, escolha uma carga pesada que faça você parar quase no topo da faixa, com execução aceitável (numa faixa de 6 a 8, travar entre 6 e 7 repetições).",
    "Nos treinos seguintes, mantenha essa carga e busque evoluir até o topo da faixa.",
    "Quando conseguir fazer o topo da faixa (8 repetições, nesse exemplo) com domínio e boa execução, suba a carga no treino seguinte.",
    "Com o peso novo, você voltará a fazer entre 6 e 7 repetições. Aí o ciclo recomeça.",
  ],
  example:
    "Exemplo numa faixa de 6 a 8 repetições: você coloca 30 kg na última série. No Treino 1, trava em 6 repetições. No Treino 2, evolui para 7. No Treino 3, faz as 8 repetições com boa execução. Hora de subir para o próximo peso (ex.: 32 kg ou 35 kg), voltando a fazer cerca de 6 repetições.",
  safetyTitle: "Regras que protegem você",
  safetyRules: [
    "Repetição com postura estragada não conta. Se chegou nas 8 \"roubando\", mantenha a carga até ela ficar limpa.",
    "A última série é a que define se você sobe de peso.",
    "Subir pouco é melhor do que subir muito. Prefira o menor salto de carga disponível no aparelho.",
  ],
  otherTitle: "E nas outras semanas?",
  other: [
    { lead: "Qualidade:", text: "A progressão é a execução. Suba a carga só se continuar sentindo o músculo certo em todas as repetições." },
    { lead: "Pump:", text: "Não busque carga máxima. Se as repetições altas ficaram fáceis demais, suba um pouco o peso, mas sem aumentar o tempo de descanso nem perder o ritmo." },
  ],
};
