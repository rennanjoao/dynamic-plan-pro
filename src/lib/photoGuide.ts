/**
 * Como tirar as fotos de avaliação — UM texto só, usado na anamnese e no
 * check-in (antes cada tela dava dicas diferentes). Baseado na Parte 2 do
 * manual de postura do coach: fotos comparáveis = mesma câmera, altura,
 * distância, luz e postura natural, sem espelho, filtro ou grande angular.
 */
export type PhotoGender = "F" | "M" | null | undefined;

export interface PhotoTip {
  icon: string;
  text: string;
}

export function photoGuideTips(gender?: PhotoGender): PhotoTip[] {
  const roupa =
    gender === "F" ? "Top e short de treino (a mesma roupa sempre)"
    : gender === "M" ? "Sunga, boxer ou short de treino (a mesma roupa sempre)"
    : "Roupa justa de treino que mostre ombros, cintura, joelhos e pés (a mesma sempre)";
  return [
    { icon: "🧍", text: "Postura natural: sem estufar o peito, prender a barriga ou empinar o bumbum" },
    { icon: "📐", text: "Câmera reta na altura do quadril, a uns 2 passos (≈1,5 m)" },
    { icon: "🚫", text: "Sem espelho, sem filtro e sem lente 0.5x (grande angular)" },
    { icon: "☀", text: "Mesmo lugar, fundo simples e a mesma luz (nada de contraluz)" },
    { icon: "🩳", text: roupa },
    { icon: "⏰", text: "Mesmo horário, de preferência em jejum" },
    { icon: "🔄", text: "Braços soltos ao lado do corpo; nas costas, sem juntar as escápulas" },
  ];
}

export const PHOTO_GUIDE_TITLE = "📸 Tire sempre do mesmo jeito — é o que permite comparar";
