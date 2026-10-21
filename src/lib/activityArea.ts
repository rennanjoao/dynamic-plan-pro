export type ActivityArea = "treino" | "dieta" | "suplementos" | "evolucao" | "area_aluno" | "outros";

const MAP: Record<string, ActivityArea> = {
  "/workout-plan": "treino",
  "/routine": "dieta",
  "/shopping-list": "dieta",
  "/supplements": "suplementos",
  "/evolution": "evolucao",
  "/check-in": "evolucao",
  "/student-area": "area_aluno",
  "/student": "area_aluno",
  "/daily": "area_aluno",
};

/** Área do app do aluno para uma rota; null quando a rota não é do aluno. */
export function activityAreaForPath(pathname: string): ActivityArea | null {
  return MAP[pathname] ?? null;
}

/** Nova abertura do app só se a última atividade terminou há mais de 30 min. */
export const APP_OPEN_GAP_MS = 30 * 60 * 1000;
export function isNewAppOpen(lastActiveAt: number | null, now: number): boolean {
  return lastActiveAt === null || now - lastActiveAt > APP_OPEN_GAP_MS;
}
