export type NotificationTarget = "checkin" | "anamnese";

/**
 * Aviso de check-in ou de anamnese abre a tela certa (painel completo, com
 * fotos e medidas); o resto (dúvidas) é respondido no próprio sininho.
 */
export function notificationTarget(context: string): NotificationTarget | null {
  if (context === "Check-in") return "checkin";
  if (context === "Anamnese") return "anamnese";
  return null;
}
